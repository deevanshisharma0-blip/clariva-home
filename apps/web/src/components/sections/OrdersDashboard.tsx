"use client";
import { useEffect, useState, useCallback } from "react";
import { RefreshCw, Package, TruckIcon, AlertCircle, CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { Order, OrderStats } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   color: "text-warning bg-warning/10 border-warning/20",  icon: Clock },
  submitted: { label: "Submitted", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Package },
  shipped:   { label: "Shipped",   color: "text-success bg-success/10 border-success/20",  icon: TruckIcon },
  delivered: { label: "Delivered", color: "text-success bg-success/10 border-success/20",  icon: CheckCircle2 },
  failed:    { label: "Failed",    color: "text-danger bg-danger/10 border-danger/20",      icon: AlertCircle },
  skipped:   { label: "Skipped",   color: "text-muted bg-surface border-border",            icon: AlertCircle },
};

function OrderRow({ order, onSyncTracking }: { order: Order; onSyncTracking: (id: number) => void }) {
  const cfg = STATUS_CONFIG[order.fulfillment_status] ?? STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;
  const date = order.shopify_created_at
    ? new Date(order.shopify_created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : new Date(order.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" });

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-card-hover transition-colors">
      <div className={cn("flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg border shrink-0", cfg.color)}>
        <StatusIcon size={11} />
        {cfg.label}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">
          #{order.shopify_order_number || order.shopify_order_id}
          {order.customer_name && <span className="text-muted font-normal"> · {order.customer_name}</span>}
        </div>
        <div className="text-[11px] text-muted mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{date}</span>
          {order.shipping_country && <span>· {order.shipping_country}</span>}
          {order.cj_tracking_number && (
            <span className="text-primary-light">· Track: {order.cj_tracking_number}</span>
          )}
          {order.cj_status && order.cj_status !== "not_configured" && (
            <span className="text-muted">· CJ: {order.cj_status}</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-text-primary">
          ${order.total_price.toFixed(2)} {order.currency}
        </div>
        {order.fulfillment_status === "submitted" && !order.cj_tracking_number && (
          <button
            onClick={() => onSyncTracking(order.id)}
            className="text-[10px] text-primary-light hover:text-primary transition-colors flex items-center gap-1 ml-auto mt-1"
          >
            <RefreshCw size={9} />
            Sync
          </button>
        )}
      </div>
    </div>
  );
}

export default function OrdersDashboard({ bizId }: { bizId: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [orderData, statsData] = await Promise.all([
        api.orders.list(bizId, 50) as Promise<Order[]>,
        api.orders.stats(bizId) as Promise<OrderStats>,
      ]);
      setOrders(orderData);
      setStats(statsData);
    } catch (e) {
      console.error("Orders load error:", e);
    } finally {
      setLoading(false);
    }
  }, [bizId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // refresh every 15s
    return () => clearInterval(t);
  }, [load]);

  const handleSyncTracking = async (orderId: number) => {
    setSyncing(orderId);
    try {
      await api.orders.syncTracking(orderId);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Orders</h1>
          <p className="text-sm text-muted mt-0.5">Real-time Shopify orders + CJ fulfillment status</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-surface border border-border text-muted hover:text-text-primary hover:bg-card transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total Orders", value: stats.total_orders, color: "text-text-primary" },
            { label: "Revenue (CAD)", value: `$${stats.total_revenue_cad.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: "text-success" },
            { label: "Fulfilled", value: stats.fulfilled, color: "text-blue-400" },
            { label: "Pending", value: stats.pending, color: "text-warning" },
            { label: "Failed", value: stats.failed, color: stats.failed > 0 ? "text-danger" : "text-muted" },
            { label: "Fill Rate", value: `${stats.fulfillment_rate}%`, color: stats.fulfillment_rate > 80 ? "text-success" : "text-warning" },
          ].map((s) => (
            <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
              <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
              <div className="text-[10px] text-muted uppercase tracking-wide mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Orders List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 bg-card border border-border rounded-xl animate-pulse" />
          ))
        ) : orders.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-2xl">
            <Package size={40} className="mx-auto text-muted mb-4 opacity-40" />
            <h3 className="text-text-primary font-semibold mb-2">No Orders Yet</h3>
            <p className="text-sm text-muted max-w-xs mx-auto">
              When customers place orders on your Shopify store, they'll appear here automatically.
              The system will auto-submit them to CJ Dropshipping for fulfillment.
            </p>
            <div className="mt-6 text-xs text-muted bg-surface rounded-xl p-4 max-w-sm mx-auto text-left">
              <p className="font-medium text-text-secondary mb-2">Webhook Status:</p>
              <p className="flex items-center gap-2">
                <CheckCircle2 size={12} className="text-success shrink-0" />
                Shopify ORDERS_PAID webhook registered
              </p>
              <p className="flex items-center gap-2 mt-1">
                <CheckCircle2 size={12} className="text-success shrink-0" />
                CJ Dropshipping auto-fulfillment ready
              </p>
              <p className="flex items-center gap-2 mt-1">
                <RotateCcw size={12} className="text-warning shrink-0" />
                Render deployment needed for live webhooks
              </p>
            </div>
          </div>
        ) : (
          orders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              onSyncTracking={handleSyncTracking}
            />
          ))
        )}
      </div>
    </div>
  );
}
