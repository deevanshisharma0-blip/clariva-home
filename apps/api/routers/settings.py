from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import httpx
from ..database import get_db
from ..models import Business
from ..config import settings as app_settings

SHOPIFY_API_VERSION = "2025-04"

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    shopify_domain: Optional[str] = None
    shopify_token: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    cj_api_email: Optional[str] = None
    cj_api_key: Optional[str] = None
    meta_access_token: Optional[str] = None
    meta_ad_account_id: Optional[str] = None
    tiktok_access_token: Optional[str] = None
    tiktok_advertiser_id: Optional[str] = None
    budget_weekly_cap: Optional[float] = None
    # IONOS
    ionos_smtp_email: Optional[str] = None
    ionos_smtp_password: Optional[str] = None
    ionos_digest_recipient: Optional[str] = None
    ionos_api_prefix: Optional[str] = None
    ionos_api_secret: Optional[str] = None


@router.get("/{business_id}")
async def get_settings(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")

    cfg = biz.config or {}
    return {
        "shopify_domain":        biz.shopify_domain or "",
        "shopify_connected":     bool(biz.shopify_token),
        "anthropic_configured":  bool(app_settings.anthropic_api_key),
        "cj_configured":         bool(app_settings.cj_api_key or cfg.get("cj_api_key")),
        "meta_configured":       bool(cfg.get("meta_access_token") and cfg.get("meta_ad_account_id")),
        "tiktok_configured":     bool(cfg.get("tiktok_access_token") and cfg.get("tiktok_advertiser_id")),
        "meta_ad_account_id":    cfg.get("meta_ad_account_id", ""),
        "tiktok_advertiser_id":  cfg.get("tiktok_advertiser_id", ""),
        "cj_api_email":          cfg.get("cj_api_email", app_settings.cj_api_email or ""),
        "budget_weekly_cap":     cfg.get("budget_weekly_cap", 25.0),
        "ionos_email_configured": bool(app_settings.ionos_smtp_email or cfg.get("ionos_smtp_email")),
        "ionos_dns_configured":   bool(app_settings.ionos_api_prefix or cfg.get("ionos_api_prefix")),
        "ionos_smtp_email":       cfg.get("ionos_smtp_email", app_settings.ionos_smtp_email or ""),
        "ionos_digest_recipient": cfg.get("ionos_digest_recipient", app_settings.ionos_digest_recipient or ""),
        "agent_schedules": {
            "ceo":              "Daily 03:00",
            "product_research": "Daily 06:00",
            "supplier":         "Daily 07:00",
            "marketing":        "Daily 08:00",
            "analytics":        "Hourly",
            "finance":          "Daily 04:00",
            "compliance":       "Daily 05:00",
            "learning":         "Daily 21:00",
        },
    }


@router.patch("/{business_id}")
async def update_settings(business_id: int, data: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")

    cfg = dict(biz.config or {})

    if data.shopify_domain:
        biz.shopify_domain = data.shopify_domain
    if data.shopify_token:
        biz.shopify_token = data.shopify_token
    if data.budget_weekly_cap is not None:
        cfg["budget_weekly_cap"] = data.budget_weekly_cap
    if data.cj_api_email:
        cfg["cj_api_email"] = data.cj_api_email
    if data.cj_api_key:
        cfg["cj_api_key"] = data.cj_api_key
    if data.meta_access_token:
        cfg["meta_access_token"] = data.meta_access_token
    if data.meta_ad_account_id:
        cfg["meta_ad_account_id"] = data.meta_ad_account_id
    if data.tiktok_access_token:
        cfg["tiktok_access_token"] = data.tiktok_access_token
    if data.tiktok_advertiser_id:
        cfg["tiktok_advertiser_id"] = data.tiktok_advertiser_id
    if data.ionos_smtp_email:
        cfg["ionos_smtp_email"] = data.ionos_smtp_email
    if data.ionos_smtp_password:
        cfg["ionos_smtp_password"] = data.ionos_smtp_password
    if data.ionos_digest_recipient:
        cfg["ionos_digest_recipient"] = data.ionos_digest_recipient
    if data.ionos_api_prefix:
        cfg["ionos_api_prefix"] = data.ionos_api_prefix
    if data.ionos_api_secret:
        cfg["ionos_api_secret"] = data.ionos_api_secret

    biz.config = cfg
    await db.commit()
    return {"ok": True, "message": "Settings updated"}


@router.get("/{business_id}/test-ionos-email")
async def test_ionos_email(business_id: int, db: AsyncSession = Depends(get_db)):
    from ..services.email import test_connection
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    # Apply per-business overrides to settings temporarily
    cfg = biz.config or {}
    if cfg.get("ionos_smtp_email"):
        app_settings.ionos_smtp_email = cfg["ionos_smtp_email"]
    if cfg.get("ionos_smtp_password"):
        app_settings.ionos_smtp_password = cfg["ionos_smtp_password"]
    return await test_connection()


@router.get("/{business_id}/test-shopify")
async def test_shopify(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Business).where(Business.id == business_id))
    biz = result.scalar_one_or_none()
    if not biz:
        raise HTTPException(404, "Business not found")
    if not biz.shopify_domain or not biz.shopify_token:
        return {"ok": False, "error": "Shopify credentials not configured. Add your store domain and access token above."}
    try:
        url = f"https://{biz.shopify_domain}/admin/api/{SHOPIFY_API_VERSION}/shop.json"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers={"X-Shopify-Access-Token": biz.shopify_token})
        if resp.status_code == 200:
            shop = resp.json()["shop"]
            return {"ok": True, "shop_name": shop["name"], "domain": shop["domain"], "plan": shop.get("plan_name")}
        elif resp.status_code == 401:
            return {
                "ok": False,
                "error": "Invalid access token (401). Your token may have been revoked or not installed. "
                         "Go to: Shopify Admin → Apps → App and sales channel settings → Develop apps → "
                         "your NexusOS app → API credentials → 'Rotate API credentials' to get a fresh token."
            }
        elif resp.status_code == 404:
            return {"ok": False, "error": "Store domain not found. Check your .myshopify.com domain."}
        else:
            return {"ok": False, "error": f"Shopify returned {resp.status_code}"}
    except httpx.TimeoutException:
        return {"ok": False, "error": "Connection timed out. Check your store domain."}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
