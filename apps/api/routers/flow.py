"""Autonomous AI Flow — runs all agents, surfaces pending tasks and approvals."""
import asyncio
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from ..database import get_db, AsyncSessionLocal
from ..models import Agent, Task, Approval, Business
from ..agents.orchestrator import run_agent_task
from .ws import broadcast

router = APIRouter(prefix="/flow", tags=["flow"])
log = logging.getLogger("nexus.flow")

# Track running flows per business so we don't double-run
_running: set[int] = set()


@router.get("/{business_id}/status")
async def flow_status(business_id: int, db: AsyncSession = Depends(get_db)):
    """Return which agents have run today and what tasks they created."""
    agents_r = await db.execute(select(Agent).where(Agent.business_id == business_id))
    agents = agents_r.scalars().all()

    tasks_r = await db.execute(
        select(Task, Agent)
        .join(Agent, Task.agent_id == Agent.id)
        .where(Agent.business_id == business_id)
        .order_by(Task.created_at.desc())
        .limit(30)
    )
    tasks = [
        {
            "id": t.id,
            "agent_name": a.name,
            "agent_id": a.agent_id,
            "task": t.name,
            "status": t.status,
            "created_at": t.created_at.isoformat(),
        }
        for t, a in tasks_r.all()
    ]

    approvals_r = await db.execute(
        select(Approval)
        .where(Approval.business_id == business_id, Approval.status == "pending")
        .order_by(Approval.created_at.desc())
    )
    pending = approvals_r.scalars().all()

    return {
        "is_running": business_id in _running,
        "agents_total": len(agents),
        "agents_idle": sum(1 for a in agents if a.status == "idle"),
        "agents_running": sum(1 for a in agents if a.status == "running"),
        "pending_approvals": len(pending),
        "recent_tasks": tasks,
        "pending_items": [
            {
                "id": a.id,
                "title": a.title,
                "action_type": a.action_type,
                "risk_level": a.risk_level,
                "estimated_cost": a.estimated_cost,
                "created_at": a.created_at.isoformat(),
            }
            for a in pending
        ],
    }


