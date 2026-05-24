"""TikTok Ads API executor with simulation fallback."""
import httpx


class TikTokAdsExecutor:
    BASE = "https://business-api.tiktok.com/open_api/v1.3"

    def __init__(self, access_token: str, advertiser_id: str):
        self._token = access_token
        self._advertiser_id = advertiser_id

    async def execute(self, action_type: str, payload: dict) -> dict:
        if not self._token or not self._advertiser_id:
            return self._simulate(action_type, payload)
        try:
            if action_type in ("tiktok_campaign_create", "tiktok_ad_launch"):
                return await self._create_campaign(payload)
            elif action_type == "tiktok_campaign_pause":
                return await self._pause_campaign(payload)
            else:
                return {"status": "skipped", "reason": f"TikTok: unhandled action '{action_type}'"}
        except httpx.HTTPStatusError as e:
            return {"status": "failed", "error": f"TikTok API {e.response.status_code}: {e.response.text[:300]}"}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:200]}

    async def _create_campaign(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{self.BASE}/campaign/create/",
                headers={"Access-Token": self._token, "Content-Type": "application/json"},
                json={
                    "advertiser_id": self._advertiser_id,
                    "campaign_name": payload.get("campaign_name", "NexusOS Campaign"),
                    "objective_type": payload.get("objective", "TRAFFIC"),
                    "budget_mode": "BUDGET_MODE_DAY",
                    "budget": float(payload.get("daily_budget", 10)),
                    "operation_status": "DISABLE",  # start disabled, activate manually
                },
            )
            resp.raise_for_status()
            d = resp.json().get("data", {})
            return {
                "status": "success",
                "campaign_id": d.get("campaign_id"),
                "campaign_name": payload.get("campaign_name"),
                "campaign_status": "DISABLED",
                "note": "Campaign created as DISABLED — activate in TikTok Ads Manager",
            }

    async def _pause_campaign(self, payload: dict) -> dict:
        cid = payload.get("campaign_id")
        if not cid:
            return {"status": "failed", "error": "Missing campaign_id"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.BASE}/campaign/status/update/",
                headers={"Access-Token": self._token, "Content-Type": "application/json"},
                json={"advertiser_id": self._advertiser_id, "campaign_ids": [cid], "operation_status": "DISABLE"},
            )
            resp.raise_for_status()
            return {"status": "success", "campaign_id": cid, "new_status": "DISABLED"}

    def _simulate(self, action_type: str, payload: dict) -> dict:
        if action_type in ("tiktok_campaign_create", "tiktok_ad_launch"):
            return {
                "status": "simulated",
                "message": f"Campaign '{payload.get('campaign_name', 'New Campaign')}' would be created on TikTok Ads",
                "objective": payload.get("objective", "TRAFFIC"),
                "daily_budget": payload.get("daily_budget", "$10 CAD"),
                "platform": "TikTok",
                "note": "Add TikTok API credentials in Settings → Integrations to execute live",
            }
        return {
            "status": "simulated",
            "message": f"TikTok action '{action_type}' would be executed",
            "note": "Add TikTok API credentials in Settings to execute live",
        }
