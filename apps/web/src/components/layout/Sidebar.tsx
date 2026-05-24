"use client";
import { useState } from "react";
import {
  BarChart3, Bot, CheckSquare, Package, Sparkles, Megaphone,
  DollarSign, LineChart, Activity, Store, GitBranch, Settings,
  ChevronDown, Plus, Zap, Brain,
} from "lucide-react";
import type { Section, Business } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV: { id: Section; label: string; icon: React.ElementType; badge?: number }[] = [
  { id: "tasks",        label: "AI Tasks",     icon: Brain },
  { id: "executive",    label: "Executive",    icon: BarChart3 },
  { id: "agents",       label: "Agents",       icon: Bot },
  { id: "approvals",    label: "Approvals",    icon: CheckSquare },
  { id: "products",     label: "Products",     icon: Package },
  { id: "creative",     label: "Creative",     icon: Sparkles },
  { id: "marketing",    label: "Marketing",    icon: Megaphone },
  { id: "finance",      label: "Finance",      icon: DollarSign },
  { id: "analytics",    label: "Analytics",    icon: LineChart },
  { id: "workflows",    label: "Workflows",    icon: GitBranch },
  { id: "observability",label: "Telemetry",    icon: Activity },
  { id: "stores",       label: "Stores",       icon: Store },
  { id: "settings",     label: "Settings",     icon: Settings },
];

interface Props {
  active: Section;
  onNav: (s: Section) => void;
  businesses: Business[];
  activeBiz: Business | null;
  onBizChange: (b: Business) => void;
  onNewBiz: () => void;
  pendingApprovals: number;
}

export default function Sidebar({ active, onNav, businesses, activeBiz, onBizChange, onNewBiz, pendingApprovals }: Props) {
  const [bizOpen, setBizOpen] = useState(false);

  return (
    <aside className="w-[220px] min-h-screen flex flex-col bg-surface border-r border-border select-none">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center glow-primary">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-text-primary tracking-wide">NEXUS OS</div>
            <div className="text-[10px] text-muted uppercase tracking-widest">Commerce AI</div>
          </div>
        </div>
      </div>

      {/* Business selector */}
      <div className="px-3 py-3 border-b border-border">
        <button
          onClick={() => setBizOpen(!bizOpen)}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card hover:bg-card-hover transition-colors text-left"
        >
          <span className="text-xl leading-none">{activeBiz?.logo_emoji ?? "🏪"}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-primary truncate">{activeBiz?.name ?? "Select Business"}</div>
            <div className="text-[10px] text-muted truncate">{activeBiz?.type ?? "—"}</div>
          </div>
          <ChevronDown size={13} className={cn("text-muted transition-transform", bizOpen && "rotate-180")} />
        </button>

        {bizOpen && (
          <div className="mt-1 rounded-lg border border-border bg-card overflow-hidden animate-slide-up">
            {businesses.map((b) => (
              <button
                key={b.id}
                onClick={() => { onBizChange(b); setBizOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover transition-colors text-left"
              >
                <span className="text-base">{b.logo_emoji}</span>
                <span className="text-xs text-text-primary truncate">{b.name}</span>
              </button>
            ))}
            <button
              onClick={() => { onNewBiz(); setBizOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-card-hover transition-colors border-t border-border text-left"
            >
              <Plus size={13} className="text-primary" />
              <span className="text-xs text-primary">Add Business</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const badge = id === "approvals" ? pendingApprovals : 0;
          return (
            <button
              key={id}
              onClick={() => onNav(id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
                isActive
                  ? "bg-primary-dim text-primary-light font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-card"
              )}
            >
              <Icon size={15} className={isActive ? "text-primary-light" : "text-muted"} />
              <span className="flex-1 text-left">{label}</span>
              {badge > 0 && (
                <span className="text-[10px] font-bold bg-primary text-white px-1.5 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <div className="text-[10px] text-muted">NexusOS v1.0 — AI Ops</div>
        <div className="text-[10px] text-success mt-0.5">● System operational</div>
      </div>
    </aside>
  );
}
