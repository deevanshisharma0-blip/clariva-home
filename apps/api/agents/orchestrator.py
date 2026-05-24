"""Agent task runner — Claude API → Ollama (local, free) → simulation fallback."""
import asyncio
import json
import logging
from datetime import datetime
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger("nexus.orchestrator")


TASK_PROMPTS: dict[str, str] = {
    "ceo": """You are the CEO Agent of an autonomous Shopify dropshipping business.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"summary": str, "actions": [str], "risks": [str], "next_steps": [str]}}""",

    "product_research": """You are the Product Research Agent for a dropshipping business.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"products_found": [{{"name": str, "score": int, "margin": str, "demand": str}}], "insights": str, "recommendation": str}}""",

    "supplier": """You are the Supplier Agent managing CJ Dropshipping integrations.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"status": str, "suppliers": [{{"name": str, "reliability": str, "avg_ship_days": int}}], "issues": [str], "recommendation": str}}""",

    "marketing": """You are the Marketing Operator Agent for a Shopify dropshipping business.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"campaign_plan": {{"phase": str, "budget_daily": str, "platform": str}}, "budget_allocation": {{}}, "expected_roas": float, "creative_needs": [str]}}""",

    "analytics": """You are the Analytics Agent providing business intelligence.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"kpis": {{}}, "trends": [str], "insights": str, "forecast": {{}}}}""",

    "finance": """You are the Finance Agent analyzing business unit economics.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"unit_economics": {{}}, "profit_analysis": {{}}, "cash_flow_forecast": [], "recommendations": [str]}}""",

    "content": """You are the Content Writer Agent creating high-converting e-commerce copy.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"copy": {{"headline": str, "subheadline": str, "body": str, "cta": str}}, "hooks": [str], "seo_keywords": [str]}}""",

    "ugc_creative": """You are the UGC Creative Director for a Shopify store.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"scripts": [str], "hooks": [str], "platforms": [str], "estimated_ctr": str}}""",

    "store_designer": """You are the Store Designer Agent optimizing Shopify conversion rate.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"recommendations": [str], "priority_changes": [str], "expected_cvr_lift": str, "ab_tests": [str]}}""",

    "customer_support": """You are the Customer Support Agent for an e-commerce brand.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"ticket_summary": str, "responses": [str], "faq_updates": [str], "escalations": [str]}}""",

    "compliance": """You are the Compliance & Risk Agent for an e-commerce business.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"risk_level": str, "issues_found": [str], "recommendations": [str], "blocked_actions": [str]}}""",

    "learning": """You are the Learning Agent that improves business strategy from historical data.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"learnings": [str], "model_updates": [str], "confidence_delta": float, "next_experiments": [str]}}""",

    "experimentation": """You are the Experimentation Agent running A/B tests.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"experiments": [{{"name": str, "hypothesis": str, "metric": str, "status": str}}], "winners": [str], "insights": str}}""",

    "automation": """You are the Automation Agent managing operational workflows.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"automations_active": int, "tasks_queued": [str], "efficiency_gain": str, "issues": [str]}}""",

    "image_gen": """You are the Image Generation Agent creating product visuals.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"images_planned": [str], "prompts": [str], "style": str, "status": str}}""",

    "video_gen": """You are the Video Generation Agent creating ad creatives.
Task: {task}
Context: {context}
Reply ONLY with valid JSON: {{"videos_planned": [str], "scripts": [str], "format": str, "status": str}}""",
}

