"""Unified AI Task Hub — aggregates approvals, agent tasks, and AI briefing."""
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from ..database import get_db, AsyncSessionLocal
from ..models import Approval, Agent, Task, Business

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("/{business_id}")
async def get_task_hub(business_id: int, db: AsyncSession = Depends(get_db)):
    # Pending approvals
    ap_result = await db.execute(
        select(Approval)
        .where(Approval.business_id == business_id, Approval.status == "pending")
        .order_by(Approval.created_at.desc())
    )
    pending_approvals = [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "action_type": a.action_type,
            "risk_level": a.risk_level,
            "estimated_cost": a.estimated_cost,
            "forecast": a.forecast,
            "simulation": a.simulation,
            "created_at": a.created_at.isoformat(),
        }
        for a in ap_result.scalars().all()
    ]

    # Running agents
    run_result = await db.execute(
        select(Agent).where(Agent.business_id == business_id, Agent.status == "running")
    )
    running_agents = [
        {"id": a.id, "agent_id": a.agent_id, "name": a.name, "department": a.department}
        for a in run_result.scalars().all()
    ]

    # Recent task log (last 8 across all agents)
    task_result = await db.execute(
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Agent.business_id == business_id)
        .order_by(Task.created_at.desc())
        .limit(8)
    )
    recent_tasks = [
        {
            "id": t.id,
            "agent_name": a.name,
            "agent_id": a.agent_id,
            "task": t.name,
            "status": t.status,
            "result": t.result,
            "created_at": t.created_at.isoformat(),
        }
        for t, a in task_result.all()
    ]

    # Latest CEO briefing
    ceo_result = await db.execute(
        select(Agent).where(Agent.business_id == business_id, Agent.agent_id == "ceo")
    )
    ceo_agent = ceo_result.scalar_one_or_none()
    briefing = None
    briefing_updated_at = None
    if ceo_agent:
        last_task_result = await db.execute(
            select(Task)
            .where(Task.agent_id == ceo_agent.id, Task.status == "completed", Task.result.isnot(None))
            .order_by(Task.completed_at.desc())
            .limit(1)
        )
        last_task = last_task_result.scalar_one_or_none()
        if last_task and last_task.result:
            briefing = last_task.result
            briefing_updated_at = last_task.completed_at.isoformat() if last_task.completed_at else None

    # Stats
    all_agents_result = await db.execute(select(Agent).where(Agent.business_id == business_id))
    all_agents = all_agents_result.scalars().all()

    return {
        "pending_approvals": pending_approvals,
        "running_agents": running_agents,
        "recent_tasks": recent_tasks,
        "briefing": briefing,
        "briefing_updated_at": briefing_updated_at,
        "stats": {
            "pending_approvals": len(pending_approvals),
            "agents_running": len(running_agents),
            "agents_total": len(all_agents),
            "tasks_today": len([t for t in recent_tasks if t["status"] == "completed"]),
        },
    }


@router.post("/{business_id}/refresh-briefing")
async def refresh_briefing(business_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Trigger a new CEO agent run to refresh the AI briefing."""
    biz_result = await db.execute(select(Business).where(Business.id == business_id))
    biz = biz_result.scalar_one_or_none()
    if not biz:
        return {"ok": False, "error": "Business not found"}

    background_tasks.add_task(_run_briefing, business_id, biz.name)
    return {"ok": True, "message": "Briefing refresh started — check back in ~2 minutes"}


async def _run_briefing(business_id: int, business_name: str) -> None:
    from ..database import AsyncSessionLocal
    from ..agents.orchestrator import run_agent_task

    async with AsyncSessionLocal() as session:
        agent_result = await session.execute(
            select(Agent).where(Agent.business_id == business_id, Agent.agent_id == "ceo")
        )
        agent = agent_result.scalar_one_or_none()
        if not agent:
            return

        task = Task(
            agent_id=agent.id,
            name=f"Daily briefing — {datetime.utcnow().strftime('%b %d %Y')}",
            status="running",
            started_at=datetime.utcnow(),
        )
        session.add(task)
        agent.status = "running"
        await session.commit()
        await session.refresh(task)

        try:
            result = await run_agent_task("ceo", task.name, {
                "business": business_name,
                "date": datetime.utcnow().strftime("%Y-%m-%d"),
                "stage": "operations",
            })
            task.result = result
            task.status = "completed"
            task.completed_at = datetime.utcnow()
            agent.status = "idle"
            agent.tasks_completed += 1
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            agent.status = "idle"

        await session.commit()
