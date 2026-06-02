# TEST_LOG.md — Clariva Home

---

## Phase 1 — Supabase Schema + RLS + Realtime
**Date:** 2026-06-02

| # | Test | Type | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|
| 1 | All 12 tables exist | Integration | 12 rows in information_schema.tables | 12 rows: agents, products, customers, orders, order_events, leads, content_assets, decisions, metrics_daily, agent_logs, agent_memory, tax_tracking | ✅ PASS |
| 2 | vector extension installed + ivfflat index | Integration | extname=vector, idx_agent_memory_emb present | ivfflat index on agent_memory(embedding vector_cosine_ops) lists=100 confirmed | ✅ PASS |
| 3 | Illegal product status transition blocked (candidate→live) | Unit | RAISE EXCEPTION | ERROR P0001: Illegal product status transition: candidate → live | ✅ PASS |
| 4 | price_exceeds_cost CHECK constraint | Unit | RAISE EXCEPTION on cost>price | ERROR 23514: violates check constraint "price_exceeds_cost" | ✅ PASS |
| 5 | margin_pct computed column | Unit | margin_pct = ROUND((price-cost)/price*100, 2) | (39.99-12.00)/39.99*100 = 69.99% ✓ | ✅ PASS |
| 6 | GST/HST threshold guard auto-sets nearing=true | Unit | nearing=true when taxable_sales >= threshold*0.9 | 27500 >= 27000 → nearing=true ✓ | ✅ PASS |
| 7 | orders.dedupe_key uniqueness | Unit | ERROR 23505 on duplicate key | ERROR 23505: duplicate key value violates unique constraint | ✅ PASS |
| 8 | RLS policies: authenticated only, anon denied | Integration | 12 policies all bound to {authenticated}, no anon policies | Confirmed: all 12 tables have single policy scoped to authenticated role only | ✅ PASS |
| 9 | Realtime publication on 5 operator tables | Integration | agent_logs, content_assets, decisions, orders, products in supabase_realtime | All 5 confirmed in pg_publication_tables | ✅ PASS |

**All 9 tests: PASS. Zero failures.**
