"""
Orders router — Shopify webhook receiver + CJ fulfillment pipeline.

Webhook flow:
  Shopify ORDERS_PAID → POST /api/webhooks/shopify/orders-paid
    → store order in DB
    → submit to CJ Dropshipping
    → update fulfillment status
    → broadcast WS event
"""
import hashlib
import hmac
import logging
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..database import get_db, AsyncSessionLocal
from ..models import Order, Business, Product
from ..config import settings

log = logging.getLogger("nexus.orders")

router = APIRouter(prefix="/orders", tags=["orders"])
webhook_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class OrderOut(BaseModel):
    id: int
    business_id: int
    shopify_order_id: str
    shopify_order_number: Optional[str]
    customer_name: Optional[str]
    customer_email: Optional[str]
    shipping_country: Optional[str]
    total_price: float
    currency: str
    fulfillment_status: str
    cj_order_id: Optional[str]
    cj_tracking_number: Optional[str]
    cj_status: Optional[str]
    shopify_created_at: Optional[datetime]
    cj_submitted_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Order list endpoint ───────────────────────────────────────────────────────

@router.get("/{business_id}", response_model=list[OrderOut])
async def list_orders(business_id: int, limit: int = 50, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Order)
        .where(Order.business_id == business_id)
        .order_by(Order.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{business_id}/stats")
async def order_stats(business_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.business_id == business_id))
    orders = result.scalars().all()
    total = len(orders)
    revenue = sum(o.total_price for o in orders)
    fulfilled = sum(1 for o in orders if o.fulfillment_status in ("submitted", "shipped", "delivered"))
    pending = sum(1 for o in orders if o.fulfillment_status == "pending")
    failed = sum(1 for o in orders if o.fulfillment_status == "failed")
    return {
        "total_orders": total,
        "total_revenue_cad": round(revenue, 2),
        "fulfilled": fulfilled,
        "pending": pending,
        "failed": failed,
        "fulfillment_rate": round(fulfilled / total * 100, 1) if total else 0,
    }


# ── Shopify webhook ───────────────────────────────────────────────────────────

async def _verify_shopify_hmac(request: Request, secret: str) -> bool:
    """Verify Shopify webhook HMAC signature."""
    body = await request.body()
    if not secret:
        return True  # Skip verification if no secret configured (dev mode)
    sig = request.headers.get("X-Shopify-Hmac-SHA256", "")
    computed = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    import base64
    expected = base64.b64encode(computed).decode()
    return hmac.compare_digest(sig, expected)


@webhook_router.post("/shopify/orders-paid")
async def shopify_order_paid(
    request: Request,
    background_tasks: BackgroundTasks,
    x_shopify_shop_domain: Optional[str] = Header(default=None),
    x_shopify_hmac_sha256: Optional[str] = Header(default=None),
):
    """
    Called by Shopify when an order is paid.
    Stores order → submits to CJ → broadcasts WS event.
    """
    body = await request.body()
    payload = json.loads(body)

    log.info("Shopify webhook received: order %s from %s", payload.get("id"), x_shopify_shop_domain)

    # Find business by Shopify domain
    async with AsyncSessionLocal() as db:
        biz_result = await db.execute(
            select(Business).where(Business.shopify_domain == x_shopify_shop_domain)
        )
        biz = biz_result.scalar_one_or_none()
        if not biz:
            # Try finding by any business (fallback for local dev)
            biz_result = await db.execute(select(Business).limit(1))
            biz = biz_result.scalar_one_or_none()
        if not biz:
            log.error("No business found for domain %s", x_shopify_shop_domain)
            return {"ok": False, "error": "Business not found"}

        # Check for duplicate
        existing = await db.execute(
            select(Order).where(Order.shopify_order_id == str(payload["id"]))
        )
        if existing.scalar_one_or_none():
            log.info("Duplicate order %s — skipping", payload["id"])
            return {"ok": True, "duplicate": True}

        # Extract shipping address
        shipping = payload.get("shipping_address") or payload.get("billing_address") or {}
        customer = payload.get("customer") or {}

        # Build line items
        line_items = [
            {
                "title": item.get("title"),
                "sku": item.get("sku"),
                "quantity": item.get("quantity", 1),
                "price": item.get("price"),
                "variant_id": str(item.get("variant_id", "")),
            }
            for item in payload.get("line_items", [])
        ]

        order = Order(
            business_id=biz.id,
            shopify_order_id=str(payload["id"]),
            shopify_order_number=str(payload.get("order_number", "")),
            customer_name=f"{customer.get('first_name','')} {customer.get('last_name','')}".strip()
                          or shipping.get("name", ""),
            customer_email=payload.get("email") or customer.get("email", ""),
            shipping_country=shipping.get("country_code", ""),
            total_price=float(payload.get("total_price", 0)),
            currency=payload.get("currency", "CAD"),
            line_items=line_items,
            fulfillment_status="pending",
            shopify_created_at=datetime.fromisoformat(
                payload["created_at"].replace("Z", "+00:00")
            ) if payload.get("created_at") else None,
            raw=payload,
        )
        db.add(order)
        await db.commit()
        await db.refresh(order)

        log.info("Order %s stored (id=%d)", order.shopify_order_number, order.id)

    # Submit to CJ in background
    background_tasks.add_task(_submit_to_cj, order.id, payload)

    # Broadcast
    try:
        from .ws import broadcast
        await broadcast({
            "event": "order.received",
            "order_id": order.id,
            "order_number": order.shopify_order_number,
            "customer": order.customer_name,
            "total": f"{order.total_price} {order.currency}",
        })
    except Exception:
        pass

    return {"ok": True, "order_id": order.id}


# ── CJ fulfillment ────────────────────────────────────────────────────────────

