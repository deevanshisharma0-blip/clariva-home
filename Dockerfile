FROM python:3.12-slim

WORKDIR /app

# ── System dependencies ────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Copy source ────────────────────────────────────────────────────────────────
COPY . .

# ── Python dependencies ────────────────────────────────────────────────────────
RUN pip install --no-cache-dir -r apps/api/requirements.txt

# ── Build Next.js frontend (static export → apps/web/out/) ────────────────────
WORKDIR /app/apps/web
RUN npm ci && npm run build

# ── Back to app root ───────────────────────────────────────────────────────────
WORKDIR /app

# Keep a data dir for any SQLite fallback / local dev
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
