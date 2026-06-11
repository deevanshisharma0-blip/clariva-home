/**
 * Clariva Home OS — local dashboard server
 * Run: node server.js
 * Open: http://localhost:3847
 * Reads secrets from ../env (never touches VCS)
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

// ── Secrets — reads .env file locally, falls back to process.env on cloud ──
const env = Object.assign({}, process.env);
const envPath = path.join(__dirname, '..', '.env');
try {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(l => {
    const m = l.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  });
} catch { /* no .env file — using process.env (cloud deployment) */ }

const SUPA_KEY    = env.SUPABASE_SERVICE_KEY;
const SUPA_HOST   = 'qjclbnbzntdxfjuomdwr.supabase.co';
const SHOP_DOMAIN = (env.SHOPIFY_STORE || '').replace('https://', '').replace(/\/$/, '');
const SHOP_TOKEN  = env.SHOPIFY_ADMIN_TOKEN || '';
const OPENAI_KEY  = env.OPENAI_API_KEY || '';

// ── Shopify helper ─────────────────────────────────────────────────────
function shopify(restPath) {
  return new Promise(resolve => {
    if (!SHOP_DOMAIN || !SHOP_TOKEN) { resolve({}); return; }
    const req = https.request({
      hostname: SHOP_DOMAIN,
      path:     restPath,
      method:   'GET',
      timeout:  18000,
      headers:  { 'X-Shopify-Access-Token': SHOP_TOKEN, 'Content-Type': 'application/json' }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    });
    req.on('error', err => { console.error('Shopify:', err.message); resolve({}); });
    req.on('timeout', () => { req.destroy(); resolve({}); });
    req.end();
  });
}

// ── Supabase helper ────────────────────────────────────────────────────
function supa(restPath, method = 'GET', body = null, extra = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: SUPA_HOST,
      path:     '/rest/v1' + restPath,
      method,
      timeout:  12000,
      headers: {
        apikey:          SUPA_KEY,
        Authorization:   'Bearer ' + SUPA_KEY,
        'Content-Type':  'application/json',
        Prefer:          'return=representation',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extra
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, data: JSON.parse(d || '[]') }); }
        catch { resolve({ status: res.statusCode, data: [] }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// ── Response helpers ───────────────────────────────────────────────────
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':               'no-cache'
  });
  res.end(body);
}

function staticFile(res, filePath) {
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css':  'text/css',
    '.js':   'application/javascript',
    '.ico':  'image/x-icon',
    '.png':  'image/png'
  }[path.extname(filePath)] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Commander AI ────────────────────────────────────────────────────────
async function classifyCommand(message) {
  if (!OPENAI_KEY) return { intent: 'general', params: {}, response: 'Command saved. Agents will pick it up.' };
  return new Promise(resolve => {
    const system = `You are a command router for Clariva Home dropshipping business OS. Parse the owner instruction and return ONLY valid JSON:
{"intent":"research|niche_change|price_update|agent_toggle|setting_change|design|general","params":{"keywords":"string","niche":"string","max_cost":25,"category":"string","agent":"research|pricing|copy|ads|cs","action":"enable|disable","setting_key":"string","setting_value":"string","design_request":"string"},"response":"1-sentence friendly confirmation of what will be done"}
Intents: research=find new products with keywords, niche_change=switch entire product category (clears pipeline), price_update=change pricing rules, agent_toggle=enable or disable an agent, setting_change=change a business setting, design=change store look/theme/images, general=anything else.`;
    const body = JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: message }] });
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST', timeout: 15000,
      headers: { Authorization: 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => {
      try { resolve(JSON.parse(JSON.parse(d).choices[0].message.content)); }
      catch { resolve({ intent: 'general', params: {}, response: 'Command saved.' }); }
    }); });
    req.on('error', () => resolve({ intent: 'general', params: {}, response: 'Command saved.' }));
    req.on('timeout', () => { req.destroy(); resolve({ intent: 'general', params: {}, response: 'Command saved (AI timeout).' }); });
    req.write(body); req.end();
  });
}

