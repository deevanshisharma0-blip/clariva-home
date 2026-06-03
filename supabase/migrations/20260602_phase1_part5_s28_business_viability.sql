-- migration: phase1_part5_s28_business_viability

-- 1. New enum: health_color
DO $$ BEGIN
  CREATE TYPE health_color AS ENUM ('GREEN', 'YELLOW', 'RED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. New enum: pause_reason
DO $$ BEGIN
  CREATE TYPE pause_reason AS ENUM (
    'refund_rate', 'dispute_rate', 'roas_deterioration',
    'fulfillment_delay', 'negative_cash_projection', 'operator_manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Extend products table (idempotent)
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN validation_stage1 jsonb DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN validation_stage2 jsonb DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN validation_stage3 jsonb DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE products ADD COLUMN validation_passed boolean GENERATED ALWAYS AS (
    (validation_stage1->>'supplier_verified')::boolean IS TRUE AND
    (validation_stage1->>'local_warehouse')::boolean IS TRUE AND
    (validation_stage1->>'shipping_verified')::boolean IS TRUE AND
    (validation_stage2->>'engagement_ok')::boolean IS TRUE AND
    (validation_stage2->>'trend_persists')::boolean IS TRUE AND
    (validation_stage2->>'not_saturated')::boolean IS TRUE AND
    (validation_stage3->>'projected_margin_ok')::boolean IS TRUE AND
    (validation_stage3->>'fulfillment_reliable')::boolean IS TRUE AND
    (validation_stage3->>'refund_risk_acceptable')::boolean IS TRUE
  ) STORED;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Trigger function: enforce product validation gate
CREATE OR REPLACE FUNCTION enforce_product_validation_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.validation_passed IS NOT TRUE THEN
    RAISE EXCEPTION 'Product cannot be approved: all three validation stages must pass first';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_validation_gate ON products;
CREATE TRIGGER trg_enforce_product_validation_gate
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_validation_gate();

-- 4. New table: cash_flow_state
CREATE TABLE IF NOT EXISTS cash_flow_state (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  computed_at              timestamptz DEFAULT now() NOT NULL,
  liquid_operating_capital numeric NOT NULL DEFAULT 0,
  fulfillment_reserve      numeric NOT NULL DEFAULT 0,
  refund_reserve           numeric NOT NULL DEFAULT 0,
  advertising_reserve      numeric NOT NULL DEFAULT 0,
  emergency_reserve        numeric NOT NULL DEFAULT 0,
  projected_cash_7d        numeric NOT NULL DEFAULT 0,
  projected_cash_30d       numeric NOT NULL DEFAULT 0,
  reserve_coverage_ratio   numeric GENERATED ALWAYS AS (
    CASE WHEN liquid_operating_capital > 0
    THEN ROUND((fulfillment_reserve + refund_reserve + advertising_reserve + emergency_reserve)
               / liquid_operating_capital * 100, 4)
    ELSE 0 END
  ) STORED,
  paid_acquisition_pct_cap numeric NOT NULL DEFAULT 20,
  scaling_blocked          boolean NOT NULL DEFAULT false,
  alert_triggered          boolean NOT NULL DEFAULT false,
  notes                    text,
  created_at               timestamptz DEFAULT now()
);

-- 5. New table: unit_economics_daily
CREATE TABLE IF NOT EXISTS unit_economics_daily (
  date                           date NOT NULL,
  source                         text NOT NULL DEFAULT 'computed',
  cac                            numeric DEFAULT 0,
  aov                            numeric DEFAULT 0,
  contribution_margin            numeric DEFAULT 0,
  gross_margin                   numeric DEFAULT 0,
  net_margin                     numeric DEFAULT 0,
  ltv                            numeric DEFAULT 0,
  payback_period_days            int DEFAULT 0,
  repeat_purchase_rate           numeric DEFAULT 0,
  blended_roas                   numeric DEFAULT 0,
  scaling_eligible               boolean NOT NULL DEFAULT false,
  cac_threshold                  numeric DEFAULT 50,
  payback_threshold_days         int DEFAULT 180,
  contribution_margin_threshold  numeric DEFAULT 0,
  computed_at                    timestamptz DEFAULT now(),
  created_at                     timestamptz DEFAULT now(),
  PRIMARY KEY (date, source)
);

-- 6. New table: competitor_intelligence
CREATE TABLE IF NOT EXISTS competitor_intelligence (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id       uuid REFERENCES products(id) ON DELETE SET NULL,
  competitor_name  text NOT NULL,
  tracked_url      text,
  price_observed   numeric,
  shipping_promise text,
  ad_frequency     numeric DEFAULT 0,
  promotions       jsonb DEFAULT '{}',
  content_patterns jsonb DEFAULT '{}',
  saturation_score numeric DEFAULT 0 CHECK (saturation_score >= 0 AND saturation_score <= 10),
  undercut_risk    boolean DEFAULT false,
  alert_flags      jsonb DEFAULT '{}',
  last_checked     timestamptz DEFAULT now(),
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at_competitor_intelligence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_competitor_intelligence ON competitor_intelligence;
CREATE TRIGGER trg_updated_at_competitor_intelligence
  BEFORE UPDATE ON competitor_intelligence
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_competitor_intelligence();

-- 7. New table: business_health_scores (created before system_pause_state so trigger can ref it)
CREATE TABLE IF NOT EXISTS business_health_scores (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scored_at                timestamptz DEFAULT now() NOT NULL,
  color                    health_color NOT NULL DEFAULT 'GREEN',
  overall_score            numeric NOT NULL DEFAULT 100 CHECK (overall_score >= 0 AND overall_score <= 100),
  margin_score             numeric DEFAULT 100,
  growth_score             numeric DEFAULT 100,
  refund_score             numeric DEFAULT 100,
  fulfillment_score        numeric DEFAULT 100,
  sentiment_score          numeric DEFAULT 100,
  liquidity_score          numeric DEFAULT 100,
  repeat_purchase_score    numeric DEFAULT 100,
  stability_score          numeric DEFAULT 100,
  scaling_enabled          boolean NOT NULL DEFAULT true,
  alert_frequency_mins     int NOT NULL DEFAULT 60,
  requires_operator_review boolean NOT NULL DEFAULT false,
  notes                    text,
  created_at               timestamptz DEFAULT now(),
  CONSTRAINT chk_health_color CHECK (color IN ('GREEN','YELLOW','RED'))
);

-- 8. New table: system_pause_state
CREATE TABLE IF NOT EXISTS system_pause_state (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pause_type           pause_reason NOT NULL,
  active               boolean NOT NULL DEFAULT false,
  triggered_value      numeric,
  threshold_value      numeric,
  triggered_by_health  boolean DEFAULT false,
  resolved_by          uuid,
  resolved_at          timestamptz,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  CONSTRAINT uq_pause_type UNIQUE (pause_type)
);

CREATE OR REPLACE FUNCTION set_updated_at_system_pause_state()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_system_pause_state ON system_pause_state;
CREATE TRIGGER trg_updated_at_system_pause_state
  BEFORE UPDATE ON system_pause_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_system_pause_state();

-- Seed one row per pause_reason (idempotent)
INSERT INTO system_pause_state (pause_type, active)
VALUES
  ('refund_rate',               false),
  ('dispute_rate',              false),
  ('roas_deterioration',        false),
  ('fulfillment_delay',         false),
  ('negative_cash_projection',  false),
  ('operator_manual',           false)
ON CONFLICT (pause_type) DO NOTHING;

-- Trigger on business_health_scores: auto-pause scaling when RED
-- Defined after system_pause_state exists
CREATE OR REPLACE FUNCTION trigger_health_red_pause()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.color = 'RED' THEN
    UPDATE system_pause_state
    SET active = true,
        triggered_by_health = true,
        updated_at = now()
    WHERE pause_type = 'roas_deterioration';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_health_red_pause ON business_health_scores;
CREATE TRIGGER trg_health_red_pause
  AFTER INSERT ON business_health_scores
  FOR EACH ROW EXECUTE FUNCTION trigger_health_red_pause();

-- 9. DB functions

CREATE OR REPLACE FUNCTION can_scale()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
    SELECT u.scaling_eligible
      AND NOT c.scaling_blocked
      AND (SELECT color FROM business_health_scores ORDER BY scored_at DESC LIMIT 1) = 'GREEN'
      AND (SELECT COUNT(*) FROM system_pause_state WHERE active = true) = 0
    FROM unit_economics_daily u
    CROSS JOIN cash_flow_state c
    ORDER BY u.date DESC, c.computed_at DESC
    LIMIT 1
  ), false);
$$;

CREATE OR REPLACE FUNCTION current_health_color()
RETURNS health_color LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT color FROM business_health_scores ORDER BY scored_at DESC LIMIT 1),
    'GREEN'::health_color
  );
$$;

CREATE OR REPLACE FUNCTION trigger_pause_if_needed(
  p_type           pause_reason,
  p_current_value  numeric,
  p_threshold      numeric
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO system_pause_state (pause_type, active, triggered_value, threshold_value, updated_at)
  VALUES (p_type, p_current_value > p_threshold, p_current_value, p_threshold, now())
  ON CONFLICT (pause_type) DO UPDATE SET
    active          = EXCLUDED.active,
    triggered_value = EXCLUDED.triggered_value,
    threshold_value = EXCLUDED.threshold_value,
    updated_at      = now();
END;
$$;

-- 10. RLS on all new tables
ALTER TABLE cash_flow_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE unit_economics_daily     ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_intelligence  ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_health_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_pause_state       ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_rw" ON cash_flow_state
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_rw" ON unit_economics_daily
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_rw" ON competitor_intelligence
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_rw" ON business_health_scores
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_rw" ON system_pause_state
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 11. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE business_health_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE system_pause_state;
ALTER PUBLICATION supabase_realtime ADD TABLE cash_flow_state;
