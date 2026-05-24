"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { DollarSign, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { BASE_URL } from "@/lib/api";

interface Summary   { cash_balance: number; net_profit_7d: number; gross_margin_7d: number; monthly_ops_cost: number; budget_ceiling_week: number; budget_used_week: number; ltv_estimate: number; break_even_units: number }
interface UnitEcon  { name: string; sku: string; price: number; cogs: number; shipping: number; gross_profit: number; margin_pct: number; target_cac: number; orders_7d: number }
interface CashFlow  { week: string; revenue: number; cogs: number; ad_spend: number; net: number; projected: boolean }
interface CostItem  { label: string; monthly_cad: number; note: string; category: string }

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs space-y-1">
      <div className="text-muted font-medium">{label}</div>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
          <span className="text-text-secondary capitalize">{p.name}:</span>
          <span className="text-text-primary font-semibold">${p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function FinanceDashboard({ bizId }: { bizId: number }) {
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [unitEcon,  setUnitEcon]  = useState<UnitEcon[]>([]);
  const [cashFlow,  setCashFlow]  = useState<CashFlow[]>([]);
  const [costs,     setCosts]     = useState<CostItem[]>([]);

  useEffect(() => {
    const B = `${BASE_URL}/api/finance/${bizId}`;
    Promise.all([
      fetch(`${B}/summary`).then(r => r.json()),
      fetch(`${B}/unit-economics`).then(r => r.json()),
      fetch(`${B}/cash-flow`).then(r => r.json()),
      fetch(`${B}/cost-breakdown`).then(r => r.json()),
    ]).then(([s, u, c, co]) => { setSummary(s as Summary); setUnitEcon(u as UnitEcon[]); setCashFlow(c as CashFlow[]); setCosts(co as CostItem[]); });
  }, [bizId]);

  const totalMonthlyCost = costs.reduce((s, c) => s + c.monthly_cad, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Finance Dashboard</h1>
        <p className="text-sm text-muted mt-0.5">P&L · Unit economics · Cash flow · Cost tracking</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Net Profit 7d",    value: summary ? `$${summary.net_profit_7d.toFixed(2)}` : "—", icon: TrendingUp, good: (summary?.net_profit_7d ?? 0) >= 0 },
          { label: "Weekly Spend",     value: summary ? `$${summary.budget_used_week.toFixed(2)} / $${summary.budget_ceiling_week}` : "—", icon: DollarSign, good: true },
          { label: "Monthly Ops Cost", value: summary ? `$${summary.monthly_ops_cost.toFixed(2)} CAD` : "—", icon: CheckCircle, good: true },
          { label: "Break-even Units", value: summary ? String(summary.break_even_units) : "—", icon: AlertCircle, good: true },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-muted uppercase tracking-widest">{k.label}</span>
              <k.icon size={13} className={k.good ? "text-success" : "text-danger"} />
            </div>
            <div className="text-xl font-bold text-text-primary">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Cash flow chart + costs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">8-Week Cash Flow Forecast</h3>
            <span className="text-[10px] text-warning bg-warning-dim px-2 py-0.5 rounded">Projected from Wk 3</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashFlow} barSize={14} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="revenue" radius={[3,3,0,0]}>
                {cashFlow.map((entry, i) => (
                  <Cell key={i} fill={entry.projected ? "rgba(124,58,237,0.5)" : "#7c3aed"} />
                ))}
              </Bar>
              <Bar dataKey="net" name="net" radius={[3,3,0,0]}>
                {cashFlow.map((entry, i) => (
                  <Cell key={i} fill={entry.projected ? "rgba(16,185,129,0.4)" : "#10b981"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Monthly costs */}
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Monthly Costs</h3>
            <span className="text-xs font-bold text-success">${totalMonthlyCost.toFixed(2)} CAD</span>
          </div>
          <div className="space-y-2.5">
            {costs.map(c => (
              <div key={c.label} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-text-primary">{c.label}</div>
                  <div className="text-[10px] text-muted">{c.note}</div>
                </div>
                <div className={cn("text-xs font-semibold shrink-0", c.monthly_cad === 0 ? "text-success" : "text-text-primary")}>
                  {c.monthly_cad === 0 ? "Free" : `$${c.monthly_cad.toFixed(2)}`}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex justify-between text-xs">
            <span className="text-muted font-medium">Total / month</span>
            <span className="text-success font-bold">&lt; $25 CAD ✓</span>
          </div>
        </div>
      </div>

      {/* Unit economics table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text-primary">Unit Economics</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Product", "Price", "COGS", "Shipping", "Gross Profit", "Margin", "Target CAC", "Orders 7d"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-muted font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {unitEcon.map(u => (
                <tr key={u.sku} className="border-b border-border/50 hover:bg-card-hover transition-colors">
                  <td className="px-4 py-3 text-text-primary font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-text-primary">${u.price.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-secondary">${u.cogs.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-secondary">${u.shipping.toFixed(2)}</td>
                  <td className="px-4 py-3 text-success font-semibold">${u.gross_profit.toFixed(2)}</td>
                  <td className="px-4 py-3 text-success font-semibold">{u.margin_pct}%</td>
                  <td className="px-4 py-3 text-warning">${u.target_cac.toFixed(2)}</td>
                  <td className="px-4 py-3 text-text-primary">{u.orders_7d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