async function processCommand(cmdId, message) {
  if (!cmdId) return;
  try {
    await supa(`/user_commands?id=eq.${encodeURIComponent(cmdId)}`, 'PATCH', { status: 'running' });
    const intent = await classifyCommand(message);
    let result = intent.response || 'Command received.';
    let agentName = 'Commander';

    if (intent.intent === 'niche_change') {
      agentName = 'Research Agent';
      const niche = intent.params?.niche || intent.params?.keywords || message;
      const kw    = intent.params?.keywords || niche;
      // Section A1: Niche is locked to Elevated Kitchen & Pantry Organization.
      // Block changes to non-kitchen niches.
      const KITCHEN_TERMS = /kitchen|pantry|organiz|storage|canister|bamboo|glass.*storage|drawer|spice|counter|under.sink/i;
      if (!KITCHEN_TERMS.test(niche) && !KITCHEN_TERMS.test(kw)) {
        result = 'Niche is locked to Elevated Kitchen & Pantry Organization (Section A1). Research keywords can be refined within that niche, but the niche cannot be changed. Use a research command to search for specific kitchen/pantry products instead.';
        await supa(`/user_commands?id=eq.${encodeURIComponent(cmdId)}`, 'PATCH', { status: 'done', agent: 'Commander', result, updated_at: new Date().toISOString() });
        return;
      }
      // Update research settings, clear candidates + pending research decisions, queue fresh research
      await Promise.all([
        supa('/business_settings?key=eq.research.keywords', 'PATCH', { value: kw, updated_at: new Date().toISOString() }),
        supa('/business_settings?key=eq.research.category', 'PATCH', { value: niche, updated_at: new Date().toISOString() }),
      ]);
      await Promise.all([
        supa('/products?status=eq.candidate', 'DELETE'),
        supa('/decisions?state=eq.pending&type=in.(research,product)', 'DELETE'),
      ]);
      await supa('/user_commands', 'POST', { message: `Run research for new niche: ${niche}. Keywords: ${kw}`, status: 'pending', agent: 'Research Agent' });
      result = `Niche changed to "${niche}". Pipeline cleared. Research Agent queued — new candidates will appear when done.`;
    }

    if (intent.intent === 'research') {
      agentName = 'Research Agent';
      const kw = intent.params?.keywords;
      if (kw) await supa('/business_settings?key=eq.research.keywords', 'PATCH', { value: kw, updated_at: new Date().toISOString() });
      result = `Research queued for "${kw || 'current keywords'}". New candidates will appear in Candidates when complete.`;
    }

    if (intent.intent === 'agent_toggle' && intent.params?.agent) {
      agentName = 'Settings';
      const val = intent.params.action === 'enable' ? 'true' : 'false';
      await supa(`/business_settings?key=eq.agents.${intent.params.agent}_enabled`, 'PATCH', { value: val, updated_at: new Date().toISOString() });
      result = `${intent.params.agent} Agent ${intent.params.action}d successfully.`;
    }

    if (intent.intent === 'setting_change' && intent.params?.setting_key) {
      agentName = 'Settings';
      await supa(`/business_settings?key=eq.${intent.params.setting_key}`, 'PATCH', { value: String(intent.params.setting_value ?? ''), updated_at: new Date().toISOString() });
      result = `Setting "${intent.params.setting_key}" updated to "${intent.params.setting_value}".`;
    }

    if (intent.intent === 'price_update') {
      agentName = 'Pricing Agent';
      if (intent.params?.setting_key && intent.params?.setting_value !== undefined) {
        await supa(`/business_settings?key=eq.${intent.params.setting_key}`, 'PATCH', { value: String(intent.params.setting_value), updated_at: new Date().toISOString() });
      }
      result = intent.response || 'Pricing rule updated.';
    }

    if (intent.intent === 'design') {
      agentName = 'Design Agent';
      // Queue as a decision so owner can review + approve the design change
      await supa('/decisions', 'POST', {
        type: 'design', state: 'pending',
        title: 'Design Request: ' + message.slice(0, 80),
        description: message,
        payload: JSON.stringify({ request: message, design_prompt: intent.params?.design_request || message, source: 'commander' }),
        created_at: new Date().toISOString()
      });
      result = `Design request queued for review in Candidates. Approve it to apply the changes.`;
    }

    await supa(`/user_commands?id=eq.${encodeURIComponent(cmdId)}`, 'PATCH',
      { status: 'done', agent: agentName, result, updated_at: new Date().toISOString() });
  } catch(e) {
    console.error('Commander error:', e.message);
    try { await supa(`/user_commands?id=eq.${encodeURIComponent(cmdId)}`, 'PATCH',
      { status: 'failed', result: 'Error: ' + e.message, updated_at: new Date().toISOString() }); } catch {}
  }
}

