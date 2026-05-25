"""Routes approved actions to the correct executor and records results."""
import logging
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..models import Approval, Business
from ..config import settings
from .shopify import ShopifyExecutor
from .cj import CJExecutor
from .meta_ads import MetaAdsExecutor
from .tiktok_ads import TikTokAdsExecutor
from .ionos_dns import IONOSDNSExecutor

log = logging.getLogger("nexus.executor")

SHOPIFY_ACTIONS = {
    "product_create", "product_import", "product_update",
    "product_price_update", "price_change",
    "collection_create", "discount_create",
    "content_publish", "blog_post_create",
    "launch_checklist",
}
CJ_ACTIONS = {"supplier_import", "order_create", "order_fulfillment"}
META_ACTIONS = {"ad_launch", "campaign_create", "campaign_pause", "budget_increase"}
TIKTOK_ACTIONS = {"tiktok_campaign_create", "tiktok_ad_launch", "tiktok_campaign_pause"}
INTERNAL_ACTIONS = {"budget_cap_set"}
IONOS_ACTIONS    = {"dns_record_create", "dns_record_update", "dns_zones_list", "dns_verify_domain"}


async def execute_approval(approval_id: int, db: AsyncSession) -> None:
    result = await db.execute(select(Approval).where(Approval.id == approval_id))
    approval = result.scalar_one_or_none()
    if not approval:
        return

    biz_result = await db.execute(select(Business).where(Business.id == approval.business_id))
    biz = biz_result.scalar_one_or_none()
    if not biz:
        return

    cfg = biz.config or {}
    action_type = approval.action_type
    payload = approval.payload or {}

    log.info("Executing approval %d: %s", approval_id, action_type)

    approval.execution_status = "running"
    await db.commit()

    try:
        from ..routers.ws import broadcast
        await broadcast({"event": "execution.started", "approval_id": approval_id, "action_type": action_type})
    except Exception:
        pass

    exec_result: dict = {}
    try:
        if action_type in SHOPIFY_ACTIONS:
            # Use biz credentials if available; fall back to global settings (which auto-reads CLI token)
            shopify_domain = biz.shopify_domain or settings.shopify_store or "lumera-aura.myshopify.com"
            shopify_token = biz.shopify_token or settings.shopify_token or ""
            executor = ShopifyExecutor(shopify_domain, shopify_token)
            if await executor.verify_token():
                exec_result = await executor.execute(action_type, payload)
            else:
                exec_result = {
                    "status": "skipped",
                    "reason": "Shopify token invalid or not configured",
                    "note": "Run 'shopify theme push' locally to refresh CLI token, or add Custom App token in Settings",
                }

        elif action_type in CJ_ACTIONS:
            executor = CJExecutor(
                settings.cj_api_email or cfg.get("cj_api_email", ""),
                settings.cj_api_key or cfg.get("cj_api_key", ""),
            )
            exec_result = await executor.execute(action_type, payload)

        elif action_type in META_ACTIONS:
            executor = MetaAdsExecutor(
                cfg.get("meta_access_token", ""),
                cfg.get("meta_ad_account_id", ""),
            )
            exec_result = await executor.execute(action_type, payload)

        elif action_type in TIKTOK_ACTIONS:
            executor = TikTokAdsExecutor(
                cfg.get("tiktok_access_token", ""),
                cfg.get("tiktok_advertiser_id", ""),
            )
            exec_result = await executor.execute(action_type, payload)

        elif action_type in IONOS_ACTIONS:
            executor = IONOSDNSExecutor(settings.ionos_api_prefix, settings.ionos_api_secret)
            exec_result = await executor.execute(action_type, payload)

        elif action_type in INTERNAL_ACTIONS:
            exec_result = await _exec_internal(action_type, payload, biz, db)

        else:
            exec_result = {
                "status": "simulated",
                "message": f"Action '{action_type}' was approved and logged. No live integration registered yet.",
            }

        raw_status = exec_result.get("status", "success")
        approval.execution_status = raw_status if raw_status in ("success", "simulated", "skipped", "failed") else "success"

    except Exception as e:
        log.exception("Executor error for approval %d", approval_id)
        exec_result = {"status": "failed", "error": str(e)[:300]}
        approval.execution_status = "failed"

    approval.execution_result = exec_result
    approval.executed_at = datetime.utcnow()
    await db.commit()

    log.info("Approval %d execution: %s — %s", approval_id, approval.execution_status, exec_result.get("status", ""))

    # Slack execution result
    try:
        from ..services.slack import alert_execution
        await alert_execution(biz.name, approval.title, approval.execution_status, exec_result)
    except Exception:
        pass

    try:
        from ..routers.ws import broadcast  # noqa: F401
        await broadcast({
            "event": "execution.complete",
            "approval_id": approval_id,
            "execution_status": approval.execution_status,
            "result_status": exec_result.get("status"),
        })
    except Exception:
        pass


async def _exec_internal(action_type: str, payload: dict, biz: Business, db: AsyncSession) -> dict:
    """Handles internal (no external API) actions that modify NexusOS state."""
    if action_type == "budget_cap_set":
        cap = payload.get("weekly_cap_cad", 25.0)
        cfg = dict(biz.config or {})
        cfg["budget_weekly_cap"] = float(cap)
        biz.config = cfg
        await db.commit()
        return {
            "status": "success",
            "budget_weekly_cap_cad": cap,
            "message": f"Weekly ad spend cap set to ${cap} CAD. Agents will not propose campaigns exceeding this.",
        }
    return {"status": "skipped", "reason": f"No internal handler for {action_type}"}
