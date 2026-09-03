# One parametrized Dockerfile for all four services. Build context is
# ./services so we can pull in the shared `common` package.
#
#   build args: SERVICE=auth|workspace|presence|notification  (set in compose)
#
# The shared library is copied first — it changes least, so the layer caches well.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

ARG SERVICE
ENV SERVICE=${SERVICE}

COPY common /app/common
RUN pip install --no-cache-dir -e ./common

COPY ${SERVICE}/requirements.txt /app/${SERVICE}/requirements.txt
RUN pip install --no-cache-dir -r /app/${SERVICE}/requirements.txt

COPY ${SERVICE} /app/${SERVICE}

EXPOSE 8000
# Shell form so ${SERVICE} expands at container start (exec form wouldn't).
CMD uvicorn ${SERVICE}.app.main:app --host 0.0.0.0 --port 8000
