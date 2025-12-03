FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential curl git unzip \
    && rm -rf /var/lib/apt/lists/*

RUN curl -s -L https://ngc.nvidia.com/downloads/ngccli_linux.zip -o /tmp/ngccli_linux.zip \
    && unzip /tmp/ngccli_linux.zip -d /tmp/ngccli \
    && mv /tmp/ngccli/ngc-cli/ngc /usr/local/bin/ngc \
    && chmod +x /usr/local/bin/ngc \
    && rm -rf /tmp/ngccli_linux.zip /tmp/ngccli

# Copy shared benchmark requirements alongside backend-specific ones so the
# relative include in backend/requirements.txt keeps working inside the image.
COPY requirements.txt /app/requirements.txt
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app /app/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
