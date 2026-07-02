FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY common /app/common
RUN pip install --no-cache-dir ./common

COPY presence/requirements.txt /app/presence/requirements.txt
RUN pip install --no-cache-dir -r /app/presence/requirements.txt

COPY presence /app/presence

EXPOSE 8000
CMD ["uvicorn", "presence.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
