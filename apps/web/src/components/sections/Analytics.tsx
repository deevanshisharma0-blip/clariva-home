"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { GitBranch, Activity, CheckCircle, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

const AGENT_ICONS: Record<string, string> = {
  ceo: "🎯", product_research: "🔍", supplier: "📦", store_designer: "🎨",
  content: "✍️", ugc_creative: "🎬", image_gen: "🖼️", video_gen: "🎥",
  marketing: "📣", analytics: "📊", customer_support: "💬", finance: "💰",
  automation: "⚙️", experimentation: "🧪", learning: "🧠", compliance: "🛡️",
};

interface Task { id: number; agent_id: number; agent_name: string; task: string; status: string; created_at: string; duration_ms: number | null }

function CausationNode({ icon, name, status, connect }: { icon: string; name: string; status: string; connect?: boolean }) {
  return (
    <div className="flex items-center gap-0">
      <div className={cn(
        "flex flex-col items-center gap-1.5 px-2",
      )}>
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-lg border transition-colors",
          status === "completed" ? "bg-success-dim border-success/30" :
          status === "running"   ? "bg-primary-dim border-primary/40 animate-pulse" :
          status === "failed"    ? "bg-danger-dim border-danger/30" :
          "bg-card border-border"
        )}>
          {icon}
        </div>
        <div className="text-[9px] text-muted text-center max-w-[60px] truncate">{name}</div>
      </div>
      {connect && <div className="h-px w-5 bg-border flex-shrink-0 mx-0.5" />}
    </div>
  );
}

export default function Analytics({ bizId }: { bizId: number }) {
  const [trend,    setTrend]    = useState<{ date: string; revenue: number }[]>([]);
  const [activity, setActivity] = useState<Task[]>([]);
  const [kpis,     setKpis]     = useState<Record<string, string | number> | null>(null);

  useEffect(() => {
    Promise.all([
      api.analytics.revenueTrend(bizId, 14),
      api.analytics.agentActivity(bizId),
      api.analytics.kpis(bizId),
    ]).then(([t, a, k]) => {
      setTrend(t as { date: string; revenue: number }[]);
      setActivity(a as Task[]);
      setKpis(k as Record<string, string | number>);
    });
  }, [bizId]);

  // Build causation chain from recent activity
  const recentAgents = [...new Map(activity.map(t => [t.agent_name, t])).values()].slice(0, 6);

  const kpiItems = kpis ? [
    { label: "CVR",          value: kpis.cvr         },
    { label: "AOV",          value: kpis.aov         },
    { label: "Gross Margin", value: kpis.gross_margin },
    { label: "Refund Rate",  value: kpis.refund_rate },
  ] : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Analytics & Causation</h1>
        <p className="text-sm text-muted mt-0.5">KPI trends · Agent causation · Event intelligence</p>
      </div>

      {/* KPI snapshot */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiItems.map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl px-4 py-3">
            <div className="text-[10px] text-muted uppercase tracking-widest mb-1">{k.label}</div>
            <div className="text-lg font-bold text-text-primary">{String(k.value)}</div>
          </div>
        ))}
      </div>

      {/* Revenue + Causation */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue trend */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Revenue Trend (14d)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="rev2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#rev2)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Causation engine */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch size={14} className="text-primary-light" />
            <h3 className="text-sm font-semibold text-text-primary">Agent Causation Chain</h3>
          </div>
          {recentAgents.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="flex items-center min-w-max py-2">
                {recentAgents.map((t, i) => (
                  <CausationNode
                    key={t.agent_name}
                    icon={AGENT_ICONS[t.agent_id] ?? "🤖"}
                    name={t.agent_name}
                    status={t.status}
                    connect={i < recentAgents.length - 1}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted">
              <GitBranch size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs">Run agents to see causation chain</p>
            </div>
          )}
          <p className="text-[10px] text-muted mt-3">Shows which agents ran and their sequence of impact</p>
        </div>
      </div>

      {/* Event timeline */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Activity size={14} className="text-primary-light" />
          <h3 className="text-sm font-semibold text-text-primary">Agent Activity Timeline</h3>
        </div>
        <div className="divide-y divide-border/50">
          {activity.length === 0 ? (
            <div className="text-center py-10 text-muted text-xs">No agent activity yet — run an agent to start</div>
          ) : (
            activity.slice(0, 12).map(t => (
              <div key={t.id} className="flex items-center gap-4 px-5 py-3 hover:bg-card-hover transition-colors">
                <div className={cn("w-2 h-2 rounded-full shrink-0",
                  t.status === "completed" ? "bg-success" :
                  t.status === "running"   ? "bg-primary animate-pulse" :
                  t.status === "failed"    ? "bg-danger" : "bg-muted"
                )} />
                <span className="text-sm shrink-0">{AGENT_ICONS[t.agent_id] ?? "🤖"}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-text-primary">{t.agent_name}</span>
                  <span className="text-muted mx-2">·</span>
                  <span className="text-xs text-text-secondary truncate">{t.task}</span>
                </div>
                <div className="text-right shrink-0">
                  {t.duration_ms && <div className="text-[10px] text-muted">{t.duration_ms}ms</div>}
                  <div className="text-[10px] text-muted">{timeAgo(t.created_at)}</div>
                </div>
                {t.status === "completed" ? <CheckCircle size={12} className="text-success shrink-0" /> : t.status === "failed" ? <AlertCircle size={12} className="text-danger shrink-0" /> : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
