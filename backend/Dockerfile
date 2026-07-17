FROM python:3.11-slim

# Faster + cleaner Python container behavior
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# System deps needed by Pillow (image validation) + healthcheck (urllib is stdlib but curl helps debugging)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libjpeg-dev \
        zlib1g-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install python deps first for better layer caching
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy source last so code edits don't invalidate the deps layer
COPY . .

# Local storage dir (matches STORAGE_TYPE=filesystem default in docker-compose)
RUN mkdir -p /app/uploads

EXPOSE 8001

# `--reload` for a great dev experience. In production, drop `--reload` and
# consider `--workers 4` behind Nginx / a reverse proxy.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]
