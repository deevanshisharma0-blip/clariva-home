from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Metric, Approval, Task, Agent, Product, Event

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/{business_id}/kpis")
async def get_kpis(business_id: int, db: AsyncSession = Depends(get_db)):
    return {
        "revenue_24h": "$0.00",
        "revenue_7d": "$0.00",
        "orders_24h": 0,
        "orders_7d": 0,
        "cac": "—",
        "roas": "—",
        "cvr": "0%",
        "aov": "$229.00 CAD",
        "refund_rate": "0%",
        "sessions_24h": 0,
        "ad_spend_7d": "$0.00",
        "net_margin_7d": "$0.00",
        "gross_margin": "86%",
    }


@router.get("/{business_id}/revenue-trend")
async def revenue_trend(business_id: int, days: int = 7, db: AsyncSession = Depends(get_db)):
    return [
        {
            "date": (datetime.utcnow() - timedelta(days=days - 1 - i)).strftime("%b %d"),
            "revenue": 0,
            "orders": 0,
        }
        for i in range(days)
    ]


@router.get("/{business_id}/agent-activity")
async def agent_activity(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Agent.business_id == business_id)
        .order_by(Task.created_at.desc())
        .limit(20)
    )
    rows = result.all()
    return [
        {
            "id": t.id,
            "agent_id": a.agent_id,
            "agent_name": a.name,
            "task": t.name,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
            "duration_ms": (
                int((t.completed_at - t.started_at).total_seconds() * 1000)
                if t.completed_at and t.started_at else None
            ),
        }
        for t, a in rows
    ]


@router.get("/{business_id}/events")
async def get_events(business_id: int, limit: int = 30, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Event)
        .where(Event.business_id == business_id)
        .order_by(Event.created_at.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "type": e.event_type,
            "title": e.title,
            "body": e.body,
            "agent_id": e.agent_id,
            "causation_id": e.causation_id,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]


@router.get("/{business_id}/approvals-summary")
async def approvals_summary(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Approval).where(Approval.business_id == business_id).order_by(Approval.created_at.desc()).limit(5)
    )
    approvals = result.scalars().all()
    pending_result = await db.execute(
        select(func.count()).where(Approval.business_id == business_id, Approval.status == "pending")
    )
    pending_count = pending_result.scalar()
    return {
        "pending_count": pending_count,
        "recent": [
            {
                "id": a.id,
                "title": a.title,
                "risk_level": a.risk_level,
                "status": a.status,
                "created_at": a.created_at.isoformat(),
            }
            for a in approvals
        ],
    }


@router.get("/{business_id}/system-health")
async def system_health(business_id: int, db: AsyncSession = Depends(get_db)):
    agent_result = await db.execute(
        select(Agent).where(Agent.business_id == business_id)
    )
    agents = agent_result.scalars().all()
    running = sum(1 for a in agents if a.status == "running")
    errors = sum(1 for a in agents if a.status == "error")
    return {
        "status": "operational" if errors == 0 else "degraded",
        "agents_total": len(agents),
        "agents_running": running,
        "agents_error": errors,
        "database": "healthy",
        "api": "healthy",
    }
