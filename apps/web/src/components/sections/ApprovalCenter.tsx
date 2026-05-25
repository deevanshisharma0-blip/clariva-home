"use client";
import { useEffect, useState, useCallback } from "react";
import { CheckCircle, XCircle, RefreshCw, AlertTriangle, Shield, Zap, DollarSign, TrendingUp, Clock, ExternalLink, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Approval } from "@/lib/types";
import { cn, timeAgo, RISK_COLORS } from "@/lib/utils";

const ACTION_ICONS: Record<string, React.ElementType> = {
  ad_launch: Zap, campaign_create: Zap,
  product_import: TrendingUp, product_create: TrendingUp, product_update: TrendingUp,
  theme_deployment: Shield, content_publish: Shield,
  price_change: DollarSign, product_price_update: DollarSign,
  budget_increase: DollarSign, discount_create: DollarSign,
};

const EXEC_CONFIG: Record<string, { label: string; className: string }> = {
  running:   { label: "Executing…",  className: "bg-primary-dim text-primary-light border-primary/20" },
  success:   { label: "Executed ✓",  className: "bg-success-dim text-success border-success/20" },
  simulated: { label: "Simulated",   className: "bg-warning-dim text-warning border-warning/20" },
  skipped:   { label: "Skipped",     className: "bg-warning-dim text-warning border-warning/20" },
  failed:    { label: "Failed",      className: "bg-danger-dim text-danger border-danger/20" },
};