// ── Route table ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { pathname } = url.parse(req.url);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    res.end(); return;
  }

  try {
    // ── API ──────────────────────────────────────────────────────────

    // Stats (dashboard aggregate)
    if (pathname === '/api/stats') {
      const [dec, prod, health, alerts] = await Promise.all([
        supa('/decisions?state=eq.pending&limit=200'),
        supa('/products?limit=200'),
        supa('/business_health_scores?order=scored_at.desc&limit=1'),
        supa('/decisions?type=eq.alert&ref_table=eq.orders&state=eq.pending&limit=50')
      ]);
      const D = Array.isArray(dec.data)    ? dec.data    : [];
      const P = Array.isArray(prod.data)   ? prod.data   : [];
      const H = Array.isArray(health.data) ? health.data[0] : null;
      const A = Array.isArray(alerts.data) ? alerts.data : [];
      json(res, 200, {
        pendingDecisions: D.length,
        pendingAlerts:    A.length,
        totalProducts:    P.length,
        draftProducts:    P.filter(p => p.status === 'draft').length,
        approvedProducts: P.filter(p => p.status === 'approved').length,
        candidateProducts:P.filter(p => p.status === 'candidate').length,
        healthScore:      H?.overall_score ?? null,
        healthColor:      H?.color         ?? null,
        healthNotes:      H?.notes         ?? null,
        scalingEnabled:   H?.scaling_enabled ?? false,
      });
      return;
    }

    // Decisions list — enriched with referenced entity
    if (pathname === '/api/decisions' && req.method === 'GET') {
      const r = await supa('/decisions?state=eq.pending&order=created_at.desc&limit=100');
      const decisions = Array.isArray(r.data) ? r.data : [];
      // Enrich each decision with the referenced entity record
      const enriched = await Promise.all(decisions.map(async d => {
        if (d.ref_table && d.ref_id) {
          const ref = await supa(`/${d.ref_table}?id=eq.${encodeURIComponent(d.ref_id)}&limit=1`).catch(() => ({ data: [] }));
          return { ...d, _entity: Array.isArray(ref.data) && ref.data[0] ? ref.data[0] : null };
        }
        return { ...d, _entity: null };
      }));
      json(res, 200, enriched);
      return;
    }

    // Approve / Reject a decision
    const actionMatch = pathname.match(/^\/api\/decisions\/([^/]+)\/(approve|reject)$/);
    if (actionMatch && req.method === 'POST') {
      const [, id, action] = actionMatch;
      const newState = action === 'approve' ? 'approved' : 'rejected';
      await supa(`/decisions?id=eq.${encodeURIComponent(id)}`, 'PATCH', { state: newState });
      json(res, 200, { ok: true, id, state: newState });
      return;
    }

    // Products
    if (pathname === '/api/products') {
      const r = await supa('/products?select=id,title,category,status,copy_status,content_status,ads_status,shopify_gid,created_at&order=created_at.asc&limit=200');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // Finance (last 30 days)
    if (pathname === '/api/finance') {
      const r = await supa('/metrics_daily?order=date.desc&limit=30');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // Agent logs (recent exec_summaries)
    if (pathname === '/api/agents') {
      const r = await supa('/agent_logs?event=eq.exec_summary&order=ts.desc&limit=60');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // Business health score
    if (pathname === '/api/health') {
      const r = await supa('/business_health_scores?order=scored_at.desc&limit=5');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // CS alerts
    if (pathname === '/api/alerts') {
      const r = await supa('/decisions?type=eq.alert&ref_table=eq.orders&state=eq.pending&order=created_at.desc&limit=30');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // Recent orders
    if (pathname === '/api/orders') {
      const r = await supa('/orders?select=id,shopify_order_gid,total,currency,financial_status,fulfillment_status,placed_at&order=placed_at.desc&limit=20');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // ── Shopify live KPIs ─────────────────────────────────────────────
    if (pathname === '/api/shopify/kpis') {
      const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10);
      const ago7  = new Date(Date.now() -  7 * 86400000).toISOString().slice(0,10);
      const [data30, data7, prodData, countData] = await Promise.all([
        shopify(`/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=${ago30}&fields=id,created_at,total_price,subtotal_price,total_discounts,financial_status,fulfillment_status,line_items,refunds`),
        shopify(`/admin/api/2024-10/orders.json?status=any&limit=50&created_at_min=${ago7}&fields=id,financial_status,total_price`),
        shopify('/admin/api/2024-10/products/count.json'),
        shopify('/admin/api/2024-10/orders/count.json?status=any'),
      ]);

      const all30   = data30.orders || [];
      const paid30  = all30.filter(o => ['paid','partially_paid'].includes(o.financial_status));
      const revenue = paid30.reduce((s,o) => s + parseFloat(o.total_price||0), 0);
      const orders7 = (data7.orders||[]).filter(o => ['paid','partially_paid'].includes(o.financial_status));
      const rev7    = orders7.reduce((s,o) => s + parseFloat(o.total_price||0), 0);
      const aov     = paid30.length ? revenue / paid30.length : 0;
      const refunded= all30.filter(o => o.refunds && o.refunds.length > 0).length;
      const fulfilled= all30.filter(o => o.fulfillment_status === 'fulfilled').length;
      const pending = all30.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length;

      // Product-level revenue (last 30d)
      const prodMap = {};
      paid30.forEach(o => (o.line_items||[]).forEach(li => {
        const k = String(li.product_id || li.title);
        if (!prodMap[k]) prodMap[k] = { id: k, title: li.title, revenue: 0, units: 0 };
        prodMap[k].revenue += parseFloat(li.price||0) * (li.quantity||1);
        prodMap[k].units   += (li.quantity||1);
      }));
      const topProducts = Object.values(prodMap).sort((a,b) => b.revenue - a.revenue).slice(0,10);

      // Daily breakdown (last 30d)
      const dayMap = {};
      paid30.forEach(o => {
        const d = o.created_at.slice(0,10);
        if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, orders: 0 };
        dayMap[d].revenue += parseFloat(o.total_price||0);
        dayMap[d].orders  += 1;
      });
      const daily = Object.values(dayMap).sort((a,b) => a.date.localeCompare(b.date));

      json(res, 200, {
        revenue, orders: paid30.length, aov, rev7, orders7: orders7.length,
        refundRate:  all30.length  ? (refunded  / all30.length)*100 : 0,
        fulfillRate: all30.length  ? (fulfilled / all30.length)*100 : 0,
        pendingOrders: pending,
        shopifyProductCount: prodData.count || 0,
        totalOrdersEver: countData.count || 0,
        topProducts, daily,
      });
      return;
    }

    // ── Shopify live product list ─────────────────────────────────────
    if (pathname === '/api/shopify/products') {
      const data = await shopify('/admin/api/2024-10/products.json?limit=50&status=active&fields=id,title,status,variants,product_type,created_at,published_at');
      const products = (data.products || []).map(p => ({
        id: p.id, title: p.title, status: p.status, type: p.product_type,
        price: p.variants?.[0]?.price || 0,
        inventory: (p.variants||[]).reduce((s,v) => s + (v.inventory_quantity||0), 0),
        created_at: p.created_at, published_at: p.published_at,
      }));
      json(res, 200, products);
      return;
    }

    // ── Shopify recent orders (full) ──────────────────────────────────
    if (pathname === '/api/shopify/orders') {
      const data = await shopify('/admin/api/2024-10/orders.json?status=any&limit=30&fields=id,name,created_at,total_price,financial_status,fulfillment_status,customer,line_items,refunds');
      json(res, 200, data.orders || []);
      return;
    }

    // ── Full business report (Supabase + Shopify) ─────────────────────
    if (pathname === '/api/report') {
      const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0,10);
      const [decPending, decHandled, products, finance, agentLogs, healthHistory, orders, shopKpis] = await Promise.all([
        supa('/decisions?state=eq.pending&order=created_at.desc&limit=200'),
        supa('/decisions?state=in.(approved,rejected)&order=created_at.desc&limit=50'),
        supa('/products?order=created_at.asc&limit=200'),
        supa('/metrics_daily?order=date.desc&limit=30'),
        supa('/agent_logs?event=eq.exec_summary&order=ts.desc&limit=80'),
        supa('/business_health_scores?order=scored_at.desc&limit=10'),
        supa('/orders?order=placed_at.desc&limit=50'),
        shopify(`/admin/api/2024-10/orders.json?status=any&limit=250&created_at_min=${ago30}&fields=id,created_at,total_price,financial_status,fulfillment_status,line_items,refunds`),
      ]);

      const P  = Array.isArray(products.data)     ? products.data     : [];
      const F  = Array.isArray(finance.data)       ? finance.data      : [];
      const AL = Array.isArray(agentLogs.data)     ? agentLogs.data    : [];
      const HH = Array.isArray(healthHistory.data) ? healthHistory.data: [];
      const DP = Array.isArray(decPending.data)    ? decPending.data   : [];
      const DH = Array.isArray(decHandled.data)    ? decHandled.data   : [];
      const OR = Array.isArray(orders.data)        ? orders.data       : [];
      const shopOrders = shopKpis.orders || [];
      const shopPaid   = shopOrders.filter(o => ['paid','partially_paid'].includes(o.financial_status));

      // Agent map by payload.agent name
      const agentMap = {};
      AL.forEach(l => {
        const nm = (l.payload && l.payload.agent) ? l.payload.agent : l.agent_id;
        if (nm && !agentMap[nm]) agentMap[nm] = l;
      });

      // Finance totals (Supabase metrics_daily)
      const totalRevenue  = F.reduce((s,r) => s+(r.revenue||0), 0);
      const totalOrders   = F.reduce((s,r) => s+(r.orders||0),  0);
      const totalAdSpend  = F.reduce((s,r) => s+(r.ad_spend||0),0);
      const avgMargin     = F.length ? F.reduce((s,r)=>s+(r.margin||0),0)/F.length : 0;
      const roas          = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

      // Shopify-sourced KPIs
      const shopRevenue = shopPaid.reduce((s,o) => s+parseFloat(o.total_price||0), 0);
      const shopAOV     = shopPaid.length ? shopRevenue / shopPaid.length : 0;
      const shopRefund  = shopOrders.filter(o=>o.refunds&&o.refunds.length>0).length;
      const shopFulfill = shopOrders.filter(o=>o.fulfillment_status==='fulfilled').length;
      const shopPending = shopOrders.filter(o=>!o.fulfillment_status||o.fulfillment_status==='unfulfilled').length;

      // Top products from Shopify orders
      const prodMap = {};
      shopPaid.forEach(o => (o.line_items||[]).forEach(li => {
        const k = String(li.product_id || li.title);
        if (!prodMap[k]) prodMap[k] = { id: k, title: li.title, revenue: 0, units: 0 };
        prodMap[k].revenue += parseFloat(li.price||0)*(li.quantity||1);
        prodMap[k].units   += (li.quantity||1);
      }));
      const topProducts = Object.values(prodMap).sort((a,b)=>b.revenue-a.revenue).slice(0,10);

      // Daily Shopify breakdown
      const dayMap = {};
      shopPaid.forEach(o => {
        const d = o.created_at.slice(0,10);
        if (!dayMap[d]) dayMap[d] = { date:d, revenue:0, orders:0 };
        dayMap[d].revenue += parseFloat(o.total_price||0);
        dayMap[d].orders  += 1;
      });
      const shopDaily = Object.values(dayMap).sort((a,b)=>a.date.localeCompare(b.date));

      // Decision approval stats
      const approvedCount  = DH.filter(d=>d.state==='approved').length;
      const rejectedCount  = DH.filter(d=>d.state==='rejected').length;
      const approvalRate   = DH.length ? (approvedCount/DH.length)*100 : 0;

      json(res, 200, {
        generatedAt: new Date().toISOString(),
        health: HH[0] || null, healthHistory: HH,
        decisions: {
          pending: DP, handled: DH,
          approvedCount, rejectedCount, approvalRate,
        },
        products: {
          all: P,
          candidate:   P.filter(p=>p.status==='candidate').length,
          approved:    P.filter(p=>p.status==='approved').length,
          draft:       P.filter(p=>p.status==='draft').length,
          live:        P.filter(p=>p.status==='active'||p.status==='live').length,
          copyDone:    P.filter(p=>p.copy_status==='done').length,
          contentDone: P.filter(p=>p.content_status==='done').length,
          adsDone:     P.filter(p=>p.ads_status==='done').length,
        },
        finance: { rows: F, totalRevenue, totalOrders, totalAdSpend, avgMargin, roas },
        shopify: {
          revenue: shopRevenue, orders: shopPaid.length,
          aov: shopAOV, roas,
          refundRate:  shopOrders.length ? (shopRefund /shopOrders.length)*100 : 0,
          fulfillRate: shopOrders.length ? (shopFulfill/shopOrders.length)*100 : 0,
          pendingOrders: shopPending, topProducts, daily: shopDaily,
        },
        agents: agentMap,
        orders: OR,
      });
      return;
    }

    // ── Settings: read all ───────────────────────────────────────────
    if (pathname === '/api/settings' && req.method === 'GET') {
      const r = await supa('/business_settings?order=group_name.asc,key.asc');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // ── Settings: update one key ──────────────────────────────────────
    if (pathname === '/api/settings' && req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { key, value } = JSON.parse(body || '{}');
      if (!key) { json(res, 400, { error: 'key required' }); return; }
      await supa(`/business_settings?key=eq.${encodeURIComponent(key)}`, 'PATCH', { value: String(value), updated_at: new Date().toISOString() });
      json(res, 200, { ok: true, key, value });
      return;
    }

    // ── Shopify: update product price ─────────────────────────────────
    if (pathname.match(/^\/api\/shopify\/products\/([^/]+)\/price$/) && req.method === 'POST') {
      const [, productId] = pathname.match(/^\/api\/shopify\/products\/([^/]+)\/price$/);
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { price, variant_id } = JSON.parse(body || '{}');
      if (!price) { json(res, 400, { error: 'price required' }); return; }
      // Get variants first
      const prod = await shopify(`/admin/api/2024-10/products/${productId}.json?fields=id,variants`);
      const vid = variant_id || prod.product?.variants?.[0]?.id;
      if (!vid) { json(res, 404, { error: 'variant not found' }); return; }
      // Update via PUT variant
      const result = await new Promise(resolve => {
        const data = JSON.stringify({ variant: { id: vid, price: String(price) } });
        const req2 = https.request({
          hostname: SHOP_DOMAIN, path: `/admin/api/2024-10/variants/${vid}.json`,
          method: 'PUT', timeout: 15000,
          headers: { 'X-Shopify-Access-Token': SHOP_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, res2 => { let d=''; res2.on('data',c=>d+=c); res2.on('end',()=>{ try{resolve(JSON.parse(d))}catch{resolve({})} }); });
        req2.on('error', ()=>resolve({})); req2.on('timeout',()=>{req2.destroy();resolve({})});
        req2.write(data); req2.end();
      });
      json(res, 200, { ok: true, variant: result.variant });
      return;
    }

    // ── Trigger Research Agent via n8n ────────────────────────────────
    if (pathname === '/api/trigger/research' && req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const payload = JSON.parse(body || '{}');
      // Save as a user command so agents pick it up
      const msg = payload.keywords
        ? `Research products: ${payload.keywords}${payload.max_cost ? '. Max cost $'+payload.max_cost : ''}${payload.category ? '. Category: '+payload.category : ''}`
        : 'Run research agent now';
      const r = await supa('/user_commands', 'POST', { message: msg, status: 'pending', agent: 'Research Agent' });
      // Also try to call n8n webhook if configured
      const n8nUrl = env.N8N_URL;
      if (n8nUrl) {
        https.request({ hostname: new URL(n8nUrl).hostname, path: '/webhook/research-trigger', method: 'POST', timeout: 5000,
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify(payload)) }
        }, ()=>{}).on('error',()=>{}).end(JSON.stringify(payload));
      }
      json(res, 200, { ok: true, queued: msg });
      return;
    }

    // ── Toggle agent enabled/disabled ─────────────────────────────────
    if (pathname.match(/^\/api\/agents\/([^/]+)\/(enable|disable)$/) && req.method === 'POST') {
      const [, agentKey, action] = pathname.match(/^\/api\/agents\/([^/]+)\/(enable|disable)$/);
      const value = action === 'enable' ? 'true' : 'false';
      const key = `agents.${agentKey}_enabled`;
      await supa(`/business_settings?key=eq.${encodeURIComponent(key)}`, 'PATCH', { value, updated_at: new Date().toISOString() });
      json(res, 200, { ok: true, agent: agentKey, enabled: value === 'true' });
      return;
    }

    // ── Commander: read commands ──────────────────────────────────────
    if (pathname === '/api/commands' && req.method === 'GET') {
      const r = await supa('/user_commands?order=created_at.desc&limit=50');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // ── Commander: post a command ─────────────────────────────────────
    if (pathname === '/api/commands' && req.method === 'POST') {
      let body = '';
      await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
      const { message } = JSON.parse(body || '{}');
      if (!message || !message.trim()) { json(res, 400, { error: 'message required' }); return; }
      const r = await supa('/user_commands', 'POST', { message: message.trim(), status: 'pending' });
      const cmdId = Array.isArray(r.data) ? r.data[0]?.id : null;
      json(res, 200, { ok: true, id: cmdId });
      // Process async — classify intent with GPT-4o-mini and execute action
      processCommand(cmdId, message.trim()).catch(e => console.error('processCommand:', e.message));
      return;
    }

    // ── Real-time SSE stream ──────────────────────────────────────────
    if (pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(':ok\n\n');
      const push = async () => {
        try {
          const [dec, health] = await Promise.all([
            supa('/decisions?state=eq.pending&select=type,id&limit=500'),
            supa('/business_health_scores?order=scored_at.desc&limit=1&select=overall_score,color'),
          ]);
          const D = Array.isArray(dec.data) ? dec.data : [];
          const H = (Array.isArray(health.data) && health.data[0]) ? health.data[0] : null;
          res.write(`data: ${JSON.stringify({
            product: D.filter(d => ['product','research'].includes(d.type)).length,
            content: D.filter(d => ['content','copy'].includes(d.type)).length,
            ad:      D.filter(d => ['ad','ads','marketing','campaign'].includes(d.type)).length,
            alert:   D.filter(d => d.type === 'alert').length,
            order:   D.filter(d => d.type === 'order').length,
            ret:     D.filter(d => ['return','refund','chargeback'].includes(d.type)).length,
            total:   D.length, health: H, ts: Date.now(),
          })}\n\n`);
        } catch(e) { /* client disconnected */ }
      };
      await push();
      const iv = setInterval(push, 8000);
      req.on('close', () => clearInterval(iv));
      return;
    }

    // ── Telegram: find chat ID ────────────────────────────────────────
    if (pathname === '/api/telegram/setup' && req.method === 'GET') {
      const TG = env.TELEGRAM_BOT_TOKEN;
      if (!TG) { json(res, 400, { error: 'TELEGRAM_BOT_TOKEN not in env' }); return; }
      const r = await new Promise(resolve => {
        https.get(`https://api.telegram.org/bot${TG}/getUpdates`, tgRes => {
          let d = ''; tgRes.on('data', c => d += c);
          tgRes.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ ok: false }); } });
        }).on('error', () => resolve({ ok: false }));
      });
      const chats = [];
      if (r.ok && r.result) {
        r.result.forEach(u => {
          const chat = u.message?.chat || u.channel_post?.chat || u.my_chat_member?.chat;
          if (chat && !chats.find(c => c.id === chat.id)) {
            chats.push({ id: chat.id, type: chat.type, name: chat.title || chat.first_name || chat.username || 'Unknown' });
          }
        });
      }
      json(res, 200, {
        found: chats.length,
        chats,
        next: chats.length === 0
          ? 'Go to Telegram → open your bot → send it any message (e.g. "hello") → then reload this URL.'
          : 'Copy the id you want and add TELEGRAM_CHAT_ID to your .env and Render env vars.'
      });
      return;
    }

    // ── Brand Standard Validator (Section C7) ───────────────────────
    if (pathname === '/api/validate/brand-standard' && req.method === 'POST') {
      let body = ''; req.on('data', c => body += c);
      await new Promise(r => req.on('end', r));
      const { text = '', type = 'copy' } = JSON.parse(body || '{}');
      const violations = [];
      const EMOJI_RE   = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/u;
      const EXCLAIM_RE = /!/;
      const HYPE_RE    = /\b(insane|game.changer|must.have|hot selling|trending now|going viral|limited time|act now|don.t miss|flash sale|you won.t believe|blowing up|crazy good|insanely|game changing)\b/i;
      const ALL_CAPS   = /[A-Z]{4,}/;
      const COUNTDOWN  = /\d+\s*(hr|hour|min|minute|sec|second)s?\s*(left|only|remaining)/i;
      if (EMOJI_RE.test(text))    violations.push({ rule:'C2', issue:'Contains emoji', excerpt: text.match(EMOJI_RE)?.[0] });
      if (EXCLAIM_RE.test(text))  violations.push({ rule:'C2', issue:'Contains exclamation mark' });
      if (HYPE_RE.test(text))     violations.push({ rule:'C2', issue:'Hype vocabulary detected', excerpt: text.match(HYPE_RE)?.[0] });
      if (ALL_CAPS.test(text))    violations.push({ rule:'C2', issue:'All-caps text detected', excerpt: text.match(ALL_CAPS)?.[0] });
      if (COUNTDOWN.test(text))   violations.push({ rule:'C2', issue:'Countdown / scarcity language detected' });
      const NICHE_KEYWORDS = /glass|bamboo|steel|silicone|ceramic|organiz|storage|pantry|kitchen|canister|jar|drawer|spice|rack|holder|container/i;
      if (type === 'copy' && text.length > 80 && !NICHE_KEYWORDS.test(text))
        violations.push({ rule:'C5', issue:'Copy is not materials-led — no niche keywords found. Add material or product type reference.' });
      const pass = violations.length === 0;
      await supa('/agent_logs', 'POST', {
        level: pass ? 'info' : 'warn',
        event: 'brand_validator',
        payload: { type, pass, violations, text_length: text.length },
        ts: new Date().toISOString()
      }).catch(() => {});
      json(res, 200, { pass, violations, text_length: text.length });
      return;
    }

    // ── Business Rules API ─────────────────────────────────────────
    if (pathname === '/api/rules' && req.method === 'GET') {
      const r = await supa('/business_rules?order=section.asc,rule_key.asc');
      json(res, 200, Array.isArray(r.data) ? r.data : []);
      return;
    }

    // ── Static files ─────────────────────────────────────────────────
    const safePath = pathname === '/' ? '/index.html' : pathname;
    staticFile(res, path.join(__dirname, 'public', safePath));

  } catch (err) {
    console.error('Server error:', err.message);
    json(res, 500, { error: err.message });
  }
});

const PORT = process.env.PORT || 3847;
const HOST = process.env.PORT ? '0.0.0.0' : '127.0.0.1'; // 0.0.0.0 on Render, localhost only at home
server.listen(PORT, HOST, () => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Clariva Home OS');
  console.log(`  http://${HOST}:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// ── Keep n8n awake: ping every 4 min from this server ─────────────────
// Render free services sleep after 15min of no inbound traffic.
// This dashboard receives browser traffic, so it stays alive and can
// act as an external pinger to keep the n8n instance from sleeping.
const N8N_HOST = new URL(env.N8N_URL || 'https://clariva-n8n.onrender.com').hostname;
function pingN8n() {
  https.get({ hostname: N8N_HOST, path: '/healthz', timeout: 10000 }, r => {
    console.log(`[keepalive] n8n ping → ${r.statusCode}`);
  }).on('error', () => console.log('[keepalive] n8n ping failed (sleeping)'));
}
pingN8n(); // ping once on startup
setInterval(pingN8n, 4 * 60 * 1000); // then every 4 minutes
