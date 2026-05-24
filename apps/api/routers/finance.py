from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Product

router = APIRouter(prefix="/finance", tags=["finance"])


@router.get("/{business_id}/summary")
async def finance_summary(business_id: int, db: AsyncSession = Depends(get_db)):
    return {
        "cash_balance":      0,
        "gross_revenue_7d":  0,
        "cogs_7d":           0,
        "ad_spend_7d":       0,
        "net_profit_7d":     0,
        "gross_margin_7d":   0,
        "monthly_ops_cost":  1.00,
        "budget_ceiling_week": 25.00,
        "budget_used_week":  0,
        "ltv_estimate":      229.00,
        "payback_period_days": None,
        "break_even_units":  12,
    }


@router.get("/{business_id}/unit-economics")
async def unit_economics(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.business_id == business_id))
    products = result.scalars().all()
    return [
        {
            "name":         p.name,
            "sku":          p.sku,
            "price":        p.price_cad,
            "cogs":         p.cogs_cad,
            "shipping":     5.50,
            "gross_profit": round(p.price_cad - p.cogs_cad - 5.50, 2),
            "margin_pct":   p.margin_pct,
            "target_cac":   round((p.price_cad - p.cogs_cad - 5.50) * 0.25, 2),
            "orders_7d":    p.orders_7d,
            "revenue_7d":   p.revenue_7d,
        }
        for p in products
    ]


@router.get("/{business_id}/cash-flow")
async def cash_flow(business_id: int, weeks: int = 8):
    base = [
        {"week": f"Wk {i+1}", "revenue": 0, "cogs": 0, "ad_spend": 0, "net": 0, "projected": i > 0}
        for i in range(weeks)
    ]
    # Simple projection after week 2
    projections = [0, 0, 450, 980, 1650, 2400, 3100, 3800]
    for i, row in enumerate(base):
        if i >= 2:
            row["revenue"] = projections[i]
            row["cogs"]    = round(projections[i] * 0.07, 0)
            row["ad_spend"]= round(projections[i] * 0.12, 0)
            row["net"]     = round(projections[i] * 0.81, 0)
    return base


@router.get("/{business_id}/cost-breakdown")
async def cost_breakdown(business_id: int):
    return [
        {"label": "Shopify Basic",   "monthly_cad": 1.00,  "note": "Trial — then $39 CAD/mo", "category": "platform"},
        {"label": "Claude API",      "monthly_cad": 0,     "note": "Usage-based, ~$3–8/mo at scale", "category": "ai"},
        {"label": "Canva Free",      "monthly_cad": 0,     "note": "Creative assets", "category": "creative"},
        {"label": "FFmpeg (local)",  "monthly_cad": 0,     "note": "Video generation — free", "category": "creative"},
        {"label": "GitHub Actions",  "monthly_cad": 0,     "note": "CI/CD free tier", "category": "infra"},
        {"label": "Ollama (local)",  "monthly_cad": 0,     "note": "Local LLM fallback", "category": "ai"},
        {"label": "Domain / SSL",    "monthly_cad": 0,     "note": "Shopify included", "category": "platform"},
    ]
