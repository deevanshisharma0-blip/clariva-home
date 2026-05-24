export interface Business {
  id: number;
  name: string;
  slug: string;
  type: string;
  shopify_domain: string | null;
  logo_emoji: string;
  color: string;
  active: boolean;
}

export interface Agent {
  id: number;
  business_id: number;
  agent_id: string;
  name: string;
  department: string;
  status: "idle" | "running" | "error" | "done";
  last_run: string | null;
  next_run: string | null;
  tasks_completed: number;
  tasks_failed: number;
  load: number;
}

export interface Approval {
  id: number;
  business_id: number;
  title: string;
  description: string;
  action_type: string;
  risk_level: "low" | "medium" | "high" | "critical";
  estimated_cost: string;
  forecast: string;
  status: "pending" | "approved" | "declined" | "revision";
  payload?: Record<string, unknown>;
  simulation?: Record<string, unknown>;
  decision_note?: string;
  created_at: string;
  decided_at?: string;
  execution_status?: "running" | "success" | "simulated" | "skipped" | "failed" | null;
  execution_result?: Record<string, unknown> | null;
  executed_at?: string | null;
}

export interface Product {
  id: number;
  business_id: number;
  name: string;
  sku: string | null;
  price_cad: number;
  cogs_cad: number;
  supplier: string;
  status: string;
  demand_score: number;
  margin_pct: number;
  orders_7d: number;
  revenue_7d: number;
  rating: number;
  reviews: number;
  hero: boolean;
}

export interface Creative {
  id: number;
  business_id: number;
  hook: string;
  platform: string;
  creative_type: string;
  status: string;
  roas: number;
  cac: number;
  views: number;
  content?: string;
  created_at: string;
}

export interface KPIs {
  revenue_24h: string;
  revenue_7d: string;
  orders_24h: number;
  orders_7d: number;
  cac: string;
  roas: string;
  cvr: string;
  aov: string;
  refund_rate: string;
  sessions_24h: number;
  ad_spend_7d: string;
  net_margin_7d: string;
  gross_margin: string;
}

export interface SystemHealth {
  status: string;
  agents_total: number;
  agents_running: number;
  agents_error: number;
  database: string;
  api: string;
}

export type Section =
  | "tasks"
  | "executive"
  | "agents"
  | "approvals"
  | "products"
  | "creative"
  | "marketing"
  | "finance"
  | "analytics"
  | "observability"
  | "stores"
  | "workflows"
  | "settings";