async def _submit_to_cj(order_id: int, shopify_payload: dict) -> None:
    """Submit a Shopify order to CJ Dropshipping for fulfillment."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Order).where(Order.id == order_id))
        order = result.scalar_one_or_none()
        if not order:
            return

        biz_result = await db.execute(select(Business).where(Business.id == order.business_id))
        biz = biz_result.scalar_one_or_none()
        if not biz:
            return

        cfg = biz.config or {}
        cj_email = settings.cj_api_email or cfg.get("cj_api_email", "")
        cj_key = settings.cj_api_key or cfg.get("cj_api_key", "")

        if not cj_email or not cj_key:
            log.warning("CJ not configured — order %d skipped", order_id)
            order.fulfillment_status = "skipped"
            order.cj_status = "not_configured"
            await db.commit()
            return

        try:
            from ..executors.cj import CJExecutor
            executor = CJExecutor(cj_email, cj_key)
            token = await executor._get_token()
            if not token:
                raise Exception("CJ authentication failed")

            # Build CJ order payload
            shipping = shopify_payload.get("shipping_address") or shopify_payload.get("billing_address") or {}

            # Build products list from line items
            products = []
            for item in shopify_payload.get("line_items", []):
                sku = item.get("sku", "")
                if sku:
                    products.append({
                        "vid": await _get_cj_vid(sku, db),
                        "quantity": item.get("quantity", 1),
                        "variantSku": sku,
                    })

            if not products:
                order.fulfillment_status = "failed"
                order.cj_status = "no_cj_skus"
                await db.commit()
                return

            cj_payload = {
                "orderNumber": f"NEXUS-{order.shopify_order_number}",
                "shippingZip": shipping.get("zip", ""),
                "shippingCountry": shipping.get("country_code", "CA"),
                "shippingCountryCode": shipping.get("country_code", "CA"),
                "shippingProvince": shipping.get("province", ""),
                "shippingCity": shipping.get("city", ""),
                "shippingAddress": shipping.get("address1", ""),
                "shippingAddress2": shipping.get("address2", ""),
                "shippingCustomerName": shipping.get("name", order.customer_name or ""),
                "shippingPhone": shipping.get("phone", ""),
                "shippingZip": shipping.get("zip", ""),
                "products": products,
                "remark": f"Shopify Order #{order.shopify_order_number}",
            }

            result = await executor._create_order(cj_payload, token)

            if result.get("status") == "success":
                order.cj_order_id = str(result.get("cj_order_id", ""))
                order.fulfillment_status = "submitted"
                order.cj_status = "processing"
                order.cj_submitted_at = datetime.utcnow()
                log.info("Order %d submitted to CJ: %s", order_id, order.cj_order_id)
            else:
                order.fulfillment_status = "failed"
                order.cj_status = f"error: {result.get('error','unknown')[:100]}"
                log.error("CJ submission failed for order %d: %s", order_id, result)

        except Exception as e:
            log.exception("CJ submission error for order %d", order_id)
            order.fulfillment_status = "failed"
            order.cj_status = f"exception: {str(e)[:100]}"

        await db.commit()

        # Broadcast fulfillment update
        try:
            from .ws import broadcast
            await broadcast({
                "event": "order.fulfillment_updated",
                "order_id": order_id,
                "fulfillment_status": order.fulfillment_status,
                "cj_order_id": order.cj_order_id,
            })
        except Exception:
            pass


async def _get_cj_vid(sku: str, db: AsyncSession) -> str:
    """Map a Shopify variant SKU to a CJ VID."""
    # SKU-to-VID mapping for LUMÈRA products
    SKU_TO_VID = {
        "CJMB117367904DW": "1720337344001220608",  # Prestige (full set)
        "CJMB117367901AZ": "1404373488256552960",  # Aura
        "CJMB117367902BY": "1671427655859703808",  # Aura v2
        "CJMZ125416105EV": "2508080210331627100",  # Spectrum
    }
    return SKU_TO_VID.get(sku, sku)


# ── Tracking endpoint ─────────────────────────────────────────────────────────

@router.post("/{order_id}/sync-tracking")
async def sync_tracking(order_id: int, db: AsyncSession = Depends(get_db)):
    """Pull latest tracking info from CJ for an order."""
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "Order not found")
    if not order.cj_order_id:
        return {"ok": False, "error": "Order not yet submitted to CJ"}

    biz_result = await db.execute(select(Business).where(Business.id == order.business_id))
    biz = biz_result.scalar_one_or_none()
    cfg = biz.config or {} if biz else {}
    cj_email = settings.cj_api_email or cfg.get("cj_api_email", "")
    cj_key = settings.cj_api_key or cfg.get("cj_api_key", "")

    try:
        import httpx
        from ..executors.cj import CJExecutor
        executor = CJExecutor(cj_email, cj_key)
        token = await executor._get_token()
        if not token:
            return {"ok": False, "error": "CJ auth failed"}

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://developers.cjdropshipping.com/api2.0/v1/shopping/order/getOrderDetail",
                params={"orderId": order.cj_order_id},
                headers={"CJ-Access-Token": token},
            )
            data = resp.json()
            if data.get("result") and data.get("data"):
                d = data["data"]
                order.cj_tracking_number = d.get("trackNumber", order.cj_tracking_number)
                order.cj_status = d.get("orderStatus", order.cj_status)
                if d.get("trackNumber"):
                    order.fulfillment_status = "shipped"
                    order.shipped_at = datetime.utcnow()
                await db.commit()
                return {
                    "ok": True,
                    "tracking_number": order.cj_tracking_number,
                    "cj_status": order.cj_status,
                }
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

    return {"ok": False, "error": "Could not fetch tracking"}