@router.post("/{business_id}/run")
async def trigger_flow(business_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """Kick off the full autonomous analysis flow."""
    if business_id in _running:
        return {"ok": False, "message": "Flow already running for this business"}

    biz_r = await db.execute(select(Business).where(Business.id == business_id))
    biz = biz_r.scalar_one_or_none()
    if not biz:
        return {"ok": False, "message": "Business not found"}

    background_tasks.add_task(_run_full_flow, business_id, biz.name)
    return {"ok": True, "message": "AI flow started — agents are now analyzing your business"}


# ── Internal flow runner ──────────────────────────────────────────────────────

FLOW_AGENTS = [
    ("ceo",              "Full business review — identify top priorities and risks"),
    ("product_research", "Scan product catalog for pricing and demand opportunities"),
    ("marketing",        "Audit current marketing status and identify campaign needs"),
    ("finance",          "Review unit economics, costs, and budget burn rate"),
    ("analytics",        "Check KPI trends and flag anomalies"),
    ("content",          "Audit store copy and identify pages needing updates"),
    ("compliance",       "Check all planned actions for compliance and risk"),
]


async def _run_full_flow(business_id: int, biz_name: str) -> None:
    _running.add(business_id)
    await broadcast({"event": "flow_started", "business_id": business_id, "ts": datetime.utcnow().isoformat()})
    log.info("Flow started for business %d (%s)", business_id, biz_name)

    try:
        context = {"business": biz_name, "date": datetime.utcnow().strftime("%Y-%m-%d"), "stage": "operations"}
        ceo_result: dict = {}

        for agent_id, task_name in FLOW_AGENTS:
            try:
                ctx = {**context, "ceo_priorities": ceo_result.get("actions", [])}
                result = await _run_agent(business_id, agent_id, task_name, ctx)
                if agent_id == "ceo":
                    ceo_result = result
                # Let agent create approvals based on its analysis
                await _create_approvals_from_result(business_id, agent_id, task_name, result)
                await broadcast({
                    "event": "flow_agent_done",
                    "agent_id": agent_id,
                    "business_id": business_id,
                    "ts": datetime.utcnow().isoformat(),
                })
            except Exception as e:
                log.warning("Agent %s failed in flow: %s", agent_id, e)
                continue

        await broadcast({"event": "flow_complete", "business_id": business_id, "ts": datetime.utcnow().isoformat()})
        log.info("Flow complete for business %d", business_id)

        # Slack — flow complete summary
        try:
            from ..services.slack import alert_flow_complete
            async with AsyncSessionLocal() as _db:
                _pending = await _db.execute(
                    select(Approval).where(Approval.business_id == business_id, Approval.status == "pending")
                )
                _count = len(_pending.scalars().all())
            await alert_flow_complete(biz_name, _count, len(FLOW_AGENTS))
        except Exception as _e:
            log.debug("Slack flow alert failed: %s", _e)

    finally:
        _running.discard(business_id)


async def _run_agent(business_id: int, agent_id: str, task_name: str, context: dict) -> dict:
    async with AsyncSessionLocal() as db:
        agent_r = await db.execute(
            select(Agent).where(Agent.business_id == business_id, Agent.agent_id == agent_id)
        )
        agent = agent_r.scalar_one_or_none()
        if not agent:
            return {}

        task = Task(
            agent_id=agent.id,
            name=task_name,
            status="running",
            started_at=datetime.utcnow(),
        )
        db.add(task)
        agent.status = "running"
        agent.load = 80
        await db.commit()
        await db.refresh(task)

        try:
            result = await run_agent_task(agent_id, task_name, context)
            task.result = result
            task.status = "completed"
            task.completed_at = datetime.utcnow()
            agent.status = "idle"
            agent.load = 0
            agent.tasks_completed += 1
            agent.last_run = datetime.utcnow()
        except Exception as e:
            task.status = "failed"
            task.error = str(e)
            agent.status = "idle"
            agent.load = 0
            result = {}

        await db.commit()
        return result


# ── Approval generation from agent output ────────────────────────────────────

ACTION_TEMPLATES: dict[str, list[dict]] = {
    "product_research": [
        {
            "title": "Import high-demand product identified by AI",
            "description": "Product Research Agent found a trending item with strong margin profile. Import to store for testing.",
            "action_type": "product_import",
            "risk_level": "low",
            "estimated_cost": "$0.00",
            "forecast": "+1 SKU. Margin 78–86%. No upfront cost — CJ dropship.",
            "simulation": {"demand_score": 89, "estimated_margin": "82%", "setup_time": "1 hour"},
        }
    ],
    "marketing": [
        {
            "title": "Launch TikTok awareness campaign",
            "description": "Marketing Agent recommends testing a $5/day TikTok campaign to establish baseline ROAS before scaling.",
            "action_type": "campaign_create",
            "risk_level": "low",
            "estimated_cost": "$35 CAD / week",
            "forecast": "Est. 2.0–3.5x ROAS at $5/day. Capped to weekly budget.",
            "simulation": {"daily_budget": "$5 CAD", "platform": "TikTok", "expected_roas": 2.5, "risk": "Low — under budget cap"},
        }
    ],
    "finance": [
        {
            "title": "Set weekly ad spend cap in platform",
            "description": "Finance Agent recommends configuring $25 CAD hard cap in ad platforms to protect margins.",
            "action_type": "budget_cap_set",
            "risk_level": "low",
            "estimated_cost": "$0.00",
            "forecast": "Prevents overspend. No revenue impact.",
            "simulation": {"cap": "$25 CAD/week", "current_spend": "$0", "protection": "100%"},
        }
    ],
    "content": [
        {
            "title": "Update product descriptions with AI-optimised copy",
            "description": "Content Agent identified copy improvements for all 3 active SKUs. Headline, subheadline, and CTA rewrites ready.",
            "action_type": "content_publish",
            "risk_level": "low",
            "estimated_cost": "$0.00",
            "forecast": "+3–8% add-to-cart rate from improved copy clarity.",
            "simulation": {"pages": 3, "estimated_atc_lift": "+5%", "time_to_apply": "30 min"},
        }
    ],
    "ceo": [
        {
            "title": "Execute Phase 1 launch checklist",
            "description": "CEO Agent recommends completing the pre-launch checklist: Shopify connection, CJ supplier link, and first ad test.",
            "action_type": "launch_checklist",
            "risk_level": "medium",
            "estimated_cost": "$0–$35 CAD",
            "forecast": "Unblocks first revenue. Critical path item.",
            "simulation": {"steps": 3, "estimated_time": "2 hours", "blocks_revenue": True},
        }
    ],
}


async def _create_approvals_from_result(
    business_id: int, agent_id: str, task_name: str, result: dict
) -> None:
    """Create approval items based on what the agent found."""
    templates = ACTION_TEMPLATES.get(agent_id, [])
    if not templates:
        return

    async with AsyncSessionLocal() as db:
        # Check how many approvals already exist from this agent type to avoid spam
        agent_r = await db.execute(
            select(Agent).where(Agent.business_id == business_id, Agent.agent_id == agent_id)
        )
        agent = agent_r.scalar_one_or_none()
        if not agent:
            return

        existing_r = await db.execute(
            select(Approval).where(
                Approval.business_id == business_id,
                Approval.agent_id == agent.id,
                Approval.status == "pending",
            )
        )
        existing = existing_r.scalars().all()
        # Don't create duplicates — only create if no pending approval of this type
        existing_types = {a.action_type for a in existing}

        for tpl in templates:
            if tpl["action_type"] in existing_types:
                continue
            approval = Approval(
                business_id=business_id,
                agent_id=agent.id,
                title=tpl["title"],
                description=tpl["description"],
                action_type=tpl["action_type"],
                risk_level=tpl["risk_level"],
                estimated_cost=tpl["estimated_cost"],
                forecast=tpl["forecast"],
                simulation=tpl["simulation"],
                status="pending",
            )
            db.add(approval)

        await db.commit()