function ExecutionResult({ approval }: { approval: Approval }) {
  if (approval.status !== "approved") return null;
  if (!approval.execution_status) return null;

  const cfg = EXEC_CONFIG[approval.execution_status] ?? EXEC_CONFIG.skipped;
  const result = approval.execution_result;

  return (
    <div className="mt-3 bg-surface rounded-lg p-3 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] text-muted uppercase tracking-widest">Execution</div>
        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1", cfg.className)}>
          {approval.execution_status === "running" && <RefreshCw size={9} className="animate-spin" />}
          {cfg.label}
        </span>
      </div>
      {approval.execution_status === "running" ? (
        <p className="text-xs text-primary-light animate-pulse">Calling live API…</p>
      ) : result ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {Object.entries(result)
            .filter(([k]) => k !== "status")
            .slice(0, 6)
            .map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] text-muted capitalize">{k.replace(/_/g, " ")}</div>
                <div className="text-[11px] text-text-primary font-medium truncate">
                  {typeof v === "string" && v.startsWith("http") ? (
                    <a href={v} target="_blank" rel="noreferrer" className="text-primary-light flex items-center gap-0.5 hover:underline">
                      Open <ExternalLink size={9} />
                    </a>
                  ) : String(v)}
                </div>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}

function ApprovalCard({ approval, onDecide, onRecall }: {
  approval: Approval;
  onDecide: (id: number, decision: string, note?: string) => void;
  onRecall: (id: number) => void;
}) {
  const [deciding, setDeciding] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const isPending = approval.status === "pending";
  const isApproved = approval.status === "approved";
  const isDeclined = approval.status === "declined";
  const canRecall = (isApproved || isDeclined) && approval.execution_status !== "success";
  const Icon = ACTION_ICONS[approval.action_type] ?? Shield;

  const decide = async (decision: string) => {
    setDeciding(true);
    await onDecide(approval.id, decision, note || undefined);
    setDeciding(false);
    setShowNote(false);
  };

  const recall = async () => {
    setRecalling(true);
    await onRecall(approval.id);
    setRecalling(false);
  };

  return (
    <div className={cn(
      "bg-card border rounded-xl p-5 transition-all duration-200",
      isPending ? "border-border hover:border-border-strong" :
      approval.status === "approved" ? "border-success/20" :
      approval.status === "declined" ? "border-danger/20 opacity-60" :
      "border-border opacity-70",
    )}>
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary-dim flex items-center justify-center shrink-0">
          <Icon size={18} className="text-primary-light" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{approval.title}</h3>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">{approval.description}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", RISK_COLORS[approval.risk_level])}>
                {approval.risk_level.toUpperCase()} RISK
              </span>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded-full",
                approval.status === "pending"  ? "bg-warning-dim text-warning" :
                approval.status === "approved" ? "bg-success-dim text-success" :
                approval.status === "declined" ? "bg-danger-dim text-danger" :
                "bg-warning-dim text-warning"
              )}>
                {approval.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <DollarSign size={11} /><span className="text-text-secondary">{approval.estimated_cost}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <TrendingUp size={11} /><span className="text-text-secondary">{approval.forecast}</span>
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <Clock size={11} />{timeAgo(approval.created_at)}
            </span>
          </div>

          {/* AI Simulation block */}
          {approval.simulation && (
            <div className="mt-3 bg-surface rounded-lg p-3 border border-border">
              <div className="text-[10px] text-muted uppercase tracking-widest mb-2">AI Simulation</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(approval.simulation).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] text-muted capitalize">{k.replace(/_/g, " ")}</div>
                    <div className="text-xs text-text-primary font-medium">{String(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution result */}
          <ExecutionResult approval={approval} />

          {/* Action buttons — pending */}
          {isPending && (
            <div className="mt-4 space-y-2">
              {showNote && (
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note…"
                  className="w-full text-xs bg-surface border border-border rounded-lg px-3 py-2 text-text-primary resize-none h-16 focus:outline-none focus:border-primary"
                />
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => decide("approved")} disabled={deciding}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success text-white text-xs font-semibold hover:bg-success/90 transition-colors disabled:opacity-50">
                  <CheckCircle size={12} /> APPROVE
                </button>
                <button onClick={() => decide("declined")} disabled={deciding}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-semibold hover:bg-danger/90 transition-colors disabled:opacity-50">
                  <XCircle size={12} /> DECLINE
                </button>
                <button onClick={() => { setShowNote(!showNote); if (showNote && note) decide("revision"); }} disabled={deciding}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-dim text-warning text-xs font-semibold hover:bg-warning/20 transition-colors disabled:opacity-50">
                  <RefreshCw size={12} /> REVISION
                </button>
                {deciding && <RefreshCw size={13} className="text-muted animate-spin" />}
              </div>
            </div>
          )}

          {/* Recall button — for approved or declined (not yet executed) */}
          {canRecall && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <button
                onClick={recall}
                disabled={recalling}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-muted text-xs font-semibold hover:border-warning/40 hover:text-warning transition-all disabled:opacity-50"
              >
                {recalling
                  ? <RefreshCw size={12} className="animate-spin" />
                  : <Undo2 size={12} />}
                {recalling ? "Recalling…" : "Recall Decision"}
              </button>
              <p className="text-[10px] text-muted mt-1">Resets to pending so you can re-decide</p>
            </div>
          )}

          {/* Already executed — can't recall */}
          {(isApproved || isDeclined) && approval.execution_status === "success" && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <p className="text-[10px] text-muted flex items-center gap-1">
                <CheckCircle size={10} className="text-success" /> Already executed — cannot recall
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApprovalCenter({ bizId }: { bizId: number }) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "declined">("all");

  const load = useCallback(() => {
    api.approvals.list(bizId).then((data) => setApprovals(data as Approval[])).catch(console.error);
  }, [bizId]);

  useEffect(() => { load(); }, [load]);

  // Poll while any approval is executing
  useEffect(() => {
    const hasRunning = approvals.some((a) => a.execution_status === "running");
    if (!hasRunning) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [approvals, load]);

  const handleDecide = async (id: number, decision: string, note?: string) => {
    await api.approvals.decide(id, decision, note);
    load();
  };

  const handleRecall = async (id: number) => {
    await api.approvals.recall(id);
    load();
  };

  const filtered = filter === "all" ? approvals : approvals.filter((a) => a.status === filter);
  const pending = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Approval Center</h1>
          <p className="text-sm text-muted mt-0.5">Review · Simulate · Approve → Execute</p>
        </div>
        {pending > 0 && (
          <span className="flex items-center gap-1.5 text-xs bg-warning-dim text-warning px-3 py-1.5 rounded-full border border-warning/20">
            <AlertTriangle size={12} /> {pending} awaiting your decision
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        {(["all", "pending", "approved", "declined"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
              filter === f ? "bg-primary text-white" : "text-muted hover:text-text-primary"
            )}
          >
            {f}{f === "pending" && pending > 0 ? ` (${pending})` : ""}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No {filter === "all" ? "" : filter} approvals</p>
          </div>
        ) : (
          filtered.map((a) => <ApprovalCard key={a.id} approval={a} onDecide={handleDecide} onRecall={handleRecall} />)
        )}
      </div>
    </div>
  );
}
