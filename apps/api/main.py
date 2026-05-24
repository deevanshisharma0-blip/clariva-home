"""NexusOS — Autonomous Commerce Intelligence Platform API"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .config import settings
from .database import init_db
from .routers import agents, approvals, analytics, businesses, products, creative, ws, marketing, finance, workflows, observability, tasks, flow
from .routers import settings as settings_router
from .services.seed import seed_demo_data
from .services.scheduler import start as start_scheduler, stop as stop_scheduler

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("nexus")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("NexusOS API starting up…")
    await init_db()
    await seed_demo_data()
    start_scheduler()
    log.info("NexusOS API ready — autonomous agents active.")
    yield
    stop_scheduler()
    log.info("NexusOS API shutting down.")


app = FastAPI(
    title="NexusOS API",
    description="Autonomous Commerce Intelligence Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes
app.include_router(ws.router)
app.include_router(businesses.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(approvals.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(creative.router, prefix="/api")
app.include_router(marketing.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(observability.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(flow.router, prefix="/api")


@app.get("/api/status")
async def status():
    return {
        "status": "operational",
        "app": "NexusOS",
        "version": "1.0.0",
        "agents": 16,
    }


# Serve Next.js static build if present
static_dir = Path(__file__).parent.parent.parent / "apps" / "web" / "out"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
