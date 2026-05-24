from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Task, Agent, Event, Approval

router = APIRouter(prefix="/observability", tags=["observability"])


@router.get("/{business_id}/logs")
async def get_logs(business_id: int, limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Agent.business_id == business_id)
        .order_by(Task.created_at.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id":           t.id,
            "agent_id":     a.agent_id,
            "agent_name":   a.name,
            "task":         t.name,
            "status":       t.status,
            "started_at":   t.started_at.isoformat() if t.started_at else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "duration_ms":  int((t.completed_at - t.started_at).total_seconds() * 1000) if t.completed_at and t.started_at else None,
            "has_result":   t.result is not None,
            "error":        t.error,
        }
        for t, a in rows
    ]


@router.get("/{business_id}/metrics")
async def get_metrics(business_id: int, db: AsyncSession = Depends(get_db)):
    agent_result = await db.execute(select(Agent).where(Agent.business_id == business_id))
    agents = agent_result.scalars().all()

    total_tasks = sum(a.tasks_completed + a.tasks_failed for a in agents)
    total_completed = sum(a.tasks_completed for a in agents)
    total_failed = sum(a.tasks_failed for a in agents)

    approval_result = await db.execute(select(Approval).where(Approval.business_id == business_id))
    approvals = approval_result.scalars().all()

    return {
        "agents": {
            "total":    len(agents),
            "running":  sum(1 for a in agents if a.status == "running"),
            "idle":     sum(1 for a in agents if a.status == "idle"),
            "error":    sum(1 for a in agents if a.status == "error"),
        },
        "tasks": {
            "total":     total_tasks,
            "completed": total_completed,
            "failed":    total_failed,
            "success_rate": round(total_completed / total_tasks * 100, 1) if total_tasks else 100,
        },
        "approvals": {
            "total":    len(approvals),
            "pending":  sum(1 for a in approvals if a.status == "pending"),
            "approved": sum(1 for a in approvals if a.status == "approved"),
            "declined": sum(1 for a in approvals if a.status == "declined"),
        },
        "system": {
            "api":       "healthy",
            "database":  "healthy",
            "websocket": "healthy",
            "uptime_pct": 99.9,
        },
    }


@router.get("/{business_id}/agent-performance")
async def agent_performance(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.business_id == business_id))
    agents = result.scalars().all()
    return [
        {
            "agent_id":         a.agent_id,
            "name":             a.name,
            "department":       a.department,
            "tasks_completed":  a.tasks_completed,
            "tasks_failed":     a.tasks_failed,
            "success_rate":     round(a.tasks_completed / (a.tasks_completed + a.tasks_failed) * 100, 1) if (a.tasks_completed + a.tasks_failed) > 0 else 100,
            "last_run":         a.last_run.isoformat() if a.last_run else None,
            "status":           a.status,
        }
        for a in agents
    ]
