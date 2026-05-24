# NexusOS — Cloud Deployment Guide

## Architecture
- **Backend**: FastAPI (Python) + APScheduler
- **Frontend**: Next.js 15 static export (served by FastAPI)
- **Database**: Supabase (PostgreSQL, ca-central-1, FREE)
- **Deploy target**: Railway.app
- **Notifications**: Slack Incoming Webhooks

---

## Step 1 — Add Supabase DB Password

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → Project `qjclbnbzntdxfjuomdwr`
2. **Settings** → **Database** → **Connection string** → copy password
3. Edit `.env`:
   ```
   DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@db.qjclbnbzntdxfjuomdwr.supabase.co:5432/postgres
   ```

---

## Step 2 — Set Up Slack Notifications (5 min)

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
   - Name: `NexusOS` | Workspace: your workspace
2. Click **Incoming Webhooks** → toggle **ON**
3. Click **Add New Webhook to Workspace** → select `#nexusos-alerts` → Allow
   - Copy the webhook URL → paste as `SLACK_WEBHOOK_ALERTS` in `.env`
4. Repeat → select `#nexusos-daily-briefing`
   - Copy URL → paste as `SLACK_WEBHOOK_BRIEFING` in `.env`

---

## Step 3 — Deploy to Railway

### Option A: Deploy from GitHub (recommended)

```bash
# In C:\Users\deeva\NexusOS
git init
git add .
git commit -m "Initial NexusOS deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/nexusos.git
git push -u origin main
```

Then:
1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Select your `nexusos` repo
3. Railway auto-detects `railway.json` and uses the Dockerfile

### Option B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Environment Variables on Railway

In Railway dashboard → your project → **Variables**, add:

```
DATABASE_URL        = postgresql+asyncpg://postgres:PWD@db.qjclbnbzntdxfjuomdwr.supabase.co:5432/postgres
SLACK_WEBHOOK_ALERTS    = https://hooks.slack.com/services/...
SLACK_WEBHOOK_BRIEFING  = https://hooks.slack.com/services/...
ANTHROPIC_API_KEY   = sk-ant-...   (optional — Ollama not available on Railway)
CJ_API_EMAIL        = 
CJ_API_KEY          = 
IONOS_SMTP_EMAIL    = 
IONOS_SMTP_PASSWORD = 
IONOS_DIGEST_RECIPIENT = info.vereine@gmail.com
IONOS_API_PREFIX    = 
IONOS_API_SECRET    = 
DEBUG               = false
NEXT_PUBLIC_API_URL = https://YOUR-APP.railway.app
```

> **NEXT_PUBLIC_API_URL** — set this to your Railway deployment URL so the frontend
> hits the right API endpoint. Get it after first deploy from Railway dashboard.

---

## Step 4 — Verify Deployment

Once Railway shows ✅ Deployed:

1. Open `https://YOUR-APP.railway.app` — you should see the NexusOS dashboard
2. Open `https://YOUR-APP.railway.app/api/status` — should return `{"status": "operational"}`
3. LUMERA LED Masks should appear with 16 agents and 3 pending approvals
4. Slack: within 30 seconds of first AI flow run you should see a message in #nexusos-alerts

---

## Local Development

```bash
# Terminal 1 — Backend
cd C:\Users\deeva\NexusOS
pip install -r apps/api/requirements.txt
uvicorn apps.api.main:app --reload --port 8000

# Terminal 2 — Frontend  
cd apps/web
npm install
npm run dev
```

Frontend: http://localhost:3000
Backend: http://localhost:8000/api/status
