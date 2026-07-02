# Build context is ./services so we can pull in the shared `common` package.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

# Shared library first — it changes least, so the layer caches well.
COPY common /app/common
RUN pip install --no-cache-dir ./common

COPY auth/requirements.txt /app/auth/requirements.txt
RUN pip install --no-cache-dir -r /app/auth/requirements.txt

COPY auth /app/auth

EXPOSE 8000
CMD ["uvicorn", "auth.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
