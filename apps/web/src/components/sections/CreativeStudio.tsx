"use client";
import { useEffect, useState } from "react";
import { Sparkles, Play, Film, Image, Mic, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { Creative } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const PLATFORM_COLORS: Record<string, string> = {
  TikTok: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  Meta: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Meta+TikTok": "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Instagram: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Pinterest: "bg-red-500/10 text-red-400 border-red-500/20",
};

const PIPELINE_STAGES = [
  { icon: Sparkles, label: "Research", desc: "Viral hooks & competitors" },
  { icon: Image, label: "Image Gen", desc: "AI product mockups" },
  { icon: Film, label: "Video Gen", desc: "UGC-style clips" },
  { icon: Mic, label: "Voiceover", desc: "AI voice (Piper TTS)" },
  { icon: Play, label: "Publish", desc: "Scheduled to platforms" },
];

export default function CreativeStudio({ bizId }: { bizId: number }) {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => { api.creative.list(bizId).then((d) => setCreatives(d as Creative[])); }, [bizId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try { await api.creative.generate(bizId, "Generate 3 new TikTok hooks for hero product"); }
    catch (e) { console.error(e); }
    finally {
      setTimeout(async () => {
        const data = await api.creative.list(bizId);
        setCreatives(data as Creative[]);
        setGenerating(false);
      }, 3000);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Creative Studio</h1>
          <p className="text-sm text-muted mt-0.5">AI-generated content pipeline</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-light transition-colors disabled:opacity-50"
        >
          {generating ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {generating ? "Generating..." : "Generate Hooks"}
        </button>
      </div>

      {/* Pipeline */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">Creative Pipeline</h3>
        <div className="flex items-center gap-0">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 px-3">
                <div className="w-9 h-9 rounded-xl bg-primary-dim flex items-center justify-center">
                  <stage.icon size={15} className="text-primary-light" />
                </div>
                <div className="text-[10px] font-semibold text-text-primary">{stage.label}</div>
                <div className="text-[10px] text-muted text-center">{stage.desc}</div>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="h-px w-6 bg-border flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Creatives list */}
      <div>
        <h3 className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Ready Creatives ({creatives.length})</h3>
        <div className="space-y-3">
          {creatives.map((c) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 hover:border-border-strong transition-all flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary-dim flex items-center justify-center shrink-0 text-lg">
                {c.platform.includes("TikTok") ? "🎵" : c.platform.includes("Meta") ? "📘" : "📌"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-primary leading-snug">&ldquo;{c.hook}&rdquo;</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", PLATFORM_COLORS[c.platform] ?? "bg-white/5 text-muted border-white/10")}>
                    {c.platform}
                  </span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    c.status === "ready" ? "bg-success-dim text-success" : "bg-warning-dim text-warning"
                  )}>
                    {c.status}
                  </span>
                  <span className="text-[10px] text-muted capitalize">{c.creative_type}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                {c.roas > 0 ? (
                  <>
                    <div className="text-sm font-bold text-success">{c.roas}x</div>
                    <div className="text-[10px] text-muted">ROAS</div>
                  </>
                ) : (
                  <div className="text-[10px] text-muted">Not live</div>
                )}
              </div>
            </div>
          ))}
          {creatives.length === 0 && (
            <div className="text-center py-12 text-muted">
              <Film size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click Generate Hooks to create your first creatives</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
