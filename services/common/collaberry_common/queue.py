"""The durable job queue, carried over RabbitMQ.

Why this exists alongside Redis pub/sub: the two carry different kinds of
message and have opposite failure modes.

* **Redis pub/sub** (``events.py``) is fire-and-forget fan-out. A board event
  published while nobody is watching is simply dropped — correct, because the
  next client to open the board refetches the full state anyway. Delivery is
  at-most-once and that's fine.
* **This queue** carries work that must actually happen: create the notification
  row, send the deadline reminder. If notification-service is restarting when a
  mention is published, a dropped message means a notification the user never
  gets and no way to notice. RabbitMQ persists the message and redelivers it
  when a consumer comes back.

The topology, declared idempotently by both producers and consumers so neither
depends on start order:

    collaberry.jobs        (direct exchange, durable)
      └── jobs.notify      queue, durable  ← routing key "notify"
    collaberry.jobs.dlx    (direct exchange, durable)
      └── jobs.notify.dead queue, durable  ← messages that exhausted their retries

Retries use a per-message counter in the header rather than a delayed-message
plugin, so this works on stock RabbitMQ. A job that raises is nacked and
republished with an incremented count and a short backoff; once it passes
``amqp_max_retries`` it goes to the dead-letter queue instead of looping forever.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import aio_pika
import orjson
from aio_pika.abc import AbstractIncomingMessage, AbstractRobustConnection

from .settings import Settings

log = logging.getLogger(__name__)

JOBS_EXCHANGE = "collaberry.jobs"
DLX_EXCHANGE = "collaberry.jobs.dlx"

# Routing keys — one per job kind. Adding a kind means adding a key and a queue.
ROUTE_NOTIFY = "notify"

QUEUE_NOTIFY = "jobs.notify"
QUEUE_NOTIFY_DEAD = "jobs.notify.dead"

RETRY_HEADER = "x-collaberry-attempts"


async def connect(settings: Settings) -> AbstractRobustConnection:
    """Open a robust (auto-reconnecting) connection.

    ``connect_robust`` handles broker restarts transparently: consumers are
    re-declared and re-attached, so a RabbitMQ bounce doesn't require a service
    restart.
    """
    return await aio_pika.connect_robust(settings.amqp_url)


async def declare_topology(channel: aio_pika.abc.AbstractChannel) -> dict[str, Any]:
    """Declare exchanges and queues. Idempotent — safe to call from anywhere.

    Both the producer (workspace-service) and the consumer
    (notification-service) call this, so whichever starts first creates the
    topology and the other one no-ops. That removes the ordering dependency a
    consumer-only declaration would introduce.
    """
    jobs = await channel.declare_exchange(
        JOBS_EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
    )
    dlx = await channel.declare_exchange(
        DLX_EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
    )

    dead = await channel.declare_queue(QUEUE_NOTIFY_DEAD, durable=True)
    await dead.bind(dlx, routing_key=ROUTE_NOTIFY)

    notify = await channel.declare_queue(
        QUEUE_NOTIFY,
        durable=True,
        arguments={
            "x-dead-letter-exchange": DLX_EXCHANGE,
            "x-dead-letter-routing-key": ROUTE_NOTIFY,
        },
    )
    await notify.bind(jobs, routing_key=ROUTE_NOTIFY)

    return {"jobs": jobs, "dlx": dlx, "notify": notify, "dead": dead}


class JobPublisher:
    """Producer side. Held on app.state and reused for the process lifetime.

    One connection and channel per service — opening either per-message is the
    classic AMQP performance mistake (a channel is cheap, a connection is a TCP
    handshake plus AMQP negotiation).
    """

    def __init__(self, connection: AbstractRobustConnection) -> None:
        self._connection = connection
        self._channel: aio_pika.abc.AbstractChannel | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None
        self._lock = asyncio.Lock()

    @classmethod
    async def create(cls, settings: Settings) -> "JobPublisher":
        pub = cls(await connect(settings))
        await pub._ensure()
        return pub

    async def _ensure(self) -> aio_pika.abc.AbstractExchange:
        """Lazily open the channel and declare topology, once."""
        if self._exchange is not None:
            return self._exchange
        async with self._lock:
            if self._exchange is not None:  # another caller won the race
                return self._exchange
            self._channel = await self._connection.channel()
            topology = await declare_topology(self._channel)
            self._exchange = topology["jobs"]
            return self._exchange

    async def publish(self, routing_key: str, payload: dict, *, attempts: int = 0) -> None:
        """Enqueue a job. Persistent, so it survives a broker restart."""
        exchange = await self._ensure()
        message = aio_pika.Message(
            body=orjson.dumps(payload),
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            content_type="application/json",
            headers={RETRY_HEADER: attempts},
        )
        await exchange.publish(message, routing_key=routing_key)

    async def close(self) -> None:
        with contextlib.suppress(Exception):
            await self._connection.close()


Handler = Callable[[dict], Awaitable[None]]


class JobConsumer:
    """Consumer side, with bounded retries and a dead-letter escape hatch.

    A handler that raises does *not* lose the message: it is republished with an
    incremented attempt count after a short backoff. Once the count exceeds
    ``amqp_max_retries`` the message is rejected without requeue, which routes it
    to the dead-letter queue via the queue's DLX arguments. That way a job that
    is permanently broken (bad payload, deleted user) stops burning cycles but is
    still inspectable rather than silently gone.
    """

    def __init__(self, connection: AbstractRobustConnection, settings: Settings) -> None:
        self._connection = connection
        self._settings = settings
        self._channel: aio_pika.abc.AbstractChannel | None = None
        self._consumer_tag: str | None = None
        self._queue: aio_pika.abc.AbstractQueue | None = None
        self._exchange: aio_pika.abc.AbstractExchange | None = None

    @classmethod
    async def create(cls, settings: Settings) -> "JobConsumer":
        return cls(await connect(settings), settings)

    async def start(self, queue_name: str, routing_key: str, handler: Handler) -> None:
        """Attach ``handler`` to a queue and begin consuming."""
        self._channel = await self._connection.channel()
        # Without a prefetch limit one consumer would greedily buffer the whole
        # queue, which defeats round-robin across replicas and blows memory.
        await self._channel.set_qos(prefetch_count=self._settings.amqp_prefetch)

        topology = await declare_topology(self._channel)
        self._exchange = topology["jobs"]
        self._queue = topology["notify"] if queue_name == QUEUE_NOTIFY else (
            await self._channel.declare_queue(queue_name, durable=True)
        )

        async def on_message(message: AbstractIncomingMessage) -> None:
            attempts = int((message.headers or {}).get(RETRY_HEADER, 0) or 0)
            try:
                payload = orjson.loads(message.body)
            except orjson.JSONDecodeError:
                # Unparseable payload will never parse — straight to the DLQ,
                # no point spending retries on it.
                log.warning("job.malformed queue=%s", queue_name)
                await message.reject(requeue=False)
                return

            try:
                await handler(payload)
            except Exception:  # noqa: BLE001 — the whole point is to not die here
                if attempts >= self._settings.amqp_max_retries:
                    log.exception(
                        "job.dead queue=%s attempts=%d", queue_name, attempts
                    )
                    await message.reject(requeue=False)  # → DLX
                    return

                log.warning(
                    "job.retry queue=%s attempt=%d", queue_name, attempts + 1,
                    exc_info=True,
                )
                # Ack the original and republish a fresh copy carrying the higher
                # count. Backoff is applied before the republish so a hot failure
                # loop can't spin the broker.
                await message.ack()
                await asyncio.sleep(min(2 ** attempts, 8))
                assert self._exchange is not None
                await self._exchange.publish(
                    aio_pika.Message(
                        body=message.body,
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                        content_type="application/json",
                        headers={RETRY_HEADER: attempts + 1},
                    ),
                    routing_key=routing_key,
                )
                return

            await message.ack()

        self._consumer_tag = await self._queue.consume(on_message)

    async def close(self) -> None:
        with contextlib.suppress(Exception):
            if self._queue is not None and self._consumer_tag:
                await self._queue.cancel(self._consumer_tag)
        with contextlib.suppress(Exception):
            await self._connection.close()
