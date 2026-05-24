"use client";
import { useEffect, useState } from "react";
import { Megaphone, Zap, TrendingUp, DollarSign, Play, BarChart3, RefreshCw } from "lucide-react";
import { api, BASE_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

const PLATFORM_META: Record<string, { color: string; logo: string }> = {
  meta:   { color: "text-blue-400",   logo: "📘" },
  tiktok: { color: "text-pink-400",   logo: "🎵" },
  google: { color: "text-yellow-400", logo: "🔍" },
};

interface Creative { id: string; hook: string; platform: string; status: string; roas: number; ctr: number; views: number; spend: number }
interface Overview  { total_spend_7d: number; blended_roas: number; active_campaigns: number; platforms: Record<string, { spend: number; roas: number; cac: number; status: string }> }

export default function MarketingCommand({ bizId }: { bizId: number }) {
  const [overview, setOverview]     = useState<Overview | null>(null);
  const [creatives, setCreatives]   = useState<Creative[]>([]);
  const [proposing, setProposing]   = useState(false);
  const [proposed, setProposed]     = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE_URL}/api/marketing/${bizId}/overview`).then(r => r.json()),
      fetch(`${BASE_URL}/api/marketing/${bizId}/creative-performance`).then(r => r.json()),
    ]).then(([ov, cr]) => { setOverview(ov as Overview); setCreatives(cr as Creative[]); });
  }, [bizId]);

  const propose = async () => {
    setProposing(true);
    await fetch(`${BASE_URL}/api/marketing/${bizId}/propose-campaign`, { method: "POST" });
    setTimeout(() => { setProposing(false); setProposed(true); }, 2500);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Marketing Command</h1>
          <p className="text-sm text-muted mt-0.5">Campaigns · Budget · Creative performance</p>
        </div>
        <button onClick={propose} disabled={proposing || proposed}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-light transition-colors disabled:opacity-60">
          {proposing ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
          {proposed ? "Proposal sent to Approvals ✓" : proposing ? "Agent proposing…" : "Propose Campaign"}
        </button>
      </div>

      {/* Platform status grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {overview && Object.entries(overview.platforms).map(([platform, data]) => {
          const meta = PLATFORM_META[platform];
          return (
            <div key={platform} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{meta.logo}</span>
                  <span className={cn("text-sm font-semibold capitalize", meta.color)}>{platform}</span>
                </div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full border",
                  data.status === "active" ? "bg-success-dim text-success border-success/20" : "bg-surface text-muted border-border")}>
                  {data.status.replace("_", " ")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Spend", value: data.spend > 0 ? `$${data.spend}` : "—" },
                  { label: "ROAS",  value: data.roas  > 0 ? `${data.roas}x`  : "—" },
                  { label: "CAC",   value: data.cac   > 0 ? `$${data.cac}`   : "—" },
                ].map(m => (
                  <div key={m.label}>
                    <div className="text-[10px] text-muted">{m.label}</div>
                    <div className="text-sm font-bold text-text-primary">{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Budget tracker */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">Weekly Budget</h3>
          <span className="text-xs text-muted">Cap: $25 CAD</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden mb-2">
          <div className="h-full bg-success rounded-full" style={{ width: "0%" }} />
        </div>
        <div className="flex justify-between text-xs text-muted">
          <span>$0 spent</span><span>$25.00 CAD remaining</span>
        </div>
      </div>

      {/* Creative performance table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Creative Performance</h3>
          <span className="text-xs text-muted">{creatives.length} creatives ready</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["ID", "Hook", "Platform", "Status", "ROAS", "CTR", "Views", "Spend"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-muted font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creatives.map(c => (
                <tr key={c.id} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-primary-light">{c.id}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-xs truncate">{c.hook}</td>
                  <td className="px-4 py-3">
                    <span className="bg-primary-dim text-primary-light px-1.5 py-0.5 rounded text-[10px]">{c.platform}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("px-1.5 py-0.5 rounded text-[10px]",
                      c.status === "ready" ? "bg-success-dim text-success" : "bg-warning-dim text-warning")}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-primary">{c.roas > 0 ? `${c.roas}x` : "—"}</td>
                  <td className="px-4 py-3 text-text-primary">{c.ctr  > 0 ? `${c.ctr}%`  : "—"}</td>
                  <td className="px-4 py-3 text-text-primary">{c.views > 0 ? c.views : "—"}</td>
                  <td className="px-4 py-3 text-text-primary">{c.spend > 0 ? `$${c.spend}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
