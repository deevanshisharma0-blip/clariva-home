from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from ..database import get_db
from ..models import Agent, Task, Business
from ..agents.orchestrator import run_agent_task
from .ws import broadcast

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentOut(BaseModel):
    id: int
    business_id: int
    agent_id: str
    name: str
    department: str
    status: str
    last_run: Optional[datetime]
    next_run: Optional[str]
    tasks_completed: int
    tasks_failed: int
    load: int

    class Config:
        from_attributes = True


class TaskOut(BaseModel):
    id: int
    agent_id: int
    name: str
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    result: Optional[dict]
    error: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class RunAgentRequest(BaseModel):
    task_name: str
    context: Optional[dict] = None


@router.get("/{business_id}", response_model=list[AgentOut])
async def list_agents(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Agent).where(Agent.business_id == business_id))
    return result.scalars().all()


@router.get("/{business_id}/{agent_id}/tasks", response_model=list[TaskOut])
async def get_agent_tasks(business_id: int, agent_id: str, db: AsyncSession = Depends(get_db)):
    agent_result = await db.execute(
        select(Agent).where(Agent.business_id == business_id, Agent.agent_id == agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")

    tasks_result = await db.execute(
        select(Task).where(Task.agent_id == agent.id).order_by(Task.created_at.desc()).limit(20)
    )
    return tasks_result.scalars().all()


@router.post("/{business_id}/{agent_id}/run")
async def run_agent(
    business_id: int,
    agent_id: str,
    req: RunAgentRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    agent_result = await db.execute(
        select(Agent).where(Agent.business_id == business_id, Agent.agent_id == agent_id)
    )
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(404, "Agent not found")

    task = Task(
        agent_id=agent.id,
        name=req.task_name,
        status="running",
        started_at=datetime.utcnow(),
    )
    db.add(task)
    agent.status = "running"
    agent.load = 75
    await db.commit()
    await db.refresh(task)

    await broadcast({
        "event": "agent.started",
        "agent_id": agent_id,
        "business_id": business_id,
        "task": req.task_name,
    })

    background_tasks.add_task(
        _execute_agent_task, agent.id, agent_id, task.id, req.task_name, req.context or {}, business_id
    )

    return {"task_id": task.id, "status": "running"}


async def _execute_agent_task(
    db_agent_id: int, agent_id: str, task_id: int, task_name: str, context: dict, business_id: int
):
    from ..database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            result = await run_agent_task(agent_id, task_name, context)

            task_result = await db.execute(select(Task).where(Task.id == task_id))
            task = task_result.scalar_one_or_none()
            if task:
                task.status = "completed"
                task.completed_at = datetime.utcnow()
                task.result = result

            agent_result = await db.execute(select(Agent).where(Agent.id == db_agent_id))
            agent = agent_result.scalar_one_or_none()
            if agent:
                agent.status = "idle"
                agent.last_run = datetime.utcnow()
                agent.load = 0
                agent.tasks_completed += 1

            await db.commit()

            await broadcast({
                "event": "agent.completed",
                "agent_id": agent_id,
                "business_id": business_id,
                "task": task_name,
                "result": result,
            })

        except Exception as e:
            task_result = await db.execute(select(Task).where(Task.id == task_id))
            task = task_result.scalar_one_or_none()
            if task:
                task.status = "failed"
                task.error = str(e)
                task.completed_at = datetime.utcnow()

            agent_result = await db.execute(select(Agent).where(Agent.id == db_agent_id))
            agent = agent_result.scalar_one_or_none()
            if agent:
                agent.status = "error"
                agent.load = 0
                agent.tasks_failed += 1

            await db.commit()
            await broadcast({"event": "agent.failed", "agent_id": agent_id, "error": str(e)})
