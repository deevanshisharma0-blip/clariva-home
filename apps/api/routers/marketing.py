from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Approval
from ..agents.orchestrator import run_agent_task

router = APIRouter(prefix="/marketing", tags=["marketing"])


@router.get("/{business_id}/overview")
async def marketing_overview(business_id: int):
    return {
        "total_spend_7d": 0,
        "total_revenue_7d": 0,
        "blended_roas": 0,
        "active_campaigns": 0,
        "platforms": {
            "meta":   {"spend": 0, "roas": 0, "cac": 0, "status": "not_configured"},
            "tiktok": {"spend": 0, "roas": 0, "cac": 0, "status": "not_configured"},
            "google": {"spend": 0, "roas": 0, "cac": 0, "status": "not_configured"},
        },
    }


@router.get("/{business_id}/campaigns")
async def list_campaigns(business_id: int):
    return []


@router.get("/{business_id}/creative-performance")
async def creative_performance(business_id: int):
    return [
        {"id": "LMR-H001", "hook": "I used this LED mask for 10 min a day for 30 days", "platform": "TikTok",      "status": "ready", "roas": 0, "ctr": 0, "views": 0, "spend": 0},
        {"id": "LMR-H002", "hook": "Dermatologists love this one (not-so-weird) trick",   "platform": "Meta+TikTok", "status": "ready", "roas": 0, "ctr": 0, "views": 0, "spend": 0},
        {"id": "LMR-H003", "hook": "The $299 device replacing $1,200 clinic visits",       "platform": "Meta+TikTok", "status": "ready", "roas": 0, "ctr": 0, "views": 0, "spend": 0},
        {"id": "LMR-H004", "hook": "POV: what red light therapy does to your skin",        "platform": "TikTok",      "status": "ready", "roas": 0, "ctr": 0, "views": 0, "spend": 0},
        {"id": "LMR-H005", "hook": "Why is everyone buying this LED face mask?",            "platform": "Meta",        "status": "ready", "roas": 0, "ctr": 0, "views": 0, "spend": 0},
    ]


@router.post("/{business_id}/propose-campaign")
async def propose_campaign(
    business_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    background_tasks.add_task(_propose, business_id, db)
    return {"status": "generating", "message": "Marketing agent is building campaign proposal"}


async def _propose(business_id: int, db: AsyncSession):
    from ..database import AsyncSessionLocal
    result = await run_agent_task("marketing", "Propose Phase 1 TikTok + Meta campaign", {"business_id": business_id, "budget": "$5/day CAD"})
    async with AsyncSessionLocal() as session:
        approval = Approval(
            business_id=business_id,
            title=f"Launch {result.get('campaign_plan', {}).get('platform', 'TikTok')} campaign — ${result.get('campaign_plan', {}).get('budget_daily', '5')}/day",
            description=f"AI-proposed campaign. Expected ROAS: {result.get('expected_roas', 2.5)}x. Creatives needed: {', '.join(result.get('creative_needs', ['Hook videos'])[:3])}.",
            action_type="ad_launch",
            risk_level="high",
            estimated_cost=f"${result.get('campaign_plan', {}).get('budget_daily', '5')}/day CAD",
            forecast=f"Expected ROAS {result.get('expected_roas', 2.5)}x after 7-day learning phase.",
            simulation=result,
        )
        session.add(approval)
        await session.commit()
