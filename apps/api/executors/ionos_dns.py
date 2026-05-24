"""IONOS DNS API executor — manage DNS records for custom domains."""
import httpx


class IONOSDNSExecutor:
    BASE = "https://api.hosting.ionos.com/dns/v1"

    def __init__(self, api_prefix: str, api_secret: str):
        # IONOS API key format: "prefix.secret"
        self._key = f"{api_prefix}.{api_secret}" if api_prefix and api_secret else ""

    @property
    def _headers(self) -> dict:
        return {"X-API-Key": self._key, "Content-Type": "application/json"}

    async def execute(self, action_type: str, payload: dict) -> dict:
        if not self._key or self._key == ".":
            return self._simulate(action_type, payload)
        try:
            if action_type == "dns_record_create":
                return await self._create_record(payload)
            elif action_type == "dns_record_update":
                return await self._update_record(payload)
            elif action_type == "dns_zones_list":
                return await self._list_zones()
            elif action_type == "dns_verify_domain":
                return await self._verify_domain(payload)
            else:
                return {"status": "skipped", "reason": f"IONOS DNS: unhandled action '{action_type}'"}
        except httpx.HTTPStatusError as e:
            return {"status": "failed", "error": f"IONOS API {e.response.status_code}: {e.response.text[:200]}"}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:200]}

    async def _list_zones(self) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{self.BASE}/zones", headers=self._headers)
            resp.raise_for_status()
            zones = resp.json()
            return {
                "status": "success",
                "zones": [{"id": z["id"], "name": z["name"], "type": z.get("type")} for z in zones],
                "count": len(zones),
            }

    async def _create_record(self, payload: dict) -> dict:
        zone_id = payload.get("zone_id")
        if not zone_id:
            return {"status": "failed", "error": "Missing zone_id in payload"}
        records = [{
            "name":    payload.get("name", "@"),
            "type":    payload.get("record_type", "A"),
            "content": payload.get("content", ""),
            "ttl":     payload.get("ttl", 3600),
            "prio":    payload.get("priority", 0),
            "disabled": False,
        }]
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self.BASE}/zones/{zone_id}/records",
                json=records,
                headers=self._headers,
            )
            resp.raise_for_status()
            return {
                "status": "success",
                "zone_id": zone_id,
                "record_name": payload.get("name"),
                "record_type": payload.get("record_type"),
                "content": payload.get("content"),
            }

    async def _update_record(self, payload: dict) -> dict:
        zone_id   = payload.get("zone_id")
        record_id = payload.get("record_id")
        if not zone_id or not record_id:
            return {"status": "failed", "error": "Missing zone_id or record_id"}
        update = {
            "name":    payload.get("name", "@"),
            "type":    payload.get("record_type", "A"),
            "content": payload.get("content", ""),
            "ttl":     payload.get("ttl", 3600),
            "prio":    payload.get("priority", 0),
            "disabled": False,
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.put(
                f"{self.BASE}/zones/{zone_id}/records/{record_id}",
                json=update,
                headers=self._headers,
            )
            resp.raise_for_status()
            return {"status": "success", "zone_id": zone_id, "record_id": record_id, "updated": True}

    async def _verify_domain(self, payload: dict) -> dict:
        """Check if a domain exists in IONOS and return its zone."""
        domain = payload.get("domain", "")
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{self.BASE}/zones", headers=self._headers)
            resp.raise_for_status()
            zones = resp.json()
            match = next((z for z in zones if z["name"] == domain or z["name"].endswith(f".{domain}")), None)
            if match:
                return {"status": "success", "found": True, "zone_id": match["id"], "zone_name": match["name"]}
            return {"status": "success", "found": False, "message": f"Domain '{domain}' not found in IONOS account"}

    def _simulate(self, action_type: str, payload: dict) -> dict:
        return {
            "status": "simulated",
            "message": f"DNS action '{action_type}' would be executed via IONOS API",
            "note": "Add IONOS API prefix and secret in Settings → Integrations to execute live",
        }
