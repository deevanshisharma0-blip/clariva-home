export const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
export const WS_URL = BASE_URL.replace(/^http/, "ws") + "/ws";
const BASE = BASE_URL;

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  status: () => req("/api/status"),

  businesses: {
    list: () => req("/api/businesses/"),
    get: (id: number) => req(`/api/businesses/${id}`),
    create: (data: { name: string; logo_emoji?: string; color?: string }) =>
      req("/api/businesses/", { method: "POST", body: JSON.stringify(data) }),
  },

  agents: {
    list: (bizId: number) => req(`/api/agents/${bizId}`),
    tasks: (bizId: number, agentId: string) => req(`/api/agents/${bizId}/${agentId}/tasks`),
    run: (bizId: number, agentId: string, task: string, context?: Record<string, unknown>) =>
      req(`/api/agents/${bizId}/${agentId}/run`, {
        method: "POST",
        body: JSON.stringify({ task_name: task, context }),
      }),
  },

  approvals: {
    list: (bizId: number, status?: string) =>
      req(`/api/approvals/${bizId}${status ? `?status=${status}` : ""}`),
    decide: (id: number, decision: string, note?: string) =>
      req(`/api/approvals/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
    create: (data: Record<string, unknown>) =>
      req("/api/approvals/", { method: "POST", body: JSON.stringify(data) }),
  },

  analytics: {
    kpis: (bizId: number) => req(`/api/analytics/${bizId}/kpis`),
    revenueTrend: (bizId: number, days = 7) => req(`/api/analytics/${bizId}/revenue-trend?days=${days}`),
    agentActivity: (bizId: number) => req(`/api/analytics/${bizId}/agent-activity`),
    approvalsSummary: (bizId: number) => req(`/api/analytics/${bizId}/approvals-summary`),
    systemHealth: (bizId: number) => req(`/api/analytics/${bizId}/system-health`),
    events: (bizId: number, limit = 30) => req(`/api/analytics/${bizId}/events?limit=${limit}`),
  },

  products: {
    list: (bizId: number) => req(`/api/products/${bizId}`),
    create: (bizId: number, data: Record<string, unknown>) =>
      req(`/api/products/${bizId}`, { method: "POST", body: JSON.stringify(data) }),
  },

  creative: {
    list: (bizId: number) => req(`/api/creative/${bizId}`),
    generate: (bizId: number, prompt: string) =>
      req(`/api/creative/${bizId}/generate?prompt=${encodeURIComponent(prompt)}`, { method: "POST" }),
  },

  settings: {
    get: (bizId: number) => req(`/api/settings/${bizId}`),
    update: (bizId: number, data: Record<string, unknown>) =>
      req(`/api/settings/${bizId}`, { method: "PATCH", body: JSON.stringify(data) }),
    testShopify: (bizId: number) => req(`/api/settings/${bizId}/test-shopify`),
    testIonosEmail: (bizId: number) => req(`/api/settings/${bizId}/test-ionos-email`),
  },

  flow: {
    status: (bizId: number) => req(`/api/flow/${bizId}/status`),
    run: (bizId: number) => req(`/api/flow/${bizId}/run`, { method: "POST" }),
  },

  tasks: {
    get: (bizId: number) => req(`/api/tasks/${bizId}`),
    refreshBriefing: (bizId: number) => req(`/api/tasks/${bizId}/refresh-briefing`, { method: "POST" }),
  },
};
