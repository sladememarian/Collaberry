/**
 * Live board channel. Opens a WebSocket to presence-service (through Envoy),
 * keeps it warm with a heartbeat, auto-reconnects with backoff, and surfaces the
 * three things the UI cares about: who's here, who's typing, and which cards are
 * locked. Content changes (card.created / moved / …) come through as `event`
 * frames and are handed back via onEvent so the board can refetch or patch.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { WS_BASE } from "@/api/client";
import type { BoardChange, ClientFrame, PresenceUser, ServerFrame } from "@/types";

const HEARTBEAT_MS = 15_000;
const MAX_BACKOFF_MS = 15_000;

export interface LockState {
  [itemId: string]: { lockedBy: string | null; ttl: number };
}

interface Options {
  boardId: string | null;
  token: string | null;
  onEvent?: (change: BoardChange) => void;
}

export interface BoardSocket {
  connected: boolean;
  presence: PresenceUser[];
  typing: PresenceUser[];
  locks: LockState;
  send: (frame: ClientFrame) => void;
  lock: (itemId: string) => void;
  unlock: (itemId: string) => void;
  signalTyping: () => void;
}

export function useBoardSocket({ boardId, token, onEvent }: Options): BoardSocket {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [typing, setTyping] = useState<PresenceUser[]>([]);
  const [locks, setLocks] = useState<LockState>({});

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);
  const closedByUs = useRef(false);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const send = useCallback((frame: ClientFrame) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  }, []);

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = null;
    Object.values(typingTimers.current).forEach(clearTimeout);
    typingTimers.current = {};
  }, []);

  const connect = useCallback(() => {
    if (!boardId || !token) return;
    closedByUs.current = false;

    const url = `${WS_BASE}/ws/boards/${boardId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
      heartbeatRef.current = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);
    };

    ws.onmessage = (ev) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      handleFrame(frame);
    };

    ws.onclose = () => {
      setConnected(false);
      clearTimers();
      if (closedByUs.current) return;
      // Exponential backoff with a ceiling — don't hammer a downed gateway.
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** retryRef.current);
      retryRef.current += 1;
      setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();

    function handleFrame(frame: ServerFrame) {
      switch (frame.type) {
        case "presence":
          setPresence(frame.users);
          break;
        case "typing": {
          const u: PresenceUser = { user_id: frame.user_id, display_name: frame.display_name };
          setTyping((prev) =>
            prev.some((p) => p.user_id === u.user_id) ? prev : [...prev, u],
          );
          // Typing indicators are fire-and-forget; expire them locally.
          clearTimeout(typingTimers.current[u.user_id]);
          typingTimers.current[u.user_id] = setTimeout(() => {
            setTyping((prev) => prev.filter((p) => p.user_id !== u.user_id));
          }, 3500);
          break;
        }
        case "lock_result":
          setLocks((prev) => ({
            ...prev,
            [frame.item_id]: { lockedBy: frame.granted ? frame.locked_by : prev[frame.item_id]?.lockedBy ?? null, ttl: frame.ttl },
          }));
          break;
        case "lock_state":
          setLocks((prev) => ({
            ...prev,
            [frame.item_id]: { lockedBy: frame.locked_by, ttl: frame.ttl },
          }));
          break;
        case "board_event": {
          const ev = frame.event;
          onEventRef.current?.({
            eventType: ev.type,
            item: ev.payload,
            actorId: ev.actor_id,
            ts: ev.ts,
          });
          break;
        }
        case "pong":
        default:
          break;
      }
    }
  }, [boardId, token, send, clearTimers]);

  useEffect(() => {
    connect();
    return () => {
      closedByUs.current = true;
      clearTimers();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect, clearTimers]);

  const lock = useCallback((itemId: string) => send({ type: "lock", item_id: itemId }), [send]);
  const unlock = useCallback((itemId: string) => send({ type: "unlock", item_id: itemId }), [send]);

  // Throttle typing pings so we don't flood the socket on every keystroke.
  const lastTyping = useRef(0);
  const signalTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTyping.current > 1500) {
      lastTyping.current = now;
      send({ type: "typing" });
    }
  }, [send]);

  return { connected, presence, typing, locks, send, lock, unlock, signalTyping };
}
