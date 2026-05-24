"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, ShoppingCart, Users, DollarSign, Zap, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { KPIs, Approval } from "@/lib/types";
import { cn, timeAgo, RISK_COLORS } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  tone?: "neutral" | "good" | "warn" | "bad";
  glow?: boolean;
}

function KPICard({ label, value, sub, icon: Icon, tone = "neutral", glow }: KPICardProps) {
  const toneClass = { neutral: "text-text-secondary", good: "text-success", warn: "text-warning", bad: "text-danger" }[tone];
  return (
    <div className={cn("bg-card border border-border rounded-xl p-4 flex flex-col gap-3 hover:border-border-strong transition-colors", glow && "glow-primary")}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted uppercase tracking-widest">{label}</span>
        <div className="w-7 h-7 rounded-lg bg-primary-dim flex items-center justify-center">
          <Icon size={13} className="text-primary-light" />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-text-primary">{value}</div>
        {sub && <div className={cn("text-xs mt-0.5", toneClass)}>{sub}</div>}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs">
      <div className="text-muted mb-1">{label}</div>
      <div className="text-text-primary font-semibold">${payload[0].value.toLocaleString()}</div>
    </div>
  );
};

export default function ExecutiveDashboard({ bizId }: { bizId: number }) {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [trend, setTrend] = useState<{ date: string; revenue: number }[]>([]);
  const [approvals, setApprovals] = useState<{ pending_count: number; recent: Approval[] } | null>(null);
  const [health, setHealth] = useState<{ status: string; agents_running: number; agents_error: number; agents_total: number } | null>(null);

  useEffect(() => {
    Promise.all([
      api.analytics.kpis(bizId),
      api.analytics.revenueTrend(bizId, 14),
      api.analytics.approvalsSummary(bizId),
      api.analytics.systemHealth(bizId),
    ]).then(([k, t, a, h]) => {
      setKpis(k as KPIs);
      setTrend(t as { date: string; revenue: number }[]);
      setApprovals(a as { pending_count: number; recent: Approval[] });
      setHealth(h as { status: string; agents_running: number; agents_error: number; agents_total: number });
    }).catch(console.error);
  }, [bizId]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Executive Dashboard</h1>
          <p className="text-sm text-muted mt-0.5">Live business intelligence</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("w-2 h-2 rounded-full", health?.status === "operational" ? "bg-success" : "bg-warning")} />
          <span className="text-muted">{health?.status === "operational" ? "All systems operational" : "Degraded"}</span>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Revenue 7d" value={kpis?.revenue_7d ?? "—"} sub="Shopify net" icon={DollarSign} tone="neutral" />
        <KPICard label="Orders 7d" value={kpis?.orders_7d ?? "—"} sub="Fulfilled via CJ" icon={ShoppingCart} tone="neutral" />
        <KPICard label="ROAS" value={kpis?.roas ?? "—"} sub="No active campaigns" icon={TrendingUp} tone="neutral" />
        <KPICard label="Sessions 24h" value={kpis?.sessions_24h ?? "—"} sub="Organic baseline" icon={Users} tone="neutral" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="CAC" value={kpis?.cac ?? "—"} sub={`Target: $15 CAD`} icon={Zap} />
        <KPICard label="AOV" value={kpis?.aov ?? "—"} sub="Avg order value" icon={DollarSign} />
        <KPICard label="Gross Margin" value={kpis?.gross_margin ?? "—"} sub="Per unit" icon={TrendingUp} tone="good" />
        <KPICard label="Ad Spend 7d" value={kpis?.ad_spend_7d ?? "—"} sub="Under $25 CAD budget" icon={DollarSign} />
      </div>

      {/* Revenue Chart + Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-text-primary">Revenue Trend</h3>
            <span className="text-xs text-muted">14 days</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pending Approvals */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Pending Approvals</h3>
            {approvals && approvals.pending_count > 0 && (
              <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                {approvals.pending_count}
              </span>
            )}
          </div>
          <div className="space-y-2">
            {approvals?.recent?.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-surface hover:bg-card-hover transition-colors">
                <div className={cn("mt-0.5 shrink-0", a.status === "pending" ? "text-warning" : a.status === "approved" ? "text-success" : "text-danger")}>
                  {a.status === "pending" ? <Clock size={13} /> : a.status === "approved" ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-text-primary truncate">{a.title}</div>
                  <div className={cn("text-[10px] mt-0.5 px-1.5 py-0.5 rounded inline-block", RISK_COLORS[a.risk_level])}>
                    {a.risk_level}
                  </div>
                </div>
              </div>
            ))}
            {(!approvals?.recent?.length) && (
              <div className="text-xs text-muted text-center py-6">No approvals yet</div>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Agents Active", value: `${health?.agents_running ?? 0} / ${health?.agents_total ?? 16}`, ok: true },
          { label: "Agents Error", value: health?.agents_error ?? 0, ok: (health?.agents_error ?? 0) === 0 },
          { label: "API Status", value: "Healthy", ok: true },
          { label: "Monthly Cost", value: "< $25 CAD", ok: true },
        ].map((item) => (
          <div key={item.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className={cn("w-2 h-2 rounded-full shrink-0", item.ok ? "bg-success" : "bg-danger")} />
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider">{item.label}</div>
              <div className="text-sm font-semibold text-text-primary mt-0.5">{String(item.value)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
