"use client";
import { useEffect, useState } from "react";
import { Play, GitBranch, Clock, Zap, RefreshCw, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";

const AGENT_ICONS: Record<string, string> = {
  ceo: "🎯", product_research: "🔍", supplier: "📦", store_designer: "🎨",
  content: "✍️", ugc_creative: "🎬", image_gen: "🖼️", video_gen: "🎥",
  marketing: "📣", analytics: "📊", customer_support: "💬", finance: "💰",
  automation: "⚙️", experimentation: "🧪", learning: "🧠", compliance: "🛡️",
};

interface Step     { id: number; name: string; agent: string; status: string }
interface Workflow { id: string; name: string; description: string; status: string; steps: Step[]; trigger: string; last_run: string | null; runs: number }

const TRIGGER_LABEL: Record<string, string> = {
  "manual":              "Manual",
  "schedule:daily_03":   "Daily 03:00",
  "schedule:tue_fri_09": "Tue / Fri 09:00",
  "schedule:weekly":     "Weekly",
  "schedule:hourly":     "Hourly",
};

export default function WorkflowBuilder({ bizId }: { bizId: number }) {
  const [workflows,  setWorkflows]  = useState<Workflow[]>([]);
  const [running,    setRunning]    = useState<string | null>(null);
  const [completed,  setCompleted]  = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`${BASE_URL}/api/workflows/${bizId}`)
      .then(r => r.json()).then(d => setWorkflows(d as Workflow[]));
  }, [bizId]);

  const trigger = async (wfId: string) => {
    setRunning(wfId);
    await fetch(`${BASE_URL}/api/workflows/${bizId}/${wfId}/trigger`, { method: "POST" });
    setTimeout(() => {
      setRunning(null);
      setCompleted(prev => new Set(prev).add(wfId));
    }, 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Workflow Builder</h1>
        <p className="text-sm text-muted mt-0.5">Agent pipelines · Triggers · Orchestration</p>
      </div>

      <div className="grid gap-4">
        {workflows.map(wf => {
          const isRunning   = running === wf.id;
          const isDone      = completed.has(wf.id);
          return (
            <div key={wf.id} className={cn(
              "bg-card border rounded-xl p-5 transition-all",
              isRunning ? "border-primary/40" : isDone ? "border-success/30" : "border-border hover:border-border-strong"
            )}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-primary-light" />
                    <h3 className="text-sm font-semibold text-text-primary">{wf.name}</h3>
                    {isDone && <CheckCircle size={13} className="text-success" />}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{wf.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-[10px] text-muted">
                      <Clock size={10} />{TRIGGER_LABEL[wf.trigger] ?? wf.trigger}
                    </span>
                    <span className="text-[10px] text-muted">{wf.steps.length} steps</span>
                    <span className="text-[10px] text-muted">{wf.runs} runs</span>
                  </div>
                </div>
                <button
                  onClick={() => trigger(wf.id)}
                  disabled={isRunning}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0",
                    isDone
                      ? "bg-success-dim text-success cursor-default"
                      : isRunning
                      ? "bg-primary-dim text-primary-light"
                      : "bg-primary text-white hover:bg-primary-light"
                  )}
                >
                  {isRunning ? <RefreshCw size={11} className="animate-spin" /> : isDone ? <CheckCircle size={11} /> : <Play size={11} />}
                  {isRunning ? "Running…" : isDone ? "Completed" : "Run Now"}
                </button>
              </div>

              {/* Pipeline visualization */}
              <div className="overflow-x-auto">
                <div className="flex items-center min-w-max gap-0 py-1">
                  {wf.steps.map((step, i) => (
                    <div key={step.id} className="flex items-center">
                      <div className="flex flex-col items-center gap-1.5 px-2.5">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center text-base border transition-all duration-500",
                          isRunning && i === 0 ? "bg-primary-dim border-primary/50 animate-pulse" :
                          isDone            ? "bg-success-dim border-success/30" :
                          "bg-surface border-border"
                        )}>
                          {AGENT_ICONS[step.agent] ?? "🤖"}
                        </div>
                        <div className="text-[9px] text-muted text-center max-w-[52px] leading-tight">{step.name}</div>
                      </div>
                      {i < wf.steps.length - 1 && (
                        <div className={cn("h-px w-6 transition-colors duration-500 flex-shrink-0",
                          isDone ? "bg-success/40" : isRunning ? "bg-primary/40" : "bg-border"
                        )} />
                      )}
                    </div>
                  ))}
                  {/* Output node */}
                  <div className="flex items-center">
                    <div className="h-px w-6 bg-border flex-shrink-0" />
                    <div className="flex flex-col items-center gap-1.5 px-2.5">
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center text-base border",
                        isDone ? "bg-success-dim border-success/30" : "bg-warning-dim border-warning/20"
                      )}>
                        {isDone ? "✅" : "📋"}
                      </div>
                      <div className="text-[9px] text-muted">Approval</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
