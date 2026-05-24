"use client";
import { useEffect, useState } from "react";
import { TrendingUp, Star, Package, Crown } from "lucide-react";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ProductIntelligence({ bizId }: { bizId: number }) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { api.products.list(bizId).then((d) => setProducts(d as Product[])); }, [bizId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Product Intelligence</h1>
        <p className="text-sm text-muted mt-0.5">AI-scored product catalog</p>
      </div>

      <div className="grid gap-4">
        {products.map((p) => (
          <div key={p.id} className={cn("bg-card border rounded-xl p-5 hover:border-border-strong transition-all", p.hero ? "border-gold/30" : "border-border")}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0", p.hero ? "bg-gold-dim" : "bg-primary-dim")}>
                  {p.hero ? "👑" : "📦"}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-text-primary">{p.name}</h3>
                    {p.hero && <span className="text-[10px] px-1.5 py-0.5 bg-gold-dim text-gold rounded border border-gold/20">HERO</span>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">{p.sku} · {p.supplier}</div>
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <span className="text-text-primary font-semibold">${p.price_cad.toFixed(2)} CAD</span>
                    <span className="text-muted">COGS ${p.cogs_cad.toFixed(2)}</span>
                    <span className="text-success font-medium">{p.margin_pct}% margin</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-bold text-text-primary">{p.demand_score}</div>
                <div className="text-[10px] text-muted">Demand Score</div>
                <div className="mt-1">
                  <div className="h-1.5 w-24 bg-surface rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${p.demand_score}%` }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
              {[
                { label: "Orders 7d", value: p.orders_7d },
                { label: "Revenue 7d", value: `$${p.revenue_7d.toFixed(0)}` },
                { label: "Rating", value: p.rating > 0 ? `${p.rating}★` : "—" },
                { label: "Status", value: p.status },
              ].map((m) => (
                <div key={m.label}>
                  <div className="text-[10px] text-muted uppercase tracking-wider">{m.label}</div>
                  <div className="text-sm font-semibold text-text-primary mt-0.5">{String(m.value)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {products.length === 0 && (
          <div className="text-center py-16 text-muted">
            <Package size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No products yet. Run the Supplier Agent to import.</p>
          </div>
        )}
      </div>
    </div>
  );
}
