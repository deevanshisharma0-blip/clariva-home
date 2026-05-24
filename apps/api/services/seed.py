"""Seed the database with a demo business on first run.

Idempotent — safe to call on every startup. Detects Supabase pre-seeded data.
"""
from sqlalchemy import select
from ..database import AsyncSessionLocal
from ..models import Business, Agent, Approval, Product, Creative
from ..agents.registry import AGENT_REGISTRY


async def seed_demo_data():
    async with AsyncSessionLocal() as db:
        # Check for existing business (handles both local and Supabase pre-seeded data)
        biz_r = await db.execute(
            select(Business).where(Business.slug.in_(["lumera-aura", "lumera-led"]))
        )
        biz = biz_r.scalar_one_or_none()

        if biz:
            # Business exists — check if agents need seeding
            agents_r = await db.execute(select(Agent).where(Agent.business_id == biz.id).limit(1))
            if agents_r.scalar_one_or_none():
                return  # fully seeded — nothing to do
            # Seed agents for the existing business (Supabase pre-seed case)
            await _seed_agents(db, biz.id)
            await db.commit()
            return

        # ── Fresh install: create everything ─────────────────────────────────
        biz = Business(
            name="LUMERA LED Masks",
            slug="lumera-aura",
            type="shopify_dropshipping",
            shopify_domain="lumera-aura.myshopify.com",
            logo_emoji="✨",
            color="#d4a853",
        )
        db.add(biz)
        await db.flush()

        await _seed_agents(db, biz.id)
        await db.flush()

        # Seed products
        for p in [
            Product(business_id=biz.id, name="LUMERA Prestige (7-mode)", sku="LMR-PRESTIGE",
                    price_cad=299, cogs_cad=17.50, margin_pct=86, hero=True,
                    demand_score=94, status="active"),
            Product(business_id=biz.id, name="LUMERA Aura (5-mode)", sku="LMR-AURA",
                    price_cad=199, cogs_cad=17.50, margin_pct=84,
                    demand_score=88, status="active"),
            Product(business_id=biz.id, name="LUMERA Spectrum (3-mode)", sku="LMR-SPECTRUM",
                    price_cad=159, cogs_cad=17.50, margin_pct=82,
                    demand_score=81, status="active"),
        ]:
            db.add(p)

        # Seed pending approvals
        for a in [
            Approval(
                business_id=biz.id,
                title="Launch $5/day TikTok creative test",
                description="Run 3 ad creatives on TikTok with $5/day budget cap for 7 days to establish baseline CTR and CAC.",
                action_type="ad_launch",
                risk_level="high",
                estimated_cost="$35.00 CAD/week",
                forecast="CTR baseline established. No scaling until CAC < $20 CAD confirmed.",
                simulation={"expected_impressions": 12000, "expected_ctr": "2.1%", "expected_cac": "$18–$28 CAD"},
            ),
            Approval(
                business_id=biz.id,
                title="Import 3 CJ Dropshipping products",
                description="Link LUMERA Prestige, Aura, and Spectrum SKUs to CJ PIDs and activate fulfillment pipeline.",
                action_type="product_import",
                risk_level="medium",
                estimated_cost="$0.00",
                forecast="+3 active SKUs. Fulfillment SLA: 8–12 days CA.",
                simulation={"products": 3, "estimated_setup_time": "2 hours", "risk": "None — no cost until first order"},
            ),
            Approval(
                business_id=biz.id,
                title="Deploy LUMERA v2 homepage theme",
                description="Push updated hero section, trust bar, science section, and mobile-optimised FAQ to live store.",
                action_type="content_publish",
                risk_level="low",
                estimated_cost="$0.00",
                forecast="+4–7% add-to-cart rate based on A/B simulation.",
                simulation={"current_atc": "0%", "projected_atc": "4.2%", "confidence": "Medium"},
            ),
        ]:
            db.add(a)

        # Seed creatives
        for c in [
            Creative(business_id=biz.id, platform="TikTok",
                     hook="I used this LED mask for 10 min a day for 30 days — here's what happened",
                     creative_type="script", status="ready"),
            Creative(business_id=biz.id, platform="Meta+TikTok",
                     hook="Dermatologists love this one (not-so-weird) trick",
                     creative_type="script", status="ready"),
            Creative(business_id=biz.id, platform="Meta+TikTok",
                     hook="The $299 device replacing $1,200 clinic visits",
                     creative_type="script", status="ready"),
            Creative(business_id=biz.id, platform="TikTok",
                     hook="POV: you just discovered what red light therapy does to your skin",
                     creative_type="script", status="ready"),
            Creative(business_id=biz.id, platform="Meta",
                     hook="Why is everyone buying this LED face mask? I investigated",
                     creative_type="script", status="ready"),
        ]:
            db.add(c)

        await db.commit()


async def _seed_agents(db, business_id: int) -> None:
    """Provision all 16 agents for a business."""
    experienced = {"ceo", "product_research", "supplier", "content", "store_designer", "finance", "compliance"}
    for defn in AGENT_REGISTRY:
        agent = Agent(
            business_id=business_id,
            agent_id=defn["agent_id"],
            name=defn["name"],
            department=defn["department"],
            status="idle",
            next_run=defn.get("schedule"),
            tasks_completed=3 if defn["agent_id"] in experienced else 0,
        )
        db.add(agent)
