"""CJ Dropshipping API executor with simulation fallback."""
import httpx


class CJExecutor:
    BASE = "https://developers.cjdropshipping.com/api2.0/v1"

    def __init__(self, email: str, api_key: str):
        self._email = email
        self._api_key = api_key

    async def _get_token(self) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.BASE}/authentication/getAccessToken",
                    json={"email": self._email, "password": self._api_key},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("result"):
                        return data["data"]["accessToken"]
        except Exception:
            pass
        return None

    async def execute(self, action_type: str, payload: dict) -> dict:
        if not self._email or not self._api_key:
            return self._simulate(action_type, payload)
        try:
            token = await self._get_token()
            if not token:
                return self._simulate(action_type, payload)
            if action_type == "supplier_import":
                return await self._import_product(payload, token)
            elif action_type in ("order_create", "order_fulfillment"):
                return await self._create_order(payload, token)
            else:
                return {"status": "skipped", "reason": f"CJ: unhandled action '{action_type}'"}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:200]}

    async def _import_product(self, payload: dict, token: str) -> dict:
        pid = payload.get("cj_product_id")
        if not pid:
            return {"status": "failed", "error": "Missing cj_product_id in payload"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{self.BASE}/product/query",
                params={"pid": pid},
                headers={"CJ-Access-Token": token},
            )
            resp.raise_for_status()
            d = resp.json().get("data", {})
            return {
                "status": "success",
                "cj_product_id": pid,
                "product_name": d.get("productNameEn", ""),
                "cj_price": d.get("sellPrice", ""),
                "cj_url": f"https://cjdropshipping.com/product/{pid}.html",
            }

    async def _create_order(self, payload: dict, token: str) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{self.BASE}/shopping/order/createOrderV2",
                json=payload,
                headers={"CJ-Access-Token": token, "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            d = resp.json().get("data", {})
            return {
                "status": "success",
                "cj_order_id": d.get("orderId"),
                "tracking_status": "Awaiting shipment",
            }

    def _simulate(self, action_type: str, payload: dict) -> dict:
        if action_type == "supplier_import":
            return {
                "status": "simulated",
                "message": "Product would be imported from CJ Dropshipping catalog",
                "cj_product_id": payload.get("cj_product_id", "N/A"),
                "estimated_shipping": "7-15 business days to Canada",
                "note": "Add CJ API credentials in Settings → Integrations to execute live",
            }
        if action_type in ("order_create", "order_fulfillment"):
            return {
                "status": "simulated",
                "message": "Order would be submitted to CJ Dropshipping for fulfillment",
                "note": "Add CJ API credentials in Settings → Integrations to execute live",
            }
        return {
            "status": "simulated",
            "message": f"CJ action '{action_type}' would be executed",
            "note": "Add CJ API credentials in Settings to execute live",
        }
