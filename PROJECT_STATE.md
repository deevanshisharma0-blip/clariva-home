# PROJECT_STATE.md — Clariva Home
**Last updated:** 2026-06-02
**Spec:** TECHNICAL BUILD SPECIFICATION v1.0 (27 sections)

---

## Brand
- **Name:** Clariva Home
- **Niche:** Kitchen gadgets + Home organization
- **Markets:** Canada + USA
- **Entity:** Canada (GST/HST small-supplier, collection OFF, records ON)
- **Shopify store:** lumera-aura.myshopify.com (to be rebranded)

---

## Stack
| Layer | Service | Status |
|---|---|---|
| Database | Supabase (qjclbnbzntdxfjuomdwr, ca-central-1) | ✅ Live |
| Orchestration | n8n on Render (clariva-n8n.onrender.com) | ⚠️ SQLite (needs Postgres migration) |
| LLM | OpenAI API (sk-proj-..., $15 credit, hard cap $20) | ✅ Configured |
| Supplier | CJdropshipping (info.vereine@gmail.com) | ✅ Key stored |
| Storefront | Shopify (lumera-aura.myshopify.com) | ✅ Token stored |
| Alerts | Telegram | ❌ Bot not yet created |
| Email | Klaviyo | ❌ Not yet connected |
| Content scheduling | Postiz (self-hosted) | ❌ Not yet deployed |

---

## Infrastructure
| Component | URL/ID | Notes |
|---|---|---|
| Supabase | qjclbnbzntdxfjuomdwr | ca-central-1, free tier |
| n8n | https://clariva-n8n.onrender.com | Render free, SQLite (needs Postgres fix) |
| GitHub | deevanshisharma0-blip/clariva-home | Public repo |

---

## Build Phase Status

| Phase | Description | Status |
|---|---|---|
| 0 | Toolchain bootstrap | ✅ Complete |
| 1 | Supabase schema + RLS + pgvector + Realtime + Auth/MFA | ✅ Schema done / ⚠️ Auth/MFA pending |
| 2 | n8n engine + keep-alive + UptimeRobot | ✅ n8n live / ⚠️ needs Postgres backing |
| 3 | Platform integrations | ✅ OpenAI, Shopify, CJ keys stored |
| 4 | Agents (Research → CEO + Watchdog) | ❌ Not started |
| 5 | Shopify store build | ❌ Not started |
| 6 | Operator console (React Native / Expo) | ❌ Not started |
| 7 | E2E test | ❌ Not started |
| 8 | Launch | ❌ Not started |

---

## Database Schema (Phase 1)
**Migration:** `phase1_part1_extensions_enums_tables` + `phase1_part2_indexes_triggers_guards` + `phase1_part3_rls_realtime`
**Applied:** 2026-06-02

### Tables (12)
| Table | Layer | Reads | Writes | Triggers |
|---|---|---|---|---|
| `agents` | Registry | All agents, CEO | n8n service role | updated_at |
| `products` | L4 Research/Product | Research, Product, CEO | Research Agent (service role) | updated_at, status_guard |
| `customers` | L4 CS/Email | CS, Email, CFO | Order webhook handler | updated_at |
| `orders` | L4 Fulfilment | Fulfilment, CS, Finance | Shopify webhook → n8n | updated_at |
| `order_events` | L4 Fulfilment | Fulfilment, CS | Fulfilment Agent | — (append-only) |
| `leads` | L4 Email | Email Agent | Klaviyo/popup webhooks | — |
| `content_assets` | L4 Content/Copy | Content, CMO | Content Agent | updated_at, status_guard |
| `decisions` | All agents | App (Realtime) | All agents (pending), Operator (resolve) | updated_at |
| `metrics_daily` | L3 CFO/Finance | Finance, CEO, App | Finance Agent nightly | dispute_rate_alert |
| `agent_logs` | All agents | App (Realtime), Watchdog | All agents | — (append-only) |
| `agent_memory` | All agents | All agents (pgvector ANN) | All agents | — |
| `tax_tracking` | L3 CFO | Finance, CEO | Finance Agent | updated_at, threshold_guard |

### Extensions
- `vector` (pgvector v0.8.0) — ANN index on agent_memory
- `citext` — case-insensitive email on customers, leads

### Key Constraints
- `products.price_exceeds_cost` — price > cost always
- `products.margin_pct` — computed STORED column
- `products` status guard — illegal transitions blocked at DB level
- `content_assets` status guard — publish requires approved decision
- `orders.dedupe_key` — idempotent Shopify webhook processing
- `tax_tracking` threshold guard — nearing=true at 90% of threshold
- `decisions` §8 invariant — enforced at trigger level for live/publish

### RLS
- All 12 tables: RLS ON, policies scoped to `authenticated` role
- anon: no policies = deny by default
- service_role: bypasses RLS (n8n server-side only)

### Realtime
- `decisions`, `agent_logs`, `orders`, `products`, `content_assets`

---

## Installed Skills (skills.sh)
| Skill | Source | License | Installed | Purpose |
|---|---|---|---|---|
| supabase-postgres-best-practices | supabase/agent-skills | MIT | 2026-06-02 | DB optimization guidance |
| supabase | supabase/agent-skills | MIT | 2026-06-02 | Full Supabase operations |
| webapp-testing | anthropics/skills | MIT | 2026-06-02 | Quality gate for all features |
| brand-guidelines | anthropics/skills | MIT | 2026-06-02 | Clariva Home brand voice enforcement |
| shopify-admin | shopify/shopify-ai-toolkit | MIT | 2026-06-02 | Shopify Admin API operations |

---

## Open Issues
1. **n8n Postgres backing** — n8n currently uses SQLite (ephemeral). Must be migrated to Supabase Postgres before agents are built. Render env vars require manual update (auto-mode blocks API write).
2. **Auth/MFA** — Supabase Auth email+password + TOTP AAL2 not yet configured (Phase 1 remaining item).
3. **Telegram bot** — TELEGRAM_BOT_TOKEN not yet obtained.
4. **UptimeRobot** — account created, monitor not yet configured.

---

## Secrets Inventory (§18)
All secrets stored in `C:\Users\deeva\NexusOS\.env` (gitignored) and Render env vars.
| Secret | Location | Status |
|---|---|---|
| SUPABASE_SERVICE_KEY | .env + Render | ✅ |
| SUPABASE_DB_PASSWORD | .env | ✅ |
| OPENAI_API_KEY | .env | ✅ |
| CJ_API_KEY | .env | ✅ |
| SHOPIFY_TOKEN | .env | ✅ |
| N8N_ADMIN_PASSWORD | .env | ✅ |
| N8N_ENCRYPTION_KEY | .env + Render | ✅ |
| TELEGRAM_BOT_TOKEN | — | ❌ pending |
| KLAVIYO_API_KEY | — | ❌ pending |
