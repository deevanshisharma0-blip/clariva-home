from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from ..database import get_db, AsyncSessionLocal
from ..models import Approval, Business
from .ws import broadcast

router = APIRouter(prefix="/approvals", tags=["approvals"])


class ApprovalCreate(BaseModel):
    business_id: int
    title: str
    description: str
    action_type: str
    risk_level: str = "medium"
    estimated_cost: str = "$0.00"
    forecast: str = ""
    payload: Optional[dict] = None
    simulation: Optional[dict] = None


class ApprovalDecide(BaseModel):
    decision: str  # "approved" | "declined" | "revision"
    note: Optional[str] = None


class ApprovalOut(BaseModel):
    id: int
    business_id: int
    title: str
    description: str
    action_type: str
    risk_level: str
    estimated_cost: str
    forecast: str
    status: str
    payload: Optional[dict]
    simulation: Optional[dict]
    decision_note: Optional[str]
    created_at: datetime
    decided_at: Optional[datetime]
    execution_status: Optional[str] = None
    execution_result: Optional[dict] = None
    executed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


async def _run_executor(approval_id: int) -> None:
    from ..executors.router import execute_approval
    async with AsyncSessionLocal() as session:
        await execute_approval(approval_id, session)


@router.get("/{business_id}", response_model=list[ApprovalOut])
async def list_approvals(business_id: int, status: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Approval).where(Approval.business_id == business_id)
    if status:
        query = query.where(Approval.status == status)
    query = query.order_by(Approval.created_at.desc()).limit(50)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/pending/count")
async def pending_count(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Approval).where(Approval.business_id == business_id, Approval.status == "pending")
    )
    return {"count": len(result.scalars().all())}


@router.post("/", response_model=ApprovalOut)
async def create_approval(data: ApprovalCreate, db: AsyncSession = Depends(get_db)):
    approval = Approval(**data.model_dump())
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    await broadcast({"event": "approval.created", "approval_id": approval.id, "title": approval.title})

    # Email alert for medium+ risk approvals
    if approval.risk_level in ("medium", "high", "critical"):
        biz_r = await db.execute(select(Business).where(Business.id == approval.business_id))
        biz = biz_r.scalar_one_or_none()
        if biz:
            import asyncio
            asyncio.create_task(_send_approval_email(approval, biz.name))

    return approval


@router.post("/{approval_id}/decide", response_model=ApprovalOut)
async def decide_approval(
    approval_id: int,
    data: ApprovalDecide,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status != "pending":
        raise HTTPException(400, f"Approval already {approval.status}")

    valid = {"approved", "declined", "revision"}
    if data.decision not in valid:
        raise HTTPException(400, f"Decision must be one of {valid}")

    approval.status = data.decision
    approval.decision_note = data.note
    approval.decided_at = datetime.utcnow()
    await db.commit()
    await db.refresh(approval)

    await broadcast({
        "event": f"approval.{data.decision}",
        "approval_id": approval_id,
        "title": approval.title,
    })

    if data.decision == "approved":
        background_tasks.add_task(_run_executor, approval_id)

    return approval


# Fire approval alert email for medium/high/critical risk new approvals
async def _send_approval_email(approval: Approval, biz_name: str) -> None:
    try:
        from ..services.email import send_approval_alert
        await send_approval_alert(
            business_name=biz_name,
            approval_title=approval.title,
            action_type=approval.action_type,
            risk_level=approval.risk_level,
            estimated_cost=approval.estimated_cost,
            forecast=approval.forecast,
        )
    except Exception:
        pass

    # Slack alert
    try:
        from ..services.slack import alert_approval
        await alert_approval(
            business_name=biz_name,
            title=approval.title,
            action_type=approval.action_type,
            risk_level=approval.risk_level,
            estimated_cost=approval.estimated_cost,
            forecast=approval.forecast,
            approval_id=approval.id,
        )
    except Exception:
        pass


@router.post("/{approval_id}/recall", response_model=ApprovalOut)
async def recall_approval(approval_id: int, db: AsyncSession = Depends(get_db)):
    """Recall an approved or declined decision — resets it back to pending."""
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval not found")
    if approval.status == "pending":
        raise HTTPException(400, "Approval is already pending")

    approval.status = "pending"
    approval.decision_note = None
    approval.decided_at = None
    approval.execution_status = None
    approval.execution_result = None
    approval.executed_at = None
    await db.commit()
    await db.refresh(approval)

    await broadcast({
        "event": "approval.recalled",
        "approval_id": approval_id,
        "title": approval.title,
    })
    return approval


@router.get("/item/{approval_id}", response_model=ApprovalOut)
async def get_approval(approval_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        raise HTTPException(404, "Approval not found")
    return approval
