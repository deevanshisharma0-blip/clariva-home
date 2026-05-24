from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from ..database import get_db
from ..models import Creative
from ..agents.orchestrator import run_agent_task

router = APIRouter(prefix="/creative", tags=["creative"])


class CreativeCreate(BaseModel):
    business_id: int
    hook: str
    platform: str
    creative_type: str = "script"


class CreativeOut(BaseModel):
    id: int
    business_id: int
    hook: str
    platform: str
    creative_type: str
    status: str
    roas: float
    cac: float
    views: int
    content: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/{business_id}", response_model=list[CreativeOut])
async def list_creatives(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Creative).where(Creative.business_id == business_id).order_by(Creative.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=CreativeOut)
async def create_creative(data: CreativeCreate, db: AsyncSession = Depends(get_db)):
    creative = Creative(**data.model_dump())
    db.add(creative)
    await db.commit()
    await db.refresh(creative)
    return creative


@router.post("/{business_id}/generate")
async def generate_creative(
    business_id: int,
    background_tasks: BackgroundTasks,
    prompt: str = "Generate 3 TikTok hooks for our hero product",
    db: AsyncSession = Depends(get_db),
):
    background_tasks.add_task(_generate, business_id, prompt)
    return {"status": "generating", "message": "Creative generation started"}


async def _generate(business_id: int, prompt: str):
    from ..database import AsyncSessionLocal
    result = await run_agent_task("content", prompt, {"business_id": business_id})
    hooks = result.get("hooks", [])
    async with AsyncSessionLocal() as db:
        for hook in hooks:
            creative = Creative(
                business_id=business_id,
                hook=hook,
                platform="TikTok",
                creative_type="script",
                status="ready",
                content=result.get("copy", {}).get("body", ""),
            )
            db.add(creative)
        await db.commit()
