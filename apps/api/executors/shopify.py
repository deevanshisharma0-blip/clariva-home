"""Shopify Admin API executor.
Supports two auth modes:
  - Bearer token (CLI OAuth token, atkn_2.*): uses Admin GraphQL API
  - Custom App token (shpat_*): uses Admin REST API
Never deletes products, orders, customers, or themes.
"""
import json
import logging
import os
import httpx
from pathlib import Path

log = logging.getLogger("nexus.shopify")

SHOPIFY_API_VERSION = "2025-04"

CLI_CONFIG_PATH = Path(os.environ.get("APPDATA", "")) / "shopify-cli-kit-nodejs" / "Config" / "config.json"


def _read_cli_token() -> str:
    """Read the current Shopify CLI OAuth token from the local CLI config file.
    Returns empty string if not found or expired."""
    try:
        if not CLI_CONFIG_PATH.exists():
            return ""
        with open(CLI_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
        session = json.loads(cfg.get("sessionStore", "{}"))
        accounts = session.get("accounts.shopify.com", {})
        for _uid, account_data in accounts.items():
            identity = account_data.get("identity", {})
            token = identity.get("accessToken", "")
            if token:
                return token
        return ""
    except Exception:
        return ""


class ShopifyExecutor:
    API_VERSION = SHOPIFY_API_VERSION

    def __init__(self, domain: str, token: str):
        self._domain = domain.rstrip("/")
        # Auto-detect token type; fall back to CLI token if empty
        self._token = token or _read_cli_token()
        # Bearer tokens (CLI OAuth) use GraphQL; shpat_* tokens use REST
        self._use_bearer = self._token.startswith("atkn_")
        self._base = f"https://{self._domain}/admin/api/{self.API_VERSION}"
        self._gql_url = f"{self._base}/graphql.json"
        if self._use_bearer:
            self._headers = {
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            }
        else:
            self._headers = {
                "X-Shopify-Access-Token": self._token,
                "Content-Type": "application/json",
            }

    async def _gql(self, query: str, variables: dict | None = None) -> dict:
        """Execute an Admin GraphQL query/mutation."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(self._gql_url, json=payload, headers=self._headers)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                raise Exception(f"GraphQL errors: {data['errors']}")
            return data.get("data", {})

    async def verify_token(self) -> bool:
        """Quick token check — returns True if token is valid."""
        try:
            if self._use_bearer:
                data = await self._gql("{shop{name}}")
                return bool(data.get("shop"))
            else:
                async with httpx.AsyncClient(timeout=8) as client:
                    resp = await client.get(f"{self._base}/shop.json", headers=self._headers)
                    return resp.status_code == 200
        except Exception:
            return False

    async def execute(self, action_type: str, payload: dict) -> dict:
        try:
            if action_type in ("product_create", "product_import"):
                return await self._create_product(payload)
            elif action_type in ("product_price_update", "price_change"):
                return await self._update_price(payload)
            elif action_type == "collection_create":
                return await self._create_collection(payload)
            elif action_type == "discount_create":
                return await self._create_discount(payload)
            elif action_type in ("content_publish", "blog_post_create"):
                return await self._create_blog_post(payload)
            elif action_type == "product_update":
                return await self._update_product(payload)
            elif action_type == "launch_checklist":
                return await self._run_launch_checklist()
            else:
                return {"status": "skipped", "reason": f"Action '{action_type}' not handled by Shopify executor"}
        except httpx.HTTPStatusError as e:
            return {"status": "failed", "error": f"Shopify API {e.response.status_code}: {e.response.text[:300]}"}
        except httpx.TimeoutException:
            return {"status": "failed", "error": "Shopify API timed out"}
        except Exception as e:
            return {"status": "failed", "error": str(e)[:300]}

    async def _create_product(self, payload: dict) -> dict:
        product_data = {
            "product": {
                "title": payload.get("title", "New Product"),
                "body_html": payload.get("description", ""),
                "vendor": payload.get("vendor", ""),
                "product_type": payload.get("product_type", ""),
                "status": payload.get("status", "draft"),
                "variants": [{
                    "price": str(payload.get("price", "0.00")),
                    "sku": payload.get("sku", ""),
                    "inventory_management": "shopify",
                    "inventory_quantity": payload.get("inventory", 100),
                }],
                "tags": payload.get("tags", ""),
            }
        }
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{self._base}/products.json", json=product_data, headers=self._headers)
            resp.raise_for_status()
            p = resp.json()["product"]
            return {
                "status": "success",
                "shopify_product_id": str(p["id"]),
                "handle": p["handle"],
                "product_status": p["status"],
                "admin_url": f"https://{self._domain}/admin/products/{p['id']}",
                "storefront_url": f"https://{self._domain}/products/{p['handle']}",
            }

    async def _update_product(self, payload: dict) -> dict:
        product_id = payload.get("shopify_product_id")
        if not product_id:
            return {"status": "failed", "error": "Missing shopify_product_id in payload"}
        update_data: dict = {}
        for field in ("title", "body_html", "status", "tags", "product_type"):
            if payload.get(field):
                update_data[field] = payload[field]
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.put(
                f"{self._base}/products/{product_id}.json",
                json={"product": {"id": product_id, **update_data}},
                headers=self._headers,
            )
            resp.raise_for_status()
            p = resp.json()["product"]
            return {"status": "success", "shopify_product_id": str(p["id"]), "handle": p["handle"]}

    async def _update_price(self, payload: dict) -> dict:
        product_id = payload.get("shopify_product_id")
        new_price = payload.get("new_price")
        if not product_id or not new_price:
            return {"status": "failed", "error": "Missing shopify_product_id or new_price"}
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{self._base}/products/{product_id}/variants.json", headers=self._headers)
            resp.raise_for_status()
            variants = resp.json().get("variants", [])
            if not variants:
                return {"status": "failed", "error": "No variants found on product"}
            vid = payload.get("variant_id") or variants[0]["id"]
            resp2 = await client.put(
                f"{self._base}/variants/{vid}.json",
                json={"variant": {"id": vid, "price": str(new_price)}},
                headers=self._headers,
            )
            resp2.raise_for_status()
            return {"status": "success", "variant_id": vid, "new_price": new_price, "product_id": product_id}

    async def _create_collection(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{self._base}/custom_collections.json",
                json={"custom_collection": {
                    "title": payload.get("title", "New Collection"),
                    "body_html": payload.get("description", ""),
                    "published": payload.get("published", False),
                }},
                headers=self._headers,
            )
            resp.raise_for_status()
            c = resp.json()["custom_collection"]
            return {
                "status": "success",
                "collection_id": str(c["id"]),
                "handle": c["handle"],
                "admin_url": f"https://{self._domain}/admin/collections/{c['id']}",
            }

    async def _create_discount(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            rule_data = {
                "price_rule": {
                    "title": payload.get("title", "Promo"),
                    "target_type": "line_item",
                    "target_selection": "all",
                    "allocation_method": "across",
                    "value_type": "percentage",
                    "value": str(-abs(float(payload.get("discount_pct", 10)))),
                    "customer_selection": "all",
                    "starts_at": payload.get("starts_at", "2024-01-01T00:00:00Z"),
                    "ends_at": payload.get("ends_at"),
                    "usage_limit": payload.get("usage_limit"),
                }
            }
            resp = await client.post(f"{self._base}/price_rules.json", json=rule_data, headers=self._headers)
            resp.raise_for_status()
            rule_id = resp.json()["price_rule"]["id"]
            resp2 = await client.post(
                f"{self._base}/price_rules/{rule_id}/discount_codes.json",
                json={"discount_code": {"code": payload.get("code", "NEXUS10")}},
                headers=self._headers,
            )
            resp2.raise_for_status()
            dc = resp2.json()["discount_code"]
            return {
                "status": "success",
                "discount_code": dc["code"],
                "price_rule_id": rule_id,
                "discount_pct": payload.get("discount_pct", 10),
            }

    async def _create_blog_post(self, payload: dict) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{self._base}/blogs.json", headers=self._headers)
            resp.raise_for_status()
            blogs = resp.json().get("blogs", [])
            if not blogs:
                return {"status": "failed", "error": "No blog found. Create a blog in Shopify first."}
            blog_id = payload.get("blog_id") or blogs[0]["id"]
            article_data = {
                "article": {
                    "blog_id": blog_id,
                    "title": payload.get("title", "New Article"),
                    "body_html": payload.get("body_html", payload.get("content", "")),
                    "author": payload.get("author", "NexusOS"),
                    "published": payload.get("published", False),
                }
            }
            resp2 = await client.post(
                f"{self._base}/blogs/{blog_id}/articles.json",
                json=article_data,
                headers=self._headers,
            )
            resp2.raise_for_status()
            a = resp2.json()["article"]
            return {
                "status": "success",
                "article_id": str(a["id"]),
                "title": a["title"],
                "published": a["published_at"] is not None,
                "admin_url": f"https://{self._domain}/admin/articles/{a['id']}",
            }

    async def _run_launch_checklist(self) -> dict:
        """Verify Shopify store is live and return checklist status."""
        if self._use_bearer:
            data = await self._gql("""
            {
              shop { name myshopifyDomain primaryDomain { url } plan { displayName } }
              productsCount { count }
              themes(first: 10) { edges { node { name role } } }
            }
            """)
            shop = data.get("shop", {})
            product_count = data.get("productsCount", {}).get("count", 0)
            themes = [e["node"] for e in data.get("themes", {}).get("edges", [])]
            active_theme = next((t for t in themes if t.get("role") == "MAIN"), None)
            return {
                "status": "success",
                "shop_name": shop.get("name", ""),
                "shopify_domain": shop.get("myshopifyDomain", ""),
                "plan": shop.get("plan", {}).get("displayName", "unknown"),
                "product_count": product_count,
                "active_theme": active_theme["name"] if active_theme else "None",
                "shopify_connection": "verified",
                "admin_url": f"https://{self._domain}/admin",
                "next_step": "Shopify store verified. NexusOS autonomous agents active.",
            }
        else:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(f"{self._base}/shop.json", headers=self._headers)
                resp.raise_for_status()
                shop = resp.json()["shop"]

                products_resp = await client.get(f"{self._base}/products/count.json", headers=self._headers)
                products_resp.raise_for_status()
                product_count = products_resp.json().get("count", 0)

                themes_resp = await client.get(f"{self._base}/themes.json", headers=self._headers)
                active_theme = next((t for t in themes_resp.json().get("themes", []) if t.get("role") == "main"), None)

            return {
                "status": "success",
                "shop_name": shop["name"],
                "shopify_domain": shop["domain"],
                "plan": shop.get("plan_name", "unknown"),
                "product_count": product_count,
                "active_theme": active_theme["name"] if active_theme else "None",
                "shopify_connection": "verified",
                "admin_url": f"https://{self._domain}/admin",
                "next_step": "Add products via CJ Dropshipping or create them manually in Shopify Admin",
            }
