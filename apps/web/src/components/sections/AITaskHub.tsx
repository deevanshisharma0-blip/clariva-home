"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  Brain, RefreshCw, CheckCircle, XCircle, AlertTriangle, ChevronRight,
  Bot, DollarSign, TrendingUp, Shield, Zap, Play, Loader2, Wifi,
} from "lucide-react";
import { api, WS_URL } from "@/lib/api";
import { cn, timeAgo, RISK_COLORS } from "@/lib/utils";

interface PendingApproval {
  id: number; title: string; description: string; action_type: string;
  risk_level: string; estimated_cost: string; forecast: string;
  simulation?: Record<string, unknown>; created_at: string;
}
interface RecentTask {
  id: number; agent_name: string; agent_id: string; task: string;
  status: string; result?: Record<string, unknown>; created_at: string;
}
interface TaskHubData {
  pending_approvals: PendingApproval[];
  running_agents: { id: number; agent_id: string; name: string; department: string }[];
  recent_tasks: RecentTask[];
  briefing: Record<string, unknown> | null;
  briefing_updated_at: string | null;
  stats: { pending_approvals: number; agents_running: number; agents_total: number; tasks_today: number };
}
interface FlowStatus {
  is_running: boolean;
  agents_total: number;
  agents_running: number;
  pending_approvals: number;
  recent_tasks: RecentTask[];
  pending_items: { id: number; title: string; action_type: string; risk_level: string; estimated_cost: string; created_at: string }[];
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  ad_launch: Zap, campaign_create: Zap, product_import: TrendingUp,
  product_create: TrendingUp, price_change: DollarSign, discount_create: DollarSign,
  budget_cap_set: DollarSign, content_publish: TrendingUp, launch_checklist: Zap,
};

const AGENT_ICONS: Record<string, string> = {
  ceo: "🎯", product_research: "🔍", supplier: "📦", store_designer: "🎨",
  content: "✍️", ugc_creative: "🎬", marketing: "📣", analytics: "📊",
  customer_support: "💬", finance: "💰", automation: "⚙️", compliance: "🛡️",
  learning: "🧠", experimentation: "🧪", image_gen: "🖼️", video_gen: "🎥",
};

