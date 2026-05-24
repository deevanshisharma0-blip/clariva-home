"""Meta Marketing API executor with simulation fallback."""
import httpx


class MetaAdsExecutor:
    BASE = "https://graph.facebook.com/v21.0"

    def __init__(self, access_token: str, ad_account_id: str):
        self._token = access_token
        self._account = ad_account_id  # format: "act_XXXXXXXX"

    async def execute(self, action_type: str, payload: dict) -> dict:
        if not self._token or not self._account:
            return self._simulate(action_type, payload)
        try:
            if action_type in ("ad_launch", "campaign_create"):
                return await self._create_campaign(payload)
            elif action_type == "campaign_pause":
                return await self._pause_campaign(payload)
            elif action_type == "budget_increase":
                return await self._update_budget(payload)
            else:
                return {"status": "skipped", "reason": f"Meta: unhandled action '{action_type}'"}
        except httpx.HTTPStatusError as e:
            return {"status": "failed", "error": f"Meta API {e.response.status_code}: {e.response.text[:300]}"}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:200]}

    async def _create_campaign(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                f"{self.BASE}/{self._account}/campaigns",
                params={
                    "access_token": self._token,
                    "name": payload.get("campaign_name", "NexusOS Campaign"),
                    "objective": payload.get("objective", "OUTCOME_TRAFFIC"),
                    "status": "PAUSED",  # always start paused — operator activates manually
                    "special_ad_categories": "[]",
                },
            )
            resp.raise_for_status()
            campaign_id = resp.json()["id"]
            return {
                "status": "success",
                "campaign_id": campaign_id,
                "campaign_name": payload.get("campaign_name"),
                "campaign_status": "PAUSED",
                "note": "Campaign created as PAUSED — activate in Meta Ads Manager",
                "ads_manager_url": "https://business.facebook.com/adsmanager/manage/campaigns",
            }

    async def _pause_campaign(self, payload: dict) -> dict:
        cid = payload.get("campaign_id")
        if not cid:
            return {"status": "failed", "error": "Missing campaign_id in payload"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.BASE}/{cid}",
                params={"access_token": self._token, "status": "PAUSED"},
            )
            resp.raise_for_status()
            return {"status": "success", "campaign_id": cid, "new_status": "PAUSED"}

    async def _update_budget(self, payload: dict) -> dict:
        adset_id = payload.get("adset_id")
        budget_cents = payload.get("daily_budget_cents")
        if not adset_id or not budget_cents:
            return {"status": "failed", "error": "Missing adset_id or daily_budget_cents"}
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.BASE}/{adset_id}",
                params={"access_token": self._token, "daily_budget": str(budget_cents)},
            )
            resp.raise_for_status()
            return {"status": "success", "adset_id": adset_id, "daily_budget_cents": budget_cents}

    def _simulate(self, action_type: str, payload: dict) -> dict:
        if action_type in ("ad_launch", "campaign_create"):
            return {
                "status": "simulated",
                "message": f"Campaign '{payload.get('campaign_name', 'New Campaign')}' would be created on Meta Ads",
                "objective": payload.get("objective", "OUTCOME_TRAFFIC"),
                "daily_budget": payload.get("daily_budget", "$10 CAD"),
                "targeting": payload.get("targeting", "Interest-based · 18-45 · Canada"),
                "platform": "Facebook + Instagram",
                "note": "Add Meta API credentials in Settings → Integrations to execute live",
            }
        if action_type == "campaign_pause":
            return {
                "status": "simulated",
                "message": f"Campaign {payload.get('campaign_id', 'N/A')} would be paused on Meta",
                "note": "Add Meta API credentials in Settings to execute live",
            }
        return {
            "status": "simulated",
            "message": f"Meta action '{action_type}' would be executed",
            "note": "Add Meta API credentials in Settings to execute live",
        }
