FROM python:3.12-slim

WORKDIR /app

# Python dependencies
COPY apps/api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy full app (includes pre-built apps/web/out/)
COPY . .

# Keep a data dir for SQLite fallback
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