const FLOW_SEQUENCE = [
  { id: "ceo",              label: "CEO Analysis",       icon: "🎯" },
  { id: "product_research", label: "Product Scan",       icon: "🔍" },
  { id: "marketing",        label: "Marketing Audit",    icon: "📣" },
  { id: "finance",          label: "Finance Review",     icon: "💰" },
  { id: "analytics",        label: "KPI Check",          icon: "📊" },
  { id: "content",          label: "Copy Audit",         icon: "✍️" },
  { id: "compliance",       label: "Risk Check",         icon: "🛡️" },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function AITaskHub({ bizId, onNav }: { bizId: number; onNav: (s: string) => void }) {
  const [data,         setData]         = useState<TaskHubData | null>(null);
  const [flowStatus,   setFlowStatus]   = useState<FlowStatus | null>(null);
  const [flowRunning,  setFlowRunning]  = useState(false);
  const [flowDone,     setFlowDone]     = useState(false);
  const [doneAgents,   setDoneAgents]   = useState<Set<string>>(new Set());
  const [briefRefresh, setBriefRefresh] = useState(false);
  const [deciding,     setDeciding]     = useState<number | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [autopilot,    setAutopilot]    = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const loadHub = useCallback(() => {
    api.tasks.get(bizId).then(d => setData(d as TaskHubData)).catch(console.error);
  }, [bizId]);

  const loadFlow = useCallback(() => {
    api.flow.status(bizId).then(d => {
      const s = d as FlowStatus;
      setFlowStatus(s);
      setFlowRunning(s.is_running);
    }).catch(console.error);
  }, [bizId]);

  // WebSocket — listens for flow events
  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data as string) as Record<string, unknown>;
        if (ev.event === "flow_agent_done") {
          setDoneAgents(prev => new Set(prev).add(String(ev.agent_id)));
          loadHub();
          loadFlow();
        }
        if (ev.event === "flow_complete") {
          setFlowRunning(false);
          setFlowDone(true);
          loadHub();
          loadFlow();
        }
        if (ev.event === "flow_started") {
          setDoneAgents(new Set());
          setFlowDone(false);
          setFlowRunning(true);
        }
      } catch { /* ignore */ }
    };
    return () => ws.close();
  }, [loadHub, loadFlow]);

  useEffect(() => { loadHub(); loadFlow(); }, [loadHub, loadFlow]);

  // Poll while flow is running
  useEffect(() => {
    if (!flowRunning) return;
    const t = setInterval(() => { loadHub(); loadFlow(); }, 5000);
    return () => clearInterval(t);
  }, [flowRunning, loadHub, loadFlow]);

  const runFlow = async () => {
    setFlowRunning(true);
    setFlowDone(false);
    setDoneAgents(new Set());
    await api.flow.run(bizId);
  };

  const refreshBriefing = async () => {
    setBriefRefresh(true);
    await api.tasks.refreshBriefing(bizId);
    setTimeout(() => { setBriefRefresh(false); loadHub(); }, 3000);
  };

  const decide = async (id: number, decision: "approved" | "declined") => {
    setDeciding(id);
    await api.approvals.decide(id, decision);
    await loadHub();
    await loadFlow();
    setDeciding(null);
  };

  const approveAll = async () => {
    const pending = data?.pending_approvals ?? [];
    if (pending.length === 0) return;
    setApprovingAll(true);
    for (const a of pending) {
      await api.approvals.decide(a.id, "approved");
    }
    await loadHub();
    await loadFlow();
    setApprovingAll(false);
  };

  const runAutopilot = async () => {
    setAutopilot(true);
    setFlowRunning(true);
    setFlowDone(false);
    setDoneAgents(new Set());
    await api.flow.run(bizId);
    // Poll until flow finishes, then approve all
    const poll = setInterval(async () => {
      const s = await api.flow.status(bizId) as FlowStatus;
      if (!s.is_running) {
        clearInterval(poll);
        setFlowRunning(false);
        setFlowDone(true);
        await loadHub();
        // Auto-approve everything the agents created
        const d = await api.tasks.get(bizId) as TaskHubData;
        for (const a of d.pending_approvals ?? []) {
          await api.approvals.decide(a.id, "approved");
        }
        await loadHub();
        await loadFlow();
        setAutopilot(false);
      }
    }, 6000);
  };

  const pendingItems = flowStatus?.pending_items ?? [];
  const hubApprovals = data?.pending_approvals ?? [];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{greeting()} 👋</h1>
          <p className="text-sm text-muted mt-0.5">AI is watching your business — here's everything that needs you</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Run All Agents */}
          <button
            onClick={runFlow}
            disabled={flowRunning || autopilot}
            title="Run all 7 AI agents — they'll analyse your business and create tasks"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              flowRunning || autopilot
                ? "bg-primary-dim text-primary-light cursor-not-allowed"
                : flowDone
                ? "bg-success-dim text-success border border-success/30"
                : "bg-surface border border-border text-text-primary hover:border-primary/40 hover:text-primary-light"
            )}
          >
            {flowRunning && !autopilot ? <Loader2 size={15} className="animate-spin" /> : flowDone && !autopilot ? <CheckCircle size={15} /> : <Play size={15} />}
            {flowRunning && !autopilot ? "Analyzing…" : flowDone && !autopilot ? "Done" : "Run Agents"}
          </button>

          {/* Full Autopilot — run agents + approve all */}
          <button
            onClick={runAutopilot}
            disabled={flowRunning || autopilot}
            title="Run all agents AND auto-approve every task they create"
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              autopilot
                ? "bg-primary-dim text-primary-light cursor-not-allowed animate-pulse"
                : "bg-primary text-white hover:bg-primary-light shadow-lg shadow-primary/25"
            )}
          >
            {autopilot ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            {autopilot ? "Autopilot Running…" : "⚡ Full Autopilot"}
          </button>
        </div>
      </div>

      {/* Flow pipeline — agent-by-agent progress */}
      {(flowRunning || flowDone) && (
        <div className="bg-card border border-primary/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("w-2 h-2 rounded-full", flowRunning ? "bg-primary animate-pulse" : "bg-success")} />
            <span className="text-xs font-semibold text-text-primary">
              {flowRunning ? "Agents running analysis…" : "All agents done — tasks updated below"}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FLOW_SEQUENCE.map((agent, i) => {
              const done = doneAgents.has(agent.id);
              const running = flowRunning && !done && (
                i === 0 || doneAgents.has(FLOW_SEQUENCE[i - 1]?.id ?? "")
              );
              return (
                <div key={agent.id} className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition-all",
                  done    ? "bg-success-dim border-success/30 text-success" :
                  running ? "bg-primary-dim border-primary/40 text-primary-light" :
                  "bg-surface border-border text-muted"
                )}>
                  <span>{agent.icon}</span>
                  <span>{agent.label}</span>
                  {done    && <CheckCircle size={10} />}
                  {running && <Loader2 size={10} className="animate-spin" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Pending Decision", value: hubApprovals.length,              color: hubApprovals.length > 0 ? "text-warning" : "text-success",       urgent: hubApprovals.length > 0 },
          { label: "Agents Running",   value: data?.stats.agents_running ?? 0,  color: (data?.stats.agents_running ?? 0) > 0 ? "text-primary-light" : "text-muted", urgent: false },
          { label: "Tasks Today",      value: data?.stats.tasks_today ?? 0,     color: "text-text-primary", urgent: false },
          { label: "Total Agents",     value: data?.stats.agents_total ?? 16,   color: "text-text-secondary", urgent: false },
        ].map(s => (
          <div key={s.label} className={cn("bg-card border rounded-xl px-4 py-3", s.urgent ? "border-warning/30" : "border-border")}>
            <div className="text-[10px] text-muted uppercase tracking-wider mb-1">{s.label}</div>
            <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Pending Tasks — created by AI agents */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className={hubApprovals.length > 0 ? "text-warning" : "text-muted"} />
              <span className="text-sm font-semibold text-text-primary">Pending Tasks</span>
              {hubApprovals.length > 0 && (
                <span className="text-[10px] font-bold bg-warning text-bg px-1.5 py-0.5 rounded-full">
                  {hubApprovals.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hubApprovals.length > 1 && (
                <button
                  onClick={approveAll}
                  disabled={approvingAll}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success text-white text-[10px] font-bold hover:bg-success/90 transition-colors disabled:opacity-50"
                >
                  {approvingAll ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                  {approvingAll ? "Approving…" : `Approve All (${hubApprovals.length})`}
                </button>
              )}
              <button onClick={() => onNav("approvals")}
                className="flex items-center gap-1 text-[10px] text-muted hover:text-primary-light transition-colors">
                All approvals <ChevronRight size={11} />
              </button>
            </div>
          </div>
          <div className="divide-y divide-border/50 max-h-80 overflow-y-auto">
            {hubApprovals.length === 0 ? (
              <div className="text-center py-10">
                <CheckCircle size={22} className="mx-auto mb-2 text-success opacity-50" />
                <p className="text-xs text-muted">No pending tasks</p>
                {!flowRunning && (
                  <button onClick={runFlow} className="mt-2 text-[10px] text-primary-light hover:underline">
                    Run AI analysis to generate tasks
                  </button>
                )}
              </div>
            ) : hubApprovals.map(a => {
              const Icon = ACTION_ICONS[a.action_type] ?? Shield;
              return (
                <div key={a.id} className="px-4 py-3 hover:bg-card-hover transition-colors">
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary-dim flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={13} className="text-primary-light" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-text-primary">{a.title}</div>
                      <div className="text-[10px] text-text-secondary mt-0.5 line-clamp-2">{a.description}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-semibold", RISK_COLORS[a.risk_level])}>
                          {a.risk_level.toUpperCase()} RISK
                        </span>
                        <span className="text-[10px] text-muted">{a.estimated_cost}</span>
                        <span className="text-[10px] text-muted">{timeAgo(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-9">
                    <button onClick={() => decide(a.id, "approved")} disabled={deciding === a.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success text-white text-[10px] font-semibold hover:bg-success/90 transition-colors disabled:opacity-50">
                      <CheckCircle size={10} /> APPROVE
                    </button>
                    <button onClick={() => decide(a.id, "declined")} disabled={deciding === a.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface border border-border text-muted text-[10px] font-semibold hover:text-danger hover:border-danger/30 transition-colors disabled:opacity-50">
                      <XCircle size={10} /> DECLINE
                    </button>
                    {deciding === a.id && <Loader2 size={12} className="text-muted animate-spin self-center" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Briefing */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-primary-light" />
              <span className="text-sm font-semibold text-text-primary">AI Briefing</span>
              {data?.briefing_updated_at && (
                <span className="text-[10px] text-muted">{timeAgo(data.briefing_updated_at)}</span>
              )}
            </div>
            <button onClick={refreshBriefing} disabled={briefRefresh}
              className="flex items-center gap-1 text-[10px] text-muted hover:text-primary-light disabled:opacity-40 transition-colors">
              <RefreshCw size={11} className={briefRefresh ? "animate-spin" : ""} />
              {briefRefresh ? "Generating…" : "Refresh"}
            </button>
          </div>
          <div className="p-4">
            {briefRefresh ? (
              <div className="text-center py-6">
                <Brain size={24} className="mx-auto mb-2 text-primary-light animate-pulse" />
                <p className="text-xs text-muted">CEO Agent thinking… (~2 min on local AI)</p>
              </div>
            ) : data?.briefing ? (
              <div className="space-y-3">
                {data.briefing.summary && (
                  <p className="text-xs text-text-secondary leading-relaxed">{String(data.briefing.summary)}</p>
                )}
                {Array.isArray(data.briefing.actions) && (data.briefing.actions as string[]).length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Priority Actions</div>
                    <div className="space-y-1.5">
                      {(data.briefing.actions as string[]).slice(0, 3).map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="text-primary-light shrink-0 font-bold">{i + 1}.</span>
                          <span className="text-text-primary">{a}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(data.briefing.risks) && (data.briefing.risks as string[]).length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted uppercase tracking-wider mb-1.5">Watch</div>
                    {(data.briefing.risks as string[]).slice(0, 2).map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-warning">
                        <AlertTriangle size={10} className="shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
                {data.briefing._model && (
                  <div className="text-[10px] text-muted pt-1 border-t border-border flex items-center gap-1">
                    <Wifi size={9} /> Powered by {String(data.briefing._model)} (local AI)
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8">
                <Brain size={24} className="mx-auto mb-2 text-muted opacity-30" />
                <p className="text-xs text-muted mb-3">No briefing yet</p>
                <button onClick={runFlow} disabled={flowRunning}
                  className="px-3 py-1.5 bg-primary text-white text-xs rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50">
                  {flowRunning ? "Running…" : "Run AI Analysis"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agent Activity feed */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={14} className="text-primary-light" />
            <span className="text-sm font-semibold text-text-primary">Agent Activity</span>
            {flowRunning && (
              <span className="text-[10px] text-primary-light flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" /> live
              </span>
            )}
          </div>
          <button onClick={() => onNav("agents")}
            className="flex items-center gap-1 text-[10px] text-muted hover:text-primary-light transition-colors">
            Manage <ChevronRight size={11} />
          </button>
        </div>
        <div className="divide-y divide-border/50">
          {(!data?.recent_tasks.length && !data?.running_agents.length) ? (
            <div className="text-center py-8 text-xs text-muted">
              No activity yet — click <strong className="text-primary-light">Run AI Analysis</strong> above
            </div>
          ) : (
            (data?.recent_tasks ?? []).slice(0, 6).map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-hover transition-colors">
                <span className="text-base shrink-0">{AGENT_ICONS[t.agent_id] ?? "🤖"}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-text-primary">{t.agent_name}</span>
                  <span className="text-muted text-xs mx-1.5">·</span>
                  <span className="text-xs text-text-secondary">{t.task}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded",
                    t.status === "completed" ? "bg-success-dim text-success" :
                    t.status === "running"   ? "bg-primary-dim text-primary-light" :
                    t.status === "failed"    ? "bg-danger-dim text-danger" : "bg-surface text-muted"
                  )}>{t.status}</span>
                  <span className="text-[10px] text-muted">{timeAgo(t.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick nav */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Quick Navigation</div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Approvals",   section: "approvals",    icon: "✅", badge: hubApprovals.length },
            { label: "Products",    section: "products",     icon: "📦" },
            { label: "Marketing",   section: "marketing",    icon: "📣" },
            { label: "Finance",     section: "finance",      icon: "💰" },
            { label: "Analytics",   section: "analytics",    icon: "📊" },
            { label: "Telemetry",   section: "observability",icon: "📡" },
            { label: "Workflows",   section: "workflows",    icon: "⚙️" },
            { label: "Settings",    section: "settings",     icon: "🔧" },
          ].map(q => (
            <button key={q.section} onClick={() => onNav(q.section)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-card-hover border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors relative">
              <span>{q.icon}</span>
              {q.label}
              {q.badge ? (
                <span className="absolute -top-1 -right-1 text-[9px] bg-warning text-bg px-1 rounded-full font-bold">{q.badge}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