DEFAULT_PROMPT = """You are the {agent_id} agent for an autonomous e-commerce business.
Task: {task}
Context: {context}
Reply ONLY with valid JSON with keys: status (str), summary (str), result (dict)."""


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM response, handling markdown code blocks."""
    text = text.strip()
    if "```json" in text:
        text = text.split("```json")[1].split("```")[0].strip()
    elif "```" in text:
        text = text.split("```")[1].split("```")[0].strip()
    # Find first { to last }
    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        text = text[start:end]
    return json.loads(text)


async def run_agent_task(agent_id: str, task_name: str, context: dict) -> dict[str, Any]:
    """Run an agent task: Claude → Ollama → simulation."""
    template = TASK_PROMPTS.get(agent_id, DEFAULT_PROMPT)
    prompt = template.format(task=task_name, context=json.dumps(context, indent=2), agent_id=agent_id)

    if settings.anthropic_api_key:
        log.info("Agent %s: using Claude", agent_id)
        return await _run_with_claude(agent_id, task_name, context, prompt)

    log.info("Agent %s: using Ollama (%s)", agent_id, settings.ollama_model)
    return await _run_with_ollama(agent_id, task_name, context, prompt)


async def _run_with_claude(agent_id: str, task: str, context: dict, prompt: str) -> dict:
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return _extract_json(message.content[0].text)
    except Exception as e:
        log.warning("Claude failed for %s: %s — falling back to Ollama", agent_id, e)
        return await _run_with_ollama(agent_id, task, context, prompt)


async def _run_with_ollama(agent_id: str, task: str, context: dict, prompt: str) -> dict:
    # Keep context lean so the 3B model stays fast on CPU
    lean_context = {k: v for k, v in context.items() if k in (
        "business", "stage", "products", "revenue", "budget"
    )} or context
    short_prompt = (
        f"{prompt.split(chr(10))[0]}\nTask: {task}\n"
        f"Context: {json.dumps(lean_context)}\n"
        "Reply ONLY with valid JSON matching the schema above."
    )
    try:
        async with httpx.AsyncClient(timeout=150) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [{"role": "user", "content": short_prompt}],
                    "stream": False,
                    "options": {"temperature": 0.2, "num_predict": 200},
                },
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"]
            log.debug("Ollama raw response for %s: %s", agent_id, text[:200])
            result = _extract_json(text)
            result["_model"] = settings.ollama_model
            return result
    except json.JSONDecodeError as e:
        log.warning("Ollama JSON parse failed for %s: %s", agent_id, e)
        return await _simulate_task(agent_id, task, context)
    except Exception as e:
        log.warning("Ollama failed for %s: %s — using simulation", agent_id, e)
        return await _simulate_task(agent_id, task, context)


async def _simulate_task(agent_id: str, task: str, context: dict) -> dict:
    await asyncio.sleep(0.3)
    simulations = {
        "ceo": {
            "summary": f"Strategic analysis complete for '{task}'. Business is in pre-launch phase.",
            "actions": ["Finalize Shopify setup", "Complete supplier integration", "Launch Phase 1 marketing"],
            "risks": ["Supplier delivery time variance", "Initial ad spend efficiency"],
            "next_steps": ["Await founder approval", "Prepare Phase 1 budget allocation"],
        },
        "product_research": {
            "products_found": [
                {"name": "Hero Product", "score": 94, "margin": "82%", "demand": "Rising"},
                {"name": "Upsell Product", "score": 87, "margin": "78%", "demand": "Stable"},
            ],
            "insights": "Strong demand signal detected. Competitor gap in mid-range segment.",
            "recommendation": "Proceed with hero product import pending approval.",
        },
        "supplier": {
            "status": "connected",
            "suppliers": [{"name": "CJ Dropshipping", "reliability": "94%", "avg_ship_days": 10}],
            "issues": [],
            "recommendation": "CJ supplier validated. Proceed with product linking.",
        },
        "analytics": {
            "kpis": {"revenue_7d": 0, "orders_7d": 0, "cvr": "0%", "aov": "$229 CAD"},
            "trends": ["Pre-launch — baseline establishing"],
            "insights": "System initialized. Awaiting first transaction data.",
            "forecast": {"week_1_revenue": "$0", "week_4_revenue": "$1,200–$3,500 CAD"},
        },
        "finance": {
            "unit_economics": {"price": "$229 CAD", "cogs": "$17.50", "margin": "86%"},
            "profit_analysis": {"gross_profit_per_unit": "$211.50", "break_even_units": 12},
            "cash_flow_forecast": [{"week": 1, "projected": 0}, {"week": 2, "projected": 450}],
            "recommendations": ["Minimize ad spend until CVR baseline established"],
        },
        "marketing": {
            "campaign_plan": {"phase": "testing", "budget_daily": "$5 CAD", "platform": "TikTok"},
            "budget_allocation": {"tiktok": "60%", "meta": "40%"},
            "expected_roas": 2.5,
            "creative_needs": ["Hook videos", "Before/after content", "Product demo"],
        },
        "content": {
            "copy": {
                "headline": "Clinic-Grade Red Light Therapy. At Home.",
                "subheadline": "7 wavelengths. 10 minutes. Results you'll see in 30 days.",
                "body": "Transform your skincare routine with NASA-proven red light therapy technology.",
                "cta": "Shop Now — Free Shipping",
            },
            "hooks": ["I used this LED mask every day for 30 days", "The $299 device replacing $1,200 clinic visits"],
            "seo_keywords": ["red light therapy mask", "LED face mask", "at-home red light therapy"],
        },
    }
    return simulations.get(agent_id, {
        "status": "completed",
        "summary": f"Agent '{agent_id}' completed: {task}",
        "timestamp": datetime.utcnow().isoformat(),
    })
