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


# ── Agent Chat ────────────────────────────────────────────────────────────────

AGENT_PERSONAS: dict[str, dict] = {
    "ceo": {"name": "Alex — CEO Agent", "role": "Chief Executive Officer",
            "intro": "I oversee the overall strategy and KPIs for LUMÈRA. I can help you set goals, prioritize initiatives, and understand the business health."},
    "marketing": {"name": "Maya — Marketing Agent", "role": "Marketing Operator",
                  "intro": "I run campaigns on Meta, TikTok, and Google. Tell me your budget, goals, or audience and I'll design the strategy."},
    "product_research": {"name": "Riley — Product Research", "role": "Product Intelligence",
                         "intro": "I find winning products on CJ Dropshipping and analyze market trends. Ask me about new products, competitors, or demand forecasts."},
    "supplier": {"name": "Sam — Supplier Agent", "role": "Supply Chain Manager",
                 "intro": "I manage the CJ Dropshipping pipeline. Ask me about order status, supplier reliability, or fulfillment issues."},
    "analytics": {"name": "Dana — Analytics Agent", "role": "Business Intelligence",
                  "intro": "I track revenue, ROAS, conversion rates, and product performance. Ask me about any KPI or business metric."},
    "finance": {"name": "Morgan — Finance Agent", "role": "Chief Financial Officer",
                "intro": "I monitor cash flow, unit economics, and profitability. Ask me about margins, break-even, or financial forecasts."},
    "content": {"name": "Jamie — Content Agent", "role": "Content & Copywriter",
                "intro": "I write product descriptions, email sequences, and ad copy that converts. Tell me what you need and I'll craft it."},
    "customer_support": {"name": "Chris — Support Agent", "role": "Customer Experience",
                         "intro": "I handle customer inquiries, refund requests, and dispute resolution. Ask me about policies or specific customer issues."},
    "compliance": {"name": "Jordan — Compliance Agent", "role": "Risk & Compliance",
                   "intro": "I ensure LUMÈRA follows advertising standards, privacy laws, and platform policies. Ask me about compliance risks or policy questions."},
    "store_designer": {"name": "Casey — Store Designer", "role": "Conversion Rate Optimizer",
                       "intro": "I optimize your Shopify store layout, product pages, and checkout flow for maximum conversions."},
    "ugc_creative": {"name": "Taylor — UGC Director", "role": "Creative Director",
                     "intro": "I create UGC-style scripts, ad hooks, and video concepts that drive engagement on TikTok and Instagram Reels."},
}

DEFAULT_PERSONA = {"name": "NexusOS Agent", "role": "Autonomous Agent",
                   "intro": "I'm here to help you manage your LUMÈRA business. What do you need?"}

AGENT_CHAT_SYSTEM = """You are {name}, the {role} for LUMÈRA — a premium LED face mask brand.
You are having a direct conversation with the business owner.
Be helpful, concise, and specific. Use bullet points when listing items.
When asked to DO something (create a campaign, write copy, analyze data),
give a concrete, actionable response with specifics.
You can reference LUMÈRA's product line:
- LUMÈRA Prestige (full set, ~$189 CAD) — 7-wavelength LED therapy
- LUMÈRA Aura (~$89 CAD) — entry-level chromatic shield mask
- LUMÈRA Spectrum (~$99 CAD) — dual-light renewal mask
The store is at lumera-aura.myshopify.com. We use CJ Dropshipping for fulfillment.
Current market: Canada, targeting skincare enthusiasts aged 25-45."""


class ChatMessage(BaseModel):
    message: str
    history: Optional[list[dict]] = None  # list of {"role": "user"|"assistant", "content": str}


@router.post("/{business_id}/{agent_id}/chat")
async def chat_with_agent(
    business_id: int,
    agent_id: str,
    req: ChatMessage,
    db: AsyncSession = Depends(get_db),
):
    """Have a real-time conversation with an AI agent."""
    import httpx as _httpx
    from ..config import settings as cfg

    persona = AGENT_PERSONAS.get(agent_id, DEFAULT_PERSONA)
    system_prompt = AGENT_CHAT_SYSTEM.format(name=persona["name"], role=persona["role"])

    messages = []
    if req.history:
        messages = req.history[-10:]  # Keep last 10 turns for context
    messages.append({"role": "user", "content": req.message})

    reply = ""

    # Try Claude first
    if cfg.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=cfg.anthropic_api_key)
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                system=system_prompt,
                messages=messages,
            )
            reply = response.content[0].text
        except Exception as e:
            log.warning("Claude chat failed: %s", e)

    # Fall back to Ollama — try preferred model, then fall back to any installed model
    if not reply and cfg.ollama_url:
        async def _ollama_chat(model: str) -> str:
            ollama_messages = [{"role": "system", "content": system_prompt}] + messages
            async with _httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{cfg.ollama_url}/api/chat",
                    json={"model": model, "messages": ollama_messages, "stream": False},
                )
                resp.raise_for_status()
                return resp.json().get("message", {}).get("content", "")

        # Try preferred model (gemma4), then fallback candidates
        fallback_models = [cfg.ollama_model, "llama3.2:latest", "llama3.2:1b", "llama3:latest"]
        seen: set[str] = set()
        for model in fallback_models:
            if model in seen:
                continue
            seen.add(model)
            try:
                reply = await _ollama_chat(model)
                if reply:
                    log.info("Ollama chat success with model=%s", model)
                    break
            except Exception as e:
                log.warning("Ollama chat failed with model=%s: %s", model, e)

    if not reply:
        reply = (
            f"I'm {persona['name']}. {persona['intro']}\n\n"
            f"To unlock full AI responses, add your ANTHROPIC_API_KEY in Settings, "
            f"or make sure Ollama is running locally."
        )

    return {
        "agent_id": agent_id,
        "agent_name": persona["name"],
        "reply": reply,
        "history": messages + [{"role": "assistant", "content": reply}],
    }
