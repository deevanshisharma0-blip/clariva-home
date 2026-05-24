"use client";
import { useEffect, useState, useCallback } from "react";
import { Play, RefreshCw, AlertTriangle, CheckCircle, Clock, Cpu } from "lucide-react";
import { api } from "@/lib/api";
import type { Agent } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const DEPT_COLORS: Record<string, string> = {
  Executive: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Merchandising: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Operations: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Storefront: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Creative: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Growth: "bg-green-500/10 text-green-400 border-green-500/20",
  Data: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Support: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Finance: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Ops: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "AI Ops": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Risk: "bg-red-500/10 text-red-400 border-red-500/20",
};

const ICONS: Record<string, string> = {
  ceo: "🎯", product_research: "🔍", supplier: "📦", store_designer: "🎨",
  content: "✍️", ugc_creative: "🎬", image_gen: "🖼️", video_gen: "🎥",
  marketing: "📣", analytics: "📊", customer_support: "💬", finance: "💰",
  automation: "⚙️", experimentation: "🧪", learning: "🧠", compliance: "🛡️",
};

function StatusDot({ status }: { status: string }) {
  const cls = {
    running: "bg-success shadow-[0_0_6px_#10b981]",
    idle: "bg-text-dim",
    error: "bg-danger shadow-[0_0_6px_#ef4444]",
    done: "bg-primary-light",
  }[status] ?? "bg-text-dim";
  return <span className={cn("w-2 h-2 rounded-full inline-block shrink-0", cls, status === "running" && "animate-pulse")} />;
}

function AgentCard({ agent, onRun }: { agent: Agent; onRun: (a: Agent) => void }) {
  const deptClass = DEPT_COLORS[agent.department] ?? "bg-white/5 text-text-secondary border-white/10";
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-4 hover:border-border-strong transition-all duration-200 hover:bg-card-hover flex flex-col gap-3",
      agent.status === "running" && "border-success/30",
      agent.status === "error" && "border-danger/30",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{ICONS[agent.agent_id] ?? "🤖"}</span>
          <div>
            <div className="text-sm font-semibold text-text-primary leading-tight">{agent.name}</div>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded border mt-1 inline-block", deptClass)}>
              {agent.department}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusDot status={agent.status} />
          <span className="text-xs text-muted capitalize">{agent.status}</span>
        </div>
      </div>

      {/* Load bar */}
      <div>
        <div className="flex justify-between text-[10px] text-muted mb-1">
          <span>Load</span><span>{agent.load}%</span>
        </div>
        <div className="h-1 bg-surface rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", agent.load > 80 ? "bg-danger" : agent.load > 50 ? "bg-warning" : "bg-primary")}
            style={{ width: `${agent.load}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted">
          {agent.last_run ? timeAgo(agent.last_run) : "Never run"} · {agent.tasks_completed} done
        </div>
        <button
          onClick={() => onRun(agent)}
          disabled={agent.status === "running"}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-primary-dim text-primary-light hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {agent.status === "running" ? <RefreshCw size={10} className="animate-spin" /> : <Play size={10} />}
          {agent.status === "running" ? "Running" : "Run"}
        </button>
      </div>
    </div>
  );
}

export default function AgentControlCenter({ bizId }: { bizId: number }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);

  const load = useCallback(() => {
    api.agents.list(bizId).then((data) => {
      setAgents(data as Agent[]);
      setLoading(false);
    }).catch(console.error);
  }, [bizId]);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const handleRun = async (agent: Agent) => {
    setRunningAgent(agent.agent_id);
    try {
      await api.agents.run(bizId, agent.agent_id, `Run ${agent.name} daily cycle`, {});
      setTimeout(load, 1000);
    } catch (e) { console.error(e); }
    finally { setTimeout(() => setRunningAgent(null), 2000); }
  };

  const byDept = agents.reduce<Record<string, Agent[]>>((acc, a) => {
    (acc[a.department] ??= []).push(a);
    return acc;
  }, {});

  const running = agents.filter((a) => a.status === "running").length;
  const errors = agents.filter((a) => a.status === "error").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Agent Control Center</h1>
          <p className="text-sm text-muted mt-0.5">16 autonomous agents · click to run</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-success"><span className="w-2 h-2 rounded-full bg-success animate-pulse" />{running} running</span>
          {errors > 0 && <span className="flex items-center gap-1.5 text-danger"><AlertTriangle size={12} />{errors} errors</span>}
          <span className="flex items-center gap-1.5 text-muted"><Cpu size={12} />{agents.length} agents</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 h-36 animate-pulse" />
          ))}
        </div>
      ) : (
        Object.entries(byDept).map(([dept, deptAgents]) => (
          <div key={dept}>
            <h3 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">{dept}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {deptAgents.map((a) => (
                <AgentCard key={a.id} agent={a} onRun={handleRun} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
