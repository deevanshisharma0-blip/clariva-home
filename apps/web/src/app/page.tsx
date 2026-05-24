"use client";
import { useEffect, useState, useCallback } from "react";
import { Store, Activity } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import ExecutiveDashboard   from "@/components/sections/ExecutiveDashboard";
import AgentControlCenter   from "@/components/sections/AgentControlCenter";
import ApprovalCenter       from "@/components/sections/ApprovalCenter";
import ProductIntelligence  from "@/components/sections/ProductIntelligence";
import CreativeStudio       from "@/components/sections/CreativeStudio";
import MarketingCommand     from "@/components/sections/MarketingCommand";
import FinanceDashboard     from "@/components/sections/FinanceDashboard";
import Analytics            from "@/components/sections/Analytics";
import WorkflowBuilder      from "@/components/sections/WorkflowBuilder";
import Observability        from "@/components/sections/Observability";
import SettingsPanel        from "@/components/sections/SettingsPanel";
import Placeholder          from "@/components/sections/Placeholder";
import AITaskHub           from "@/components/sections/AITaskHub";
import { api } from "@/lib/api";
import type { Business, Section } from "@/lib/types";

export default function Home() {
  const [section, setSection] = useState<Section>("tasks");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [activeBiz, setActiveBiz] = useState<Business | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [showNewBiz, setShowNewBiz] = useState(false);
  const [newBizName, setNewBizName] = useState("");
  const [newBizEmoji, setNewBizEmoji] = useState("🏪");
  const [creating, setCreating] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);

  const loadBusinesses = useCallback(async () => {
    try {
      await api.status();
      setApiOnline(true);
      const data = await api.businesses.list() as Business[];
      setBusinesses(data);
      if (data.length > 0 && !activeBiz) setActiveBiz(data[0]);
    } catch {
      setApiOnline(false);
    }
  }, [activeBiz]);

  useEffect(() => { loadBusinesses(); }, [loadBusinesses]);

  useEffect(() => {
    if (!activeBiz) return;
    api.analytics.approvalsSummary(activeBiz.id)
      .then((d) => setPendingApprovals((d as { pending_count: number }).pending_count))
      .catch(() => {});
    const t = setInterval(() => {
      api.analytics.approvalsSummary(activeBiz.id)
        .then((d) => setPendingApprovals((d as { pending_count: number }).pending_count))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [activeBiz]);

  const createBusiness = async () => {
    if (!newBizName.trim()) return;
    setCreating(true);
    try {
      const biz = await api.businesses.create({ name: newBizName.trim(), logo_emoji: newBizEmoji }) as Business;
      await loadBusinesses();
      setActiveBiz(biz);
      setShowNewBiz(false);
      setNewBizName("");
    } catch (e) { console.error(e); }
    finally { setCreating(false); }
  };

  const bizId = activeBiz?.id ?? 0;

  const renderSection = () => {
    if (!apiOnline) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger-dim flex items-center justify-center animate-pulse">
            <Activity size={28} className="text-danger" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">API Offline</h2>
            <p className="text-sm text-muted mt-1">Backend at localhost:8000 is not responding.</p>
            <p className="text-xs text-muted mt-1">Make sure NexusOS API is running.</p>
          </div>
          <button onClick={loadBusinesses} className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-light transition-colors">
            Retry Connection
          </button>
        </div>
      );
    }
    if (!activeBiz) return null;
    switch (section) {
      case "tasks":        return <AITaskHub bizId={bizId} onNav={(s) => setSection(s as Section)} />;
      case "executive":    return <ExecutiveDashboard bizId={bizId} />;
      case "agents":       return <AgentControlCenter bizId={bizId} />;
      case "approvals":    return <ApprovalCenter bizId={bizId} />;
      case "products":     return <ProductIntelligence bizId={bizId} />;
      case "creative":     return <CreativeStudio bizId={bizId} />;
      case "marketing":    return <MarketingCommand bizId={bizId} />;
      case "finance":      return <FinanceDashboard bizId={bizId} />;
      case "analytics":    return <Analytics bizId={bizId} />;
      case "workflows":    return <WorkflowBuilder bizId={bizId} />;
      case "observability":return <Observability bizId={bizId} />;
      case "stores":       return <Placeholder title="Multi-Store Management" description="Multiple Shopify stores · Multi-brand support · Unified analytics" icon={Store} bullets={["Connect multiple Shopify stores","Per-store performance","Unified dashboard","Theme management — Phase 3"]} />;
      case "settings":     return <SettingsPanel bizId={bizId} />;
      default:             return <ExecutiveDashboard bizId={bizId} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar
        active={section}
        onNav={setSection}
        businesses={businesses}
        activeBiz={activeBiz}
        onBizChange={setActiveBiz}
        onNewBiz={() => setShowNewBiz(true)}
        pendingApprovals={pendingApprovals}
      />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          {renderSection()}
        </div>
      </main>

      {/* New Business modal */}
      {showNewBiz && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setShowNewBiz(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold text-text-primary mb-4">Add New Business</h2>
            <div className="space-y-3">
              <input
                value={newBizName}
                onChange={(e) => setNewBizName(e.target.value)}
                placeholder="Business name (e.g. LUMERA LED Masks)"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-muted focus:outline-none focus:border-primary"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createBusiness()}
              />
              <div className="flex gap-2">
                {["🏪", "✨", "💄", "👟", "🧘", "🍃", "💻", "🎯"].map((e) => (
                  <button key={e} onClick={() => setNewBizEmoji(e)}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${newBizEmoji === e ? "bg-primary" : "bg-surface hover:bg-card-hover"}`}>
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNewBiz(false)} className="flex-1 py-2 text-sm text-muted hover:text-text-primary transition-colors">Cancel</button>
                <button
                  onClick={createBusiness}
                  disabled={!newBizName.trim() || creating}
                  className="flex-1 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
