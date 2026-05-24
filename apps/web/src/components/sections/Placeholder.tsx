"use client";
import { type LucideIcon } from "lucide-react";

interface Props { title: string; description: string; icon: LucideIcon; bullets?: string[] }

export default function Placeholder({ title, description, icon: Icon, bullets }: Props) {
  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">{title}</h1>
        <p className="text-sm text-muted mt-0.5">{description}</p>
      </div>
      <div className="bg-card border border-border rounded-xl p-12 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary-dim flex items-center justify-center">
          <Icon size={28} className="text-primary-light" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">{title} — Coming Phase 2</h3>
          <p className="text-xs text-muted mt-1.5 max-w-sm">{description}</p>
        </div>
        {bullets && (
          <ul className="text-xs text-text-secondary space-y-1 text-left mt-2">
            {bullets.map((b) => <li key={b} className="flex items-center gap-2"><span className="text-primary">→</span>{b}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
