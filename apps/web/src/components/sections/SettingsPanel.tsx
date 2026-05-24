"use client";
import { useEffect, useState } from "react";
import { Settings, Key, DollarSign, Clock, CheckCircle, AlertCircle, ExternalLink, Loader2, Wifi } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SettingsData {
  shopify_domain: string;
  shopify_connected: boolean;
  anthropic_configured: boolean;
  cj_configured: boolean;
  cj_api_email: string;
  meta_configured: boolean;
  meta_ad_account_id: string;
  tiktok_configured: boolean;
  tiktok_advertiser_id: string;
  budget_weekly_cap: number;
  ionos_email_configured: boolean;
  ionos_dns_configured: boolean;
  ionos_smtp_email: string;
  ionos_digest_recipient: string;
  agent_schedules: Record<string, string>;
}

const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
  <span className={cn("flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border",
    ok ? "bg-success-dim text-success border-success/20" : "bg-warning-dim text-warning border-warning/20")}>
    {ok ? <CheckCircle size={9} /> : <AlertCircle size={9} />} {label}
  </span>
);

export default function SettingsPanel({ bizId }: { bizId: number }) {
  const [data,    setData]    = useState<SettingsData | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Shopify
  const [shopify, setShopify] = useState("");
  const [token,   setToken]   = useState("");

  // CJ
  const [cjEmail, setCjEmail] = useState("");
  const [cjKey,   setCjKey]   = useState("");

  // Meta
  const [metaToken,   setMetaToken]   = useState("");
  const [metaAccount, setMetaAccount] = useState("");

  // TikTok
  const [tikToken,      setTikToken]      = useState("");
  const [tikAdvertiser, setTikAdvertiser] = useState("");

  // IONOS
  const [ionosEmail,     setIonosEmail]     = useState("");
  const [ionosPassword,  setIonosPassword]  = useState("");
  const [ionosRecipient, setIonosRecipient] = useState("");
  const [ionosApiPrefix, setIonosApiPrefix] = useState("");
  const [ionosApiSecret, setIonosApiSecret] = useState("");
  const [ionosTesting,   setIonosTesting]   = useState(false);
  const [ionosResult,    setIonosResult]    = useState<{ ok: boolean; message: string } | null>(null);

  // Budget
  const [budget, setBudget] = useState("");

  useEffect(() => {
    api.settings.get(bizId).then((d) => {
      const s = d as SettingsData;
      setData(s);
      setShopify(s.shopify_domain || "");
      setBudget(String(s.budget_weekly_cap));
      setCjEmail(s.cj_api_email || "");
      setMetaAccount(s.meta_ad_account_id || "");
      setTikAdvertiser(s.tiktok_advertiser_id || "");
      setIonosEmail(s.ionos_smtp_email || "");
      setIonosRecipient(s.ionos_digest_recipient || "");
    });
  }, [bizId]);

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    const body: Record<string, unknown> = {};
    if (shopify)       body.shopify_domain        = shopify;
    if (token)         body.shopify_token         = token;
    if (cjEmail)       body.cj_api_email          = cjEmail;
    if (cjKey)         body.cj_api_key            = cjKey;
    if (metaToken)     body.meta_access_token      = metaToken;
    if (metaAccount)   body.meta_ad_account_id     = metaAccount;
    if (tikToken)      body.tiktok_access_token    = tikToken;
    if (tikAdvertiser)  body.tiktok_advertiser_id   = tikAdvertiser;
    if (budget)         body.budget_weekly_cap      = parseFloat(budget) || undefined;
    if (ionosEmail)     body.ionos_smtp_email       = ionosEmail;
    if (ionosPassword)  body.ionos_smtp_password    = ionosPassword;
    if (ionosRecipient) body.ionos_digest_recipient = ionosRecipient;
    if (ionosApiPrefix) body.ionos_api_prefix       = ionosApiPrefix;
    if (ionosApiSecret) body.ionos_api_secret       = ionosApiSecret;

    await api.settings.update(bizId, body);
    const refreshed = await api.settings.get(bizId) as SettingsData;
    setData(refreshed);

    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    setToken(""); setCjKey(""); setMetaToken(""); setTikToken("");
    setIonosPassword(""); setIonosApiSecret("");
  };

  const testShopify = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.settings.testShopify(bizId) as { ok: boolean; shop_name?: string; domain?: string; plan?: string; error?: string };
      if (r.ok) {
        setTestResult({ ok: true, message: `Connected — ${r.shop_name} (${r.domain}) · ${r.plan}` });
        const refreshed = await api.settings.get(bizId) as SettingsData;
        setData(refreshed);
      } else {
        setTestResult({ ok: false, message: r.error ?? "Connection failed" });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error — is the API running?" });
    }
    setTesting(false);
  };

  const testIonos = async () => {
    setIonosTesting(true);
    setIonosResult(null);
    try {
      const r = await api.settings.testIonosEmail(bizId) as { ok: boolean; message?: string; error?: string };
      setIonosResult({ ok: r.ok, message: r.ok ? (r.message ?? "Connected") : (r.error ?? "Failed") });
    } catch {
      setIonosResult({ ok: false, message: "Network error — is the API running?" });
    }
    setIonosTesting(false);
  };

  const Field = ({ label, value, onChange, placeholder, type = "text", hint }: {
    label: string; value: string; onChange: (v: string) => void;
    placeholder: string; type?: string; hint?: string;
  }) => (
    <div>
      <label className="text-xs text-muted mb-1 block">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder}
        className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-muted focus:outline-none focus:border-primary" />
      {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        <p className="text-sm text-muted mt-0.5">API credentials · Budget caps · Agent schedules</p>
      </div>

      {/* Integration status */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Key size={14} className="text-primary-light" /> Integration Status
        </h3>
        <div className="flex flex-wrap gap-3">
          <StatusBadge ok={data?.shopify_connected    ?? false} label="Shopify"         />
          <StatusBadge ok={data?.anthropic_configured ?? false} label="Claude AI"       />
          <StatusBadge ok={data?.cj_configured        ?? false} label="CJ Dropshipping" />
          <StatusBadge ok={data?.meta_configured      ?? false} label="Meta Ads"        />
          <StatusBadge ok={data?.tiktok_configured      ?? false} label="TikTok Ads"      />
          <StatusBadge ok={data?.ionos_email_configured ?? false} label="IONOS Email"    />
          <StatusBadge ok={data?.ionos_dns_configured   ?? false} label="IONOS DNS"      />
        </div>
      </div>

      {/* Shopify */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Settings size={14} className="text-primary-light" /> Shopify Connection
        </h3>
        <div className="space-y-3">
          <Field label="Store domain" value={shopify} onChange={setShopify}
            placeholder="your-store.myshopify.com" />
          <Field label="Admin API access token" value={token} onChange={setToken}
            placeholder={data?.shopify_connected ? "••••••••••••• (saved)" : "shpat_xxxxxxxxxxxxxxxxxxxxxxxx"}
            type="password"
            hint="Shopify Admin → Settings → Apps → Develop apps → Create app → Admin API scopes: products, content, price_rules, discounts" />
        </div>
        {testResult && (
          <div className={cn("mt-3 text-xs px-3 py-2 rounded-lg border flex items-center gap-2",
            testResult.ok ? "bg-success-dim text-success border-success/20" : "bg-danger-dim text-danger border-danger/20")}>
            {testResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            {testResult.message}
          </div>
        )}
        <button onClick={testShopify} disabled={testing}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50">
          {testing ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
          {testing ? "Testing…" : "Test Shopify Connection"}
        </button>
      </div>

      {/* Claude API */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Key size={14} className="text-primary-light" /> Claude AI (Agent Intelligence)
        </h3>
        <div className="bg-surface rounded-lg p-3 text-xs text-text-secondary space-y-1.5">
          <p>Set <code className="text-primary-light bg-primary-dim px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code> in <code className="text-muted">C:\Users\deeva\NexusOS\.env</code></p>
          <p>Set <code className="text-primary-light bg-primary-dim px-1 py-0.5 rounded">OLLAMA_MODEL=llama3.2:1b</code> to keep using local free AI.</p>
          <p className="text-muted">Without Anthropic key, agents use Ollama (local, free, already running).</p>
        </div>
        <a href="https://console.anthropic.com" target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary-light hover:text-primary transition-colors">
          <ExternalLink size={11} /> console.anthropic.com
        </a>
      </div>

      {/* CJ Dropshipping */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span className="text-sm">📦</span> CJ Dropshipping
        </h3>
        <div className="space-y-3">
          <Field label="CJ account email" value={cjEmail} onChange={setCjEmail}
            placeholder="your@email.com" />
          <Field label="CJ API key / password" value={cjKey} onChange={setCjKey}
            placeholder={data?.cj_configured ? "••••••••••••• (saved)" : "Paste CJ API key"}
            type="password"
            hint="CJ Seller Center → My Account → API → Generate key" />
        </div>
      </div>

      {/* Meta Ads */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span className="text-sm">📣</span> Meta Ads (Facebook + Instagram)
        </h3>
        <div className="space-y-3">
          <Field label="Access token" value={metaToken} onChange={setMetaToken}
            placeholder={data?.meta_configured ? "••••••••••••• (saved)" : "EAAxxxxxxxxxxxxxxx"}
            type="password"
            hint="Meta for Developers → Tools → Graph API Explorer → Generate token with ads_management scope" />
          <Field label="Ad Account ID" value={metaAccount} onChange={setMetaAccount}
            placeholder="act_123456789"
            hint="Meta Ads Manager → Account Overview → Account ID (prefix with act_)" />
        </div>
      </div>

      {/* TikTok Ads */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <span className="text-sm">🎵</span> TikTok Ads
        </h3>
        <div className="space-y-3">
          <Field label="Access token" value={tikToken} onChange={setTikToken}
            placeholder={data?.tiktok_configured ? "••••••••••••• (saved)" : "Paste TikTok access token"}
            type="password"
            hint="TikTok For Business → Developer Portal → Create App → Marketing API" />
          <Field label="Advertiser ID" value={tikAdvertiser} onChange={setTikAdvertiser}
            placeholder="7xxxxxxxxxxxxxxxx"
            hint="TikTok Ads Manager → Account Info → Advertiser ID" />
        </div>
      </div>

      {/* IONOS */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-1 flex items-center gap-2">
          <span className="text-sm">🌐</span> IONOS
        </h3>
        <p className="text-[10px] text-muted mb-4">Email notifications · DNS management · Deployment</p>

        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-text-secondary mb-2">Email (daily digest + approval alerts)</div>
            <div className="space-y-2">
              <Field label="IONOS email address (sender)" value={ionosEmail} onChange={setIonosEmail}
                placeholder={data?.ionos_email_configured ? "••• (saved)" : "you@yourdomain.com"}
                hint="Your IONOS hosted email address used to send digests" />
              <Field label="Email password" value={ionosPassword} onChange={setIonosPassword}
                placeholder="••••••••" type="password" />
              <Field label="Digest recipient" value={ionosRecipient} onChange={setIonosRecipient}
                placeholder="info.vereine@gmail.com"
                hint="Email address that receives daily briefings and approval alerts" />
            </div>
            {ionosResult && (
              <div className={cn("mt-2 text-xs px-3 py-2 rounded-lg border flex items-center gap-2",
                ionosResult.ok ? "bg-success-dim text-success border-success/20" : "bg-danger-dim text-danger border-danger/20")}>
                {ionosResult.ok ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                {ionosResult.message}
              </div>
            )}
            <button onClick={testIonos} disabled={ionosTesting}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors disabled:opacity-50">
              {ionosTesting ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} />}
              {ionosTesting ? "Testing…" : "Test IONOS Email"}
            </button>
          </div>

          <div className="border-t border-border pt-4">
            <div className="text-xs font-medium text-text-secondary mb-2">DNS API (domain management)</div>
            <div className="space-y-2">
              <Field label="API prefix" value={ionosApiPrefix} onChange={setIonosApiPrefix}
                placeholder="abc12345"
                hint="IONOS Control Panel → API → Manage API keys → Prefix" />
              <Field label="API secret" value={ionosApiSecret} onChange={setIonosApiSecret}
                placeholder={data?.ionos_dns_configured ? "••• (saved)" : "Paste secret"}
                type="password" />
            </div>
          </div>
        </div>
      </div>

      {/* Budget cap */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <DollarSign size={14} className="text-primary-light" /> Budget Cap
        </h3>
        <div>
          <label className="text-xs text-muted mb-1 block">Weekly ad spend ceiling (CAD)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">$</span>
            <input value={budget} onChange={e => setBudget(e.target.value)} type="number" min="0"
              className="w-32 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary" />
            <span className="text-sm text-muted">CAD / week</span>
          </div>
          <p className="text-[10px] text-muted mt-1">Agents will not propose campaigns exceeding this cap without explicit approval.</p>
        </div>
      </div>

      {/* Agent schedules */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Clock size={14} className="text-primary-light" /> Agent Schedules
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {data && Object.entries(data.agent_schedules).map(([id, schedule]) => (
            <div key={id} className="flex items-center justify-between py-1.5 px-3 bg-surface rounded-lg">
              <span className="text-xs text-text-secondary capitalize">{id.replace(/_/g, " ")}</span>
              <span className="text-[10px] text-muted">{schedule}</span>
            </div>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-light transition-colors disabled:opacity-60 flex items-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : null}
        {saved ? "Saved" : saving ? "Saving…" : "Save All Settings"}
      </button>
    </div>
  );
}
