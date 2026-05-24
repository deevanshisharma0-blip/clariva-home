import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtCurrency(n: number, currency = "CAD") {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(n);
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-CA").format(n);
}

export function fmtPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const RISK_COLORS: Record<string, string> = {
  low: "text-success bg-success-dim",
  medium: "text-warning bg-warning-dim",
  high: "text-danger bg-danger-dim",
  critical: "text-danger bg-danger-dim",
};

export const STATUS_COLORS: Record<string, string> = {
  idle: "text-muted",
  running: "text-success",
  error: "text-danger",
  done: "text-primary-light",
  pending: "text-warning",
  approved: "text-success",
  declined: "text-danger",
  revision: "text-warning",
};
