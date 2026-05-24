from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models import Business, Agent
from ..agents.registry import AGENT_REGISTRY

router = APIRouter(prefix="/businesses", tags=["businesses"])


class BusinessCreate(BaseModel):
    name: str
    type: str = "shopify_dropshipping"
    shopify_domain: Optional[str] = None
    logo_emoji: str = "🏪"
    color: str = "#7c3aed"


class BusinessOut(BaseModel):
    id: int
    name: str
    slug: str
    type: str
    shopify_domain: Optional[str]
    logo_emoji: str
    color: str
    active: bool

    class Config:
        from_attributes = True


@router.get("/", response_model=list[BusinessOut])
async def list_businesses(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.active == True))
    return result.scalars().all()


@router.post("/", response_model=BusinessOut)
async def create_business(data: BusinessCreate, db: AsyncSession = Depends(get_db)):
    slug = data.name.lower().replace(" ", "-").replace("_", "-")
    existing = await db.execute(select(Business).where(Business.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Business with slug '{slug}' already exists")

    business = Business(
        name=data.name,
        slug=slug,
        type=data.type,
        shopify_domain=data.shopify_domain,
        logo_emoji=data.logo_emoji,
        color=data.color,
    )
    db.add(business)
    await db.flush()

    # Provision all 16 agents for this business
    for defn in AGENT_REGISTRY:
        agent = Agent(
            business_id=business.id,
            agent_id=defn["agent_id"],
            name=defn["name"],
            department=defn["department"],
            status="idle",
            next_run=defn.get("schedule"),
        )
        db.add(agent)

    await db.commit()
    await db.refresh(business)
    return business


@router.get("/{business_id}", response_model=BusinessOut)
async def get_business(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    return biz


@router.delete("/{business_id}")
async def delete_business(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    biz.active = False
    await db.commit()
    return {"ok": True}
