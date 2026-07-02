FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app

COPY common /app/common
RUN pip install --no-cache-dir ./common

COPY workspace/requirements.txt /app/workspace/requirements.txt
RUN pip install --no-cache-dir -r /app/workspace/requirements.txt

COPY workspace /app/workspace

EXPOSE 8000
CMD ["uvicorn", "workspace.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
