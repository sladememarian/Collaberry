FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY common /app/common
RUN pip install --no-cache-dir ./common

COPY notification/requirements.txt /app/notification/requirements.txt
RUN pip install --no-cache-dir -r /app/notification/requirements.txt

COPY notification /app/notification

EXPOSE 8000
CMD ["uvicorn", "notification.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
