"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Activity, Cpu, CheckCircle, AlertCircle, Database, Wifi } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { BASE_URL, WS_URL } from "@/lib/api";

interface Log  { id: number; agent_id: string; agent_name: string; task: string; status: string; started_at: string | null; duration_ms: number | null; error: string | null }
interface Metrics { agents: { total: number; running: number; idle: number; error: number }; tasks: { total: number; completed: number; failed: number; success_rate: number }; approvals: { total: number; pending: number }; system: { api: string; database: string; uptime_pct: number } }
interface AgentPerf { agent_id: string; name: string; department: string; tasks_completed: number; tasks_failed: number; success_rate: number; status: string }
interface WsEvent  { id: number; type: string; data: string; ts: string }

const STATUS_DOT: Record<string, string> = {
  completed: "bg-success",
  running:   "bg-primary animate-pulse",
  failed:    "bg-danger",
  pending:   "bg-warning",
};

export default function Observability({ bizId }: { bizId: number }) {
  const [logs,     setLogs]     = useState<Log[]>([]);
  const [metrics,  setMetrics]  = useState<Metrics | null>(null);
  const [perf,     setPerf]     = useState<AgentPerf[]>([]);
  const [wsEvents, setWsEvents] = useState<WsEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const eventId = useRef(0);

  const loadData = useCallback(() => {
    const B = `${BASE_URL}/api/observability/${bizId}`;
    Promise.all([
      fetch(`${B}/logs?limit=20`).then(r => r.json()),
      fetch(`${B}/metrics`).then(r => r.json()),
      fetch(`${B}/agent-performance`).then(r => r.json()),
    ]).then(([l, m, p]) => { setLogs(l as Log[]); setMetrics(m as Metrics); setPerf(p as AgentPerf[]); })
      .catch(console.error);
  }, [bizId]);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 5000);

    // WebSocket live events
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen  = () => setWsStatus("open");
    ws.onclose = () => setWsStatus("closed");
    ws.onerror = () => setWsStatus("closed");
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as Record<string, unknown>;
        setWsEvents(prev => [{
          id:   ++eventId.current,
          type: String(data.event ?? "event"),
          data: JSON.stringify(data),
          ts:   new Date().toISOString(),
        }, ...prev.slice(0, 29)]);
      } catch { /* ignore */ }
    };

    return () => { clearInterval(t); ws.close(); };
  }, [loadData]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Telemetry & Observability</h1>
          <p className="text-sm text-muted mt-0.5">Agent logs · Metrics · Live event stream</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Wifi size={12} className={wsStatus === "open" ? "text-success" : "text-danger"} />
          <span className={wsStatus === "open" ? "text-success" : "text-danger"}>
            WebSocket {wsStatus}
          </span>
        </div>
      </div>

      {/* System metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Agents Running",  value: `${metrics.agents.running} / ${metrics.agents.total}`,    icon: Cpu,           ok: metrics.agents.error === 0 },
            { label: "Task Success",    value: `${metrics.tasks.success_rate}%`,                         icon: CheckCircle,   ok: metrics.tasks.success_rate >= 90 },
            { label: "Pending Approvals",value: String(metrics.approvals.pending),                       icon: AlertCircle,   ok: metrics.approvals.pending === 0 },
            { label: "Uptime",          value: `${metrics.system.uptime_pct}%`,                          icon: Activity,      ok: true },
          ].map(m => (
            <div key={m.label} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
              <m.icon size={16} className={m.ok ? "text-success" : "text-warning"} />
              <div>
                <div className="text-[10px] text-muted uppercase tracking-wider">{m.label}</div>
                <div className="text-sm font-bold text-text-primary">{m.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Live WS events */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("w-2 h-2 rounded-full", wsStatus === "open" ? "bg-success animate-pulse" : "bg-muted")} />
              <h3 className="text-sm font-semibold text-text-primary">Live Event Stream</h3>
            </div>
            <span className="text-[10px] text-muted">{wsEvents.length} events</span>
          </div>
          <div className="font-mono text-[10px] divide-y divide-border/30 max-h-64 overflow-y-auto">
            {wsEvents.length === 0 ? (
              <div className="text-center py-8 text-muted text-xs">Waiting for events…</div>
            ) : wsEvents.map(e => (
              <div key={e.id} className="flex items-start gap-2 px-4 py-2 hover:bg-card-hover">
                <span className="text-primary-light shrink-0">{e.type}</span>
                <span className="text-text-secondary truncate flex-1">{e.data}</span>
                <span className="text-muted shrink-0">{timeAgo(e.ts)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent performance */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-sm font-semibold text-text-primary">Agent Performance</h3>
          </div>
          <div className="divide-y divide-border/30 max-h-64 overflow-y-auto">
            {perf.map(a => (
              <div key={a.agent_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-card-hover">
                <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[a.status] ?? "bg-muted")} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-text-primary truncate">{a.name}</div>
                  <div className="text-[10px] text-muted">{a.department}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-text-primary">{a.success_rate}%</div>
                  <div className="text-[10px] text-muted">{a.tasks_completed} done</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task log */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Task Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Agent", "Task", "Status", "Duration", "Time"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-muted font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-muted">No tasks logged yet</td></tr>
              ) : logs.map(l => (
                <tr key={l.id} className="border-b border-border/50 hover:bg-card-hover">
                  <td className="px-4 py-2.5 text-text-primary font-medium">{l.agent_name}</td>
                  <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">{l.task}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px]",
                      l.status === "completed" ? "bg-success-dim text-success" :
                      l.status === "failed"    ? "bg-danger-dim text-danger" :
                      "bg-primary-dim text-primary-light"
                    )}>{l.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted font-mono">{l.duration_ms ? `${l.duration_ms}ms` : "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{l.started_at ? timeAgo(l.started_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
