/* ── Clariva Home OS ── v3 ───────────────────────────────────── */

// ── State ─────────────────────────────────────────────────────
const S = { route: 'overview', counts: {}, expanded: null, refresh: null, qi: {} };

// ── Navigation config ─────────────────────────────────────────
const NAV = [
  { id:'overview',    lbl:'Overview',     icon:'M2 11h3v6H2zM6.5 7h3v10h-3zM11 3h3v14h-3z' },
  { divider:'PIPELINE' },
  { id:'candidates',  lbl:'Candidates',   icon:'M14 5.5L8 9m0 0L2 5.5M8 9V15.5M1 4.5l7-3.5 7 3.5v7l-7 3.5-7-3.5V4.5z', badge:'product' },
  { id:'content',     lbl:'Content',      icon:'M2 3h12M2 7h8M2 11h10M2 14.5h6', badge:'content' },
  { id:'ads',         lbl:'Ads',          icon:'M2 12L6 6l3.5 4L13 4l1.5 2', badge:'ad' },
  { divider:'OPERATIONS' },
  { id:'orders',      lbl:'Orders',       icon:'M2 3h12v10H2zM5 13v2M11 13v2M2 7h12' },
  { id:'returns',     lbl:'Returns',      icon:'M10 2L14 6l-4 4M14 6H5a3 3 0 000 6h2', badge:'ret' },
  { id:'alerts',      lbl:'Alerts',       icon:'M8 2l6 11H2L8 2zM8 7v3M8 11.5v.5', badge:'alert' },
  { divider:'ANALYTICS' },
  { id:'revenue',     lbl:'Revenue',      icon:'M1.5 11.5L5 7l3.5 3L12 5l2.5 1.5M1 14.5h14' },
  { id:'products',    lbl:'Products',     icon:'M8 1L15 5v6l-7 4-7-4V5L8 1zM1 5l7 4 7-4M8 9v6' },
  { id:'fulfillment', lbl:'Fulfillment',  icon:'M2 4h12M2 8h12M2 12h8M12 10l2 2 3-3' },
  { divider:'SYSTEM' },
  { id:'commander',   lbl:'Commander',    icon:'M2 4h12v8H2zM5 8h6M5 11h3' },
  { id:'agents',      lbl:'Agents',       icon:'M3 4h10v8H3zM6 8h.5M9.5 8h.5M5 11c1 1.2 5 1.2 6 0M6 4V2.5M10 4V2.5' },
  { id:'settings',    lbl:'Settings',     icon:'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3' },
];

const TITLES = {
  overview:   ['Overview',     'Clariva Home — live summary'],
  commander:  ['Commander',    'Send instructions directly to your agents'],
  candidates: ['Candidates',   'Stage 1 · Products the Research Agent found — approve to enter pipeline'],
  content:    ['Content',      'Stage 3 · Copy & captions written by agents — approve to publish to Shopify'],
  ads:        ['Ads',          'Stage 4 · Ad briefs ready — approve to start real spend'],
  orders:     ['Orders',       'Live orders from Shopify'],
  returns:    ['Returns',      'Return & refund requests'],
  alerts:     ['Alerts',       'CS flags and system alerts'],
  revenue:    ['Revenue',      'Shopify revenue analytics'],
  products:   ['Products',     'Full product pipeline'],
  fulfillment:['Fulfillment',  'Order fulfillment tracking'],
  agents:     ['Agents',       '19 autonomous agents running 24/7'],
  settings:   ['Settings',     'Store configuration & connection status'],
};

// ── SVG icon helper ───────────────────────────────────────────
const ico = (d, size=14) =>
  `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}"><path d="${d}"/></svg>`;

// ── Sidebar ───────────────────────────────────────────────────
function renderNav() {
  document.getElementById('nav').innerHTML = NAV.map(n => {
    if (n.divider) return `<div class="nav-group">${n.divider}</div>`;
    const cnt = n.badge ? (S.counts[n.badge] || 0) : 0;
    const cls = n.badge === 'alert' || n.badge === 'ret' ? 'nav-badge r' : 'nav-badge';
    return `<div class="nav-item${S.route===n.id?' active':''}" data-r="${n.id}">
      ${ico(n.icon)}
      <span class="nav-item-lbl">${n.lbl}</span>
      ${cnt > 0 ? `<span class="${cls}">${cnt}</span>` : ''}
    </div>`;
  }).join('');
  document.querySelectorAll('[data-r]').forEach(el =>
    el.addEventListener('click', () => go(el.dataset.r)));
}

function updateHealthBar(h) {
  if (!h) return;
  const el = document.getElementById('sideHealth');
  if (!el) return;
  const col = h.color?.toLowerCase() === 'green' ? 'var(--green)'
            : h.color?.toLowerCase() === 'yellow' ? 'var(--yellow)' : 'var(--red)';
  el.innerHTML = `<div class="sh-label">Business Health</div>
    <div class="sh-score" style="color:${col}">${h.overall_score || '—'}/10</div>`;
}

// ── SSE – real-time badge updates ─────────────────────────────
function startSSE() {
  const es = new EventSource('/api/stream');
  es.onmessage = e => {
    S.counts = JSON.parse(e.data);
    document.getElementById('liveDot')?.classList.add('active');
    renderNav();
    updateHealthBar(S.counts.health);
    const t = new Date(S.counts.ts);
    const el = document.getElementById('tbUpdated');
    if (el) el.textContent = 'Live · ' + t.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  };
  es.onerror = () => {
    document.getElementById('liveDot')?.classList.remove('active');
    es.close();
    setTimeout(startSSE, 7000);
  };
}

// ── Router ────────────────────────────────────────────────────
function go(id) {
  S.route = id; S.expanded = null;
  clearInterval(S.refresh);
  renderNav();
  renderPage();
  S.refresh = setInterval(renderPage, 30000);
}

async function renderPage() {
  const [title, sub] = TITLES[S.route] || ['—', ''];
  document.getElementById('tbTitle').textContent = title;
  document.getElementById('tbSub').textContent   = sub;
  const el = document.getElementById('main');
  el.innerHTML = `<div class="ls">Loading…</div>`;
  try {
    const MODS = { overview, candidates, content, ads, orders, returns, alerts, revenue, products, fulfillment, agents, settings, commander };
    el.innerHTML = await (MODS[S.route] || overview)();
    bind();
  } catch(err) {
    el.innerHTML = `<div class="empty">Failed: ${err.message}</div>`;
    console.error(err);
  }
}

// ── API ───────────────────────────────────────────────────────
async function api(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

// ── Utilities ─────────────────────────────────────────────────
const money  = n => { const v = Number(n||0); return '$' + v.toLocaleString('en',{minimumFractionDigits:2, maximumFractionDigits:2}); };
const pct    = n => Number(n||0).toFixed(1) + '%';
const parseJ = s => { try { return typeof s==='object'?s:JSON.parse(s||''); } catch { return null; } };

function timeAgo(ts) {
  if (!ts) return '—';
  const d = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (d < 60) return d + 's ago';
  if (d < 3600) return Math.floor(d/60) + 'm ago';
  if (d < 86400) return Math.floor(d/3600) + 'h ago';
  return Math.floor(d/86400) + 'd ago';
}

function pill(s) {
  const m = {active:'p-active',draft:'p-draft',candidate:'p-candidate',approved:'p-approved',
             pending:'p-pending',paid:'p-paid',refunded:'p-refunded',fulfilled:'p-fulfilled',
             unfulfilled:'p-unfulfilled',partial:'p-partial'};
  return `<span class="pill ${m[s]||'p-pending'}">${s||'—'}</span>`;
}

function kpi(lbl, val, sub, col='') {
  return `<div class="kpi c-${col}"><div class="kpi-lbl">${lbl}</div><div class="kpi-val">${val}</div>${sub?`<div class="kpi-sub">${sub}</div>`:''}</div>`;
}

function stageBar(stages, cur) {
  return `<div class="stage-bar">${stages.map((lbl, i) => {
    const n = i+1, done = n<cur, active = n===cur;
    return (i>0?`<div class="sb-line${done?' done':''}"></div>`:'') +
      `<div class="sb-dot${done?' done':active?' active':''}">${done?'✓':n}</div>` +
      `<span class="sb-lbl${done?' done':active?' active':''}">${lbl}</span>`;
  }).join('')}</div>`;
}

// ── Product queue card (clean single-item view) ───────────────
function productCard(d, stageNum=1) {
  const e  = d._entity || {};
  const sc = parseJ(e.scores) || {};
  const composite   = Number(sc.composite   || 0);
  const demand      = Number(sc.demand      || 0);
  const competition = Number(sc.competition || 0);
  const cost  = Number(e.cost  || 0);
  const price = Number(e.price || 0);
  const gross = price - cost;
  const margin = e.margin_pct ? Number(e.margin_pct).toFixed(0) : (price ? (gross/price*100).toFixed(0) : null);

  const scoreCol = composite>=7.5?'var(--green)':composite>=6?'var(--yellow)':'var(--red)';
  const verdict  = composite>=7.5?'Strong pick':composite>=6?'Worth testing':'Marginal';
  const verdictBg= composite>=7.5?'rgba(34,197,94,.1)':composite>=6?'rgba(245,158,11,.1)':'rgba(239,68,68,.1)';

  const whyDemand = demand>=8?'strong market demand':demand>=6?'moderate demand':'emerging demand';
  const whyComp   = competition<=4?'low competition — great positioning window':competition<=6?'manageable competition':'high competition — needs strong creative';
  const whyLine   = [
    whyDemand + (demand ? ` (${demand}/10)` : ''),
    margin ? `${margin}% gross margin` : null,
    whyComp,
    e.ship_days ? `ships ${e.ship_days} days from CJ` : null,
  ].filter(Boolean).join(' · ');

  const cjLink      = e.cj_product_ref ? `https://app.cjdropshipping.com/product-detail.html?id=${e.cj_product_ref}` : null;
  const shopifyLink = e.shopify_gid    ? `https://lumera-aura.myshopify.com/admin/products/${e.shopify_gid.split('/').pop()}` : null;

  const bars = [
    {lbl:'Demand',      k:'demand'},
    {lbl:'Competition', k:'competition'},
    {lbl:'Trend',       k:'trend'},
  ].filter(b => sc[b.k]).map(b => {
    const v = Number(sc[b.k]||0);
    const c = v>=8?'var(--green)':v>=6?'var(--yellow)':'var(--red)';
    const inv = b.k==='competition'; // lower competition = better
    const displayV = inv ? (10-v) : v;
    const fillC    = inv ? (v<=4?'var(--green)':v<=6?'var(--yellow)':'var(--red)') : c;
    return `<div class="pcb-row">
      <span class="pcb-lbl">${b.lbl}</span>
      <div class="pcb-track"><div class="pcb-fill" style="width:${Math.max(4,v*10)}%;background:${fillC}"></div></div>
      <span class="pcb-val" style="color:${fillC}">${v}/10</span>
    </div>`;
  }).join('');

  const approveLbl = stageNum===1?'Add to Pipeline':stageNum===3?'Approve Content':stageNum===4?'Approve & Launch':'Approve';
  const rejectLbl  = stageNum===4?'Revise Ad':stageNum===3?'Request Revision':'Skip';

  return `<div class="pc">
    <div class="pc-top">
      <div class="pc-score-wrap" style="color:${scoreCol}">
        <span class="pc-score-num">${composite||'—'}</span><span class="pc-score-denom">/10</span>
      </div>
      <span class="pc-verdict" style="background:${verdictBg};color:${scoreCol}">${verdict}</span>
      <div style="flex:1"></div>
      ${stageBar(['Research','Pricing','Content','Ads'], stageNum)}
    </div>
    <div class="pc-title">${e.title || d.summary?.slice(0,80) || 'Product'}</div>
    <div class="pc-sub">${[e.category, e.ship_days?'Ships '+e.ship_days+'d':null].filter(Boolean).join(' · ')}</div>
    <div class="pc-money-row">
      <div class="pcm"><div class="pcm-lbl">You pay (CJ)</div><div class="pcm-val">${cost?money(cost):'—'}</div></div>
      <div class="pcm-arrow">→</div>
      <div class="pcm"><div class="pcm-lbl">You sell</div><div class="pcm-val c-accent">${price?money(price)+' CAD':'—'}</div></div>
      <div class="pcm-arrow">=</div>
      <div class="pcm pcm-profit"><div class="pcm-lbl">Profit / sale</div><div class="pcm-val c-green">${gross>0?money(gross):'—'}</div>${gross>0?`<div class="pcm-note">~${money(gross*30)} @ 30 orders/mo</div>`:''}</div>
    </div>
    ${whyLine?`<div class="pc-why"><span class="pc-why-lbl">Why</span>${whyLine}</div>`:''}
    ${bars?`<div class="pc-bars">${bars}</div>`:''}
    ${(cjLink||shopifyLink)?`<div class="pc-links">
      ${cjLink    ?`<a href="${cjLink}"      target="_blank" rel="noopener" class="pc-link">CJ Dropshipping ↗</a>`:''}
      ${shopifyLink?`<a href="${shopifyLink}" target="_blank" rel="noopener" class="pc-link">Shopify ↗</a>`:''}
    </div>`:''}
    <div class="pc-actions">
      <button class="pc-btn-no"  data-reject="${d.id}">${rejectLbl}</button>
      <button class="pc-btn-ok" data-approve="${d.id}">${approveLbl}</button>
    </div>
  </div>`;
}

// ── Queue nav header ──────────────────────────────────────────
function queueHeader(label, cur, total, route) {
  return `<div class="q-hdr" data-qtotal="${total}">
    <span class="q-label">${label}</span>
    <span class="q-count">${cur+1} <span class="q-sep">of</span> ${total}</span>
    <div style="flex:1"></div>
    <div class="q-nav">
      <button class="q-btn" data-qprev="${route}" ${cur===0?'disabled':''}>◀ Prev</button>
      <button class="q-btn" data-qnext="${route}" ${cur>=total-1?'disabled':''}>Next ▶</button>
    </div>
  </div>`;
}

// ── MODULE: Overview ──────────────────────────────────────────
async function overview() {
  const [stats, agts, shopKpis] = await Promise.all([
    api('/api/stats'),
    api('/api/agents'),
    api('/api/shopify/kpis').catch(()=>({})),
  ]);

  const hcol = (stats.healthColor||'').toLowerCase();
  const hc   = hcol==='green'?'green':hcol==='yellow'?'yellow':'red';

  const seen=new Set(), agentList=(agts||[]).filter(a=>{
    const nm=a.payload?.agent||a.agent_id; if(seen.has(nm))return false; seen.add(nm); return true;
  }).slice(0,8);

  const agentRows = agentList.map(a=>`<div class="agent-row">
    <div class="agent-dot ${a.payload?.errors?'err':'ok'}"></div>
    <span class="agent-nm">${a.payload?.agent||a.agent_id||'—'}</span>
    <span class="agent-sum">${(a.payload?.exec_summary||'Running autonomously').slice(0,90)}</span>
    <span class="agent-ts">${timeAgo(a.ts||a.created_at)}</span>
  </div>`).join('');

  const funnelData=[
    {lbl:'Candidates',  n:stats.candidateProducts||0, col:'var(--blue)',   max:200},
    {lbl:'Approved',    n:stats.approvedProducts||0,  col:'var(--accent)', max:50},
    {lbl:'In Shopify',  n:stats.draftProducts||0,     col:'var(--yellow)', max:20},
    {lbl:'Live',        n:0,                           col:'var(--green)',  max:10},
  ];
  const funnel = funnelData.map(f=>`<div class="fnl-row">
    <span class="fnl-lbl">${f.lbl}</span>
    <div class="fnl-wrap"><div class="fnl-bar" style="width:${Math.max(3,(f.n/f.max)*100)}%;background:${f.col}"></div></div>
    <span class="fnl-num" style="color:${f.col}">${f.n}</span>
  </div>`).join('');

  const rev = shopKpis.revenue>0 ? money(shopKpis.revenue) : '—';

  return `
  <div class="kpi-row">
    ${kpi('Business Health', stats.healthScore!=null?stats.healthScore+'/10':'—', stats.healthColor||'—', hc)}
    ${kpi('Pending Decisions', stats.pendingDecisions||0, 'need your approval', 'accent')}
    ${kpi('Products in Pipeline', stats.totalProducts||0, `${stats.candidateProducts||0} candidates · ${stats.draftProducts||0} in Shopify`, 'blue')}
    ${kpi('Revenue (30d)', rev, shopKpis.revenue>0 ? shopKpis.orders+' orders' : 'Pre-launch — no orders yet', 'green')}
  </div>
  <div class="grid-2">
    <div class="panel panel-last">
      <div class="pnl-title">Product Pipeline — Stage by Stage</div>
      <div class="funnel">${funnel}</div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--s3);font-size:11.5px;color:var(--t3);line-height:1.6">
        Each product goes through <strong style="color:var(--t2)">Research → Pricing → Content → Ads → Live</strong>.
        You approve each gate one at a time. Nothing moves forward without your sign-off.
      </div>
    </div>
    <div class="panel panel-last">
      <div class="pnl-title">Agent Activity</div>
      ${agentRows||'<div class="empty">No agent activity yet.</div>'}
    </div>
  </div>`;
}

// ── MODULE: Candidates (Stage 1 – Research Gate) ──────────────
async function candidates() {
  const decs = await api('/api/decisions');
  const items = decs.filter(d => ['product','research'].includes((d.type||'').toLowerCase()))
                    .sort((a,b) => {
                      const sa = parseJ((a._entity||{}).scores)?.composite||0;
                      const sb = parseJ((b._entity||{}).scores)?.composite||0;
                      return sb - sa;
                    });

  if (!items.length) return `
    <div class="panel"><div class="empty">No candidates yet — use the form below to tell the Research Agent what to look for.</div></div>
    <div class="panel">
      <div class="pnl-title">Request Research — Tell the Agent What to Find</div>
      <div class="ctrl-form">
        <div class="ctrl-field">
          <label class="ctrl-lbl">Keywords / Product Type</label>
          <input class="ctrl-input" id="resKeywords" placeholder="e.g. home decor organizer, minimalist lamp" />
        </div>
        <div class="ctrl-field">
          <label class="ctrl-lbl">Category</label>
          <input class="ctrl-input" id="resCategory" placeholder="e.g. Home & Living" />
        </div>
        <div class="ctrl-field">
          <label class="ctrl-lbl">Max Cost (USD)</label>
          <input class="ctrl-input" id="resMaxCost" placeholder="25" type="number" />
        </div>
        <button class="ctrl-btn" id="resSubmit">Run Research Agent Now</button>
      </div>
    </div>`;

  const qi = Math.min(S.qi.candidates||0, items.length-1);
  return `
    <div class="stage-info">Review one product at a time. <strong>Add to Pipeline</strong> to move it to pricing. <strong>Skip</strong> to remove it.</div>
    ${queueHeader('Research candidates', qi, items.length, 'candidates')}
    ${productCard(items[qi], 1)}
    <div class="panel" style="margin-top:12px">
      <div class="pnl-title">Request Specific Research</div>
      <div class="ctrl-form">
        <input class="ctrl-input" id="resKeywords" placeholder="Keywords / product type (e.g. home decor organizer)" style="flex:1" />
        <button class="ctrl-btn" id="resSubmit">Run Research Agent</button>
      </div>
    </div>`;
}

// ── MODULE: Content (Stage 3) ─────────────────────────────────
async function content() {
  const decs = await api('/api/decisions');
  const items = decs.filter(d => ['content','copy'].includes((d.type||'').toLowerCase()));

  if (!items.length) return `<div class="panel"><div class="empty">No content to review. Content decisions appear after a product passes the Pricing gate and the Copy Agent writes its description.</div></div>`;

  const qi = Math.min(S.qi.content||0, items.length-1);
  const d  = items[qi];
  const e  = d._entity || {};

  return `
    <div class="stage-info">The Copy Agent wrote descriptions and captions. <strong>Approve</strong> to publish to Shopify. <strong>Request Revision</strong> to send back.</div>
    ${queueHeader('Content approvals', qi, items.length, 'content')}
    <div class="pc">
      ${stageBar(['Research','Pricing','Content','Ads'], 3)}
      <div class="pc-title">${e.title||d.summary?.slice(0,80)||'Product'}</div>
      <div class="pc-sub">${[e.category, e.price?money(e.price)+' CAD':null, e.margin_pct?Number(e.margin_pct).toFixed(0)+'% margin':null].filter(Boolean).join(' · ')}</div>
      <div class="pc-copy-section">
        <div class="pc-copy-lbl">Copy Agent wrote</div>
        <div class="pc-copy-body">${d.summary||'Product description and captions generated by Copy Agent.'}</div>
        ${d.reasoning&&!d.reasoning.startsWith('{')?`<div class="pc-copy-note">${d.reasoning}</div>`:''}
      </div>
      <div class="pc-impact green">Approving publishes this copy to Shopify — product becomes searchable. Ads gate unlocks next.</div>
      <div class="pc-actions">
        <button class="pc-btn-no"  data-reject="${d.id}">Request Revision</button>
        <button class="pc-btn-ok" data-approve="${d.id}">Approve Content</button>
      </div>
    </div>`;
}

// ── MODULE: Ads (Stage 4) ─────────────────────────────────────
async function ads() {
  const decs = await api('/api/decisions');
  const items = decs.filter(d => ['ad','ads','marketing','campaign'].includes((d.type||'').toLowerCase()));

  if (!items.length) return `<div class="panel"><div class="empty">No ad briefs to review. These appear after content is approved and the Ads Agent writes a campaign brief.</div></div>`;

  const qi = Math.min(S.qi.ads||0, items.length-1);
  const d  = items[qi];
  const r  = parseJ(d.reasoning) || {};

  return `
    <div class="stage-info">Real ad spend starts the moment you approve. Review carefully before confirming.</div>
    ${queueHeader('Ad briefs', qi, items.length, 'ads')}
    <div class="pc">
      ${stageBar(['Research','Pricing','Content','Ads'], 4)}
      <div class="pc-title">${r.product_title||r.ad_headline||d.summary?.slice(0,80)||'Ad Brief'}</div>
      <div class="pc-sub">${[r.platform, r.ad_format].filter(Boolean).join(' · ')}</div>
      <div class="pc-money-row" style="margin-bottom:14px">
        ${r.daily_budget?`<div class="pcm"><div class="pcm-lbl">Daily Budget</div><div class="pcm-val c-accent">${r.daily_budget}</div></div>`:''}
        ${r.platform    ?`<div class="pcm"><div class="pcm-lbl">Platform</div><div class="pcm-val">${r.platform}</div></div>`:''}
        ${r.ad_format   ?`<div class="pcm"><div class="pcm-lbl">Format</div><div class="pcm-val">${r.ad_format}</div></div>`:''}
      </div>
      ${r.ad_headline?`<div class="pc-copy-section"><div class="pc-copy-lbl">Headline</div><div class="pc-copy-body" style="font-weight:700;font-size:15px">${r.ad_headline}</div></div>`:''}
      ${r.ad_body?`<div class="pc-copy-section"><div class="pc-copy-lbl">Ad Copy</div><div class="pc-copy-body">${r.ad_body}</div></div>`:''}
      ${r.target_audience?`<div class="pc-copy-section"><div class="pc-copy-lbl">Target Audience</div><div class="pc-copy-body">${r.target_audience}</div></div>`:''}
      <div class="pc-impact orange">Approving launches this ad on ${r.platform||'Facebook/Instagram'}. ${r.daily_budget?'Daily spend of '+r.daily_budget+' starts immediately.':''}</div>
      <div class="pc-actions">
        <button class="pc-btn-no"  data-reject="${d.id}">Revise</button>
        <button class="pc-btn-ok" data-approve="${d.id}">Approve &amp; Launch</button>
      </div>
    </div>`;
}

// ── MODULE: Orders ────────────────────────────────────────────
async function orders() {
  const [shopOrders, supaOrders] = await Promise.all([
    api('/api/shopify/orders').catch(()=>[]),
    api('/api/orders'),
  ]);
  const all = shopOrders.length ? shopOrders : [];
  const rows = all.map(o => {
    const cust = o.customer ? `${o.customer.first_name||''} ${o.customer.last_name||''}`.trim() : 'Guest';
    return `<tr>
      <td class="tc1">${o.name||'—'}</td><td>${cust||'—'}</td>
      <td class="tc-g">${money(o.total_price)} CAD</td>
      <td>${pill(o.financial_status||'pending')}</td>
      <td>${pill(o.fulfillment_status||'unfulfilled')}</td>
      <td class="tc-m">${timeAgo(o.created_at)}</td>
    </tr>`;
  }).join('');

  return `
  <div class="kpi-row kpi-row-3">
    ${kpi('Total Orders', all.length, 'from Shopify', 'blue')}
    ${kpi('Fulfilled', all.filter(o=>o.fulfillment_status==='fulfilled').length, 'shipped to customers', 'green')}
    ${kpi('Pending', all.filter(o=>!o.fulfillment_status||o.fulfillment_status==='unfulfilled').length, 'need fulfillment', 'yellow')}
  </div>
  <div class="panel">
    <div class="pnl-title">Recent Orders · Shopify Live</div>
    ${rows ? `<div style="overflow-x:auto"><table class="tbl">
      <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>When</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<div class="empty">No orders yet — store is pre-launch.</div>'}
  </div>`;
}

// ── MODULE: Returns ───────────────────────────────────────────
async function returns() {
  const decs  = await api('/api/decisions');
  const items = decs.filter(d => ['return','refund','chargeback'].includes((d.type||'').toLowerCase()));

  if (!items.length) return `<div class="panel"><div class="empty">No return or refund requests. The CS Agent will surface these when customers file returns.</div></div>`;

  const cards = items.map(d => {
    const r    = parseJ(d.reasoning) || {};
    const name = r.order_number || d.summary?.slice(0,60) || 'Return Request';
    const meta = [r.amount?money(r.amount):'', r.reason?.slice(0,40)||''].filter(Boolean).join(' · ');
    const body = `
      ${r.reason?`<div class="fb-why" style="margin-bottom:12px"><div class="fb-why-lbl">Reason</div><p class="fb-why-body">${r.reason}</p></div>`:''}
      ${r.recommendation?`<div class="fb-why" style="margin-bottom:12px;border-left-color:var(--yellow)"><div class="fb-why-lbl">Agent Recommendation</div><p class="fb-why-body">${r.recommendation}</p></div>`:''}
      <div class="impact-note red"><strong style="color:var(--red)">Approve:</strong> Issues refund. <strong>Reject:</strong> Declines the return request.</div>`;
    return decCard(d.id, 'red', 'Refund', name, meta, body, 'Approve Refund', 'Reject Return', true);
  }).join('');

  return `<div class="dec-list">${cards}</div>`;
}

// ── MODULE: Alerts ────────────────────────────────────────────
async function alerts() {
  const decs  = await api('/api/decisions');
  const items = decs.filter(d => d.type === 'alert');

  if (!items.length) return `<div class="panel"><div class="empty">No open alerts. The CS Agent monitors orders and flags issues here.</div></div>`;

  const cards = items.map(d => {
    const body = `<div class="fb-why" style="margin-bottom:12px;border-left-color:var(--red)"><div class="fb-why-lbl">Alert Details</div><p class="fb-why-body">${d.summary||d.reasoning||'No details available.'}</p></div>`;
    return decCard(d.id, 'red', 'Alert', d.summary?.slice(0,80)||'System Alert', timeAgo(d.created_at), body, 'Resolve', 'Dismiss', true);
  }).join('');

  return `<div class="dec-list">${cards}</div>`;
}

// ── MODULE: Revenue ───────────────────────────────────────────
async function revenue() {
  const k = await api('/api/shopify/kpis');

  const daily = k.daily || [];
  let chartHtml = '<div class="panel"><div class="empty">No revenue data yet — store is pre-launch. Chart will populate once orders come in.</div></div>';
  if (daily.length && k.revenue > 0) {
    const maxR = Math.max(...daily.map(d=>d.revenue), 1);
    const bars = daily.map(d => {
      const h = Math.max(2, (d.revenue/maxR)*120);
      return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0">
        ${d.revenue>0?`<span style="font-size:8.5px;color:var(--t4)">$${Math.round(d.revenue)}</span>`:'<span></span>'}
        <div style="width:100%;max-width:22px;height:${h}px;background:var(--accent);border-radius:2px 2px 0 0;opacity:${d.revenue>0?.9:.15};align-self:flex-end"></div>
        <span style="font-size:8px;color:var(--t4)">${d.date.slice(5)}</span>
      </div>`;
    }).join('');
    chartHtml = `<div class="panel">
      <div class="pnl-title">Daily Revenue — Last 30 Days · Shopify</div>
      <div style="display:flex;align-items:flex-end;gap:2px;height:165px;padding-top:20px">${bars}</div>
    </div>`;
  }

  const topProds = k.topProducts || [];
  const maxR2    = Math.max(...topProds.map(p=>p.revenue), 1);

  return `
  <div class="kpi-row">
    ${kpi('Revenue (30d)',    money(k.revenue||0),          `${k.orders||0} paid orders · Shopify live`, 'green')}
    ${kpi('Avg Order Value',  money(k.aov||0),               'Shopify 30-day average',                   'blue')}
    ${kpi('Fulfillment Rate', pct(k.fulfillRate||0),         'of orders shipped',                        (k.fulfillRate||0)>=80?'green':'yellow')}
    ${kpi('Refund Rate',      pct(k.refundRate||0),          'of orders refunded',                       (k.refundRate||0)<5?'green':'red')}
  </div>
  ${chartHtml}
  ${topProds.length ? `<div class="panel">
    <div class="pnl-title">Top Products by Revenue (30d)</div>
    ${topProds.map(p=>`<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="flex:1;font-size:12px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.title}</span>
      <div style="width:110px;background:var(--s4);border-radius:2px;height:4px"><div style="width:${(p.revenue/maxR2)*100}%;height:100%;background:var(--accent);border-radius:2px"></div></div>
      <span style="font-size:12px;font-weight:700;color:var(--green);width:58px;text-align:right">${money(p.revenue)}</span>
    </div>`).join('')}
  </div>` : ''}`;
}

// ── MODULE: Products ──────────────────────────────────────────
async function products() {
  const [prods, shopify] = await Promise.all([
    api('/api/products'),
    api('/api/shopify/products').catch(()=>[]),
  ]);
  const cnt={candidate:0,approved:0,draft:0};
  prods.forEach(p => cnt[p.status] = (cnt[p.status]||0)+1);

  return `
  <div class="kpi-row">
    ${kpi('Candidates',  cnt.candidate||0, 'found by Research Agent, awaiting approval', 'blue')}
    ${kpi('Approved',    cnt.approved||0,  'queued for Shopify push',                    'accent')}
    ${kpi('In Shopify',  cnt.draft||0,     'Shopify drafts — not live yet',              'yellow')}
    ${kpi('Live on Store', shopify.filter(p=>p.status==='active').length, 'visible to customers', 'green')}
  </div>
  ${shopify.length ? `<div class="panel">
    <div class="pnl-title">Shopify Store — Edit Prices Live</div>
    <div style="overflow-x:auto"><table class="tbl">
      <thead><tr><th>Title</th><th>Type</th><th>Price (CAD)</th><th>Inventory</th><th>Status</th><th></th></tr></thead>
      <tbody>${shopify.map(p=>`<tr>
        <td class="tc1">${p.title}</td>
        <td class="tc-m">${p.type||'—'}</td>
        <td><input class="price-input" data-pid="${p.id}" value="${Number(p.price).toFixed(2)}" /></td>
        <td>${p.inventory??0}</td>
        <td>${pill(p.status)}</td>
        <td><button class="price-save" data-pid="${p.id}">Save</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>` : ''}
  <div class="panel">
    <div class="pnl-title">Full Pipeline · ${prods.length} Products</div>
    <div style="overflow-x:auto"><table class="tbl">
      <thead><tr><th>Product</th><th>Category</th><th>Status</th><th>Copy</th><th>Content</th><th>Ads</th><th>Score</th></tr></thead>
      <tbody>${prods.slice(0,60).map(p=>{
        const sc=parseJ(p.scores)||{};
        return `<tr>
          <td class="tc1" style="max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.title||'—'}</td>
          <td class="tc-m">${p.category||'—'}</td>
          <td>${pill(p.status)}</td>
          <td>${p.copy_status==='done'?'<span class="tc-g">✓</span>':'<span style="color:var(--t4)">—</span>'}</td>
          <td>${p.content_status==='done'?'<span class="tc-g">✓</span>':'<span style="color:var(--t4)">—</span>'}</td>
          <td>${p.ads_status==='done'?'<span class="tc-g">✓</span>':'<span style="color:var(--t4)">—</span>'}</td>
          <td style="color:var(--yellow);font-weight:700">${sc.composite||'—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

// ── MODULE: Fulfillment ───────────────────────────────────────
async function fulfillment() {
  const shopOrders = await api('/api/shopify/orders').catch(()=>[]);
  const total    = shopOrders.length;
  const fulfilled= shopOrders.filter(o=>o.fulfillment_status==='fulfilled').length;
  const pending  = shopOrders.filter(o=>!o.fulfillment_status||o.fulfillment_status==='unfulfilled').length;
  const partial  = shopOrders.filter(o=>o.fulfillment_status==='partial').length;
  const rate     = total ? (fulfilled/total*100) : 0;

  const rows = shopOrders.slice(0,20).map(o=>`<tr>
    <td class="tc1">${o.name||'—'}</td>
    <td class="tc-g">${money(o.total_price)} CAD</td>
    <td>${pill(o.financial_status||'pending')}</td>
    <td>${pill(o.fulfillment_status||'unfulfilled')}</td>
    <td class="tc-m">${timeAgo(o.created_at)}</td>
  </tr>`).join('');

  return `
  <div class="kpi-row">
    ${kpi('Fulfillment Rate', pct(rate),    `${fulfilled} of ${total} orders`, rate>=90?'green':rate>=70?'yellow':'red')}
    ${kpi('Pending',   pending,    'awaiting fulfillment',   pending>0?'yellow':'green')}
    ${kpi('Fulfilled', fulfilled,  'delivered to customer',  'green')}
    ${kpi('Partial',   partial,    'partially shipped',      partial>0?'yellow':'green')}
  </div>
  <div class="panel">
    <div class="pnl-title">Order Fulfillment Status · Shopify</div>
    ${rows ? `<div style="overflow-x:auto"><table class="tbl">
      <thead><tr><th>Order</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>When</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<div class="empty">No orders yet.</div>'}
  </div>`;
}

// ── MODULE: Commander ─────────────────────────────────────────
async function commander() {
  const cmds = await api('/api/commands');

  const statusBadge = s => {
    const map = {
      pending: ['cmd-s-pending','Pending'],
      running: ['cmd-s-running','Running'],
      done:    ['cmd-s-done',   'Done'],
      failed:  ['cmd-s-failed', 'Failed'],
    };
    const [cls, lbl] = map[s] || map.pending;
    return `<span class="${cls}">${lbl}</span>`;
  };

  const history = cmds.length ? cmds.map(c => `
    <div class="cmd-row">
      <div class="cmd-row-top">
        <span class="cmd-msg">${c.message}</span>
        ${statusBadge(c.status)}
      </div>
      ${c.agent  ? `<div class="cmd-agent">Picked up by <strong>${c.agent}</strong></div>` : ''}
      ${c.result ? `<div class="cmd-result">${c.result}</div>` : ''}
      <div class="cmd-ts">${timeAgo(c.created_at)}</div>
    </div>`).join('') : `<div class="cmd-empty">No commands sent yet. Type your first instruction below.</div>`;

  return `
    <div class="cmd-explainer">
      Type any instruction — the agents check this queue and act on it. Examples:<br>
      <em>"Research 10 home organizer products priced under $40"</em> &nbsp;·&nbsp;
      <em>"Update all product prices by +10%"</em> &nbsp;·&nbsp;
      <em>"Pause all ad campaigns"</em>
    </div>
    <div class="cmd-history" id="cmdHistory">${history}</div>
    <div class="cmd-input-wrap">
      <textarea id="cmdText" class="cmd-textarea" rows="2" placeholder="Tell your agents what to do…"></textarea>
      <button class="cmd-send" id="cmdSend">Send</button>
    </div>`;
}

// ── MODULE: Agents (with controls) ────────────────────────────
async function agents() {
  const [all, setts] = await Promise.all([api('/api/agents'), api('/api/settings')]);
  const seen=new Set(), list=(all||[]).filter(a=>{
    const nm=a.payload?.agent||a.agent_id; if(seen.has(nm))return false; seen.add(nm); return true;
  });
  const ok  = list.filter(a=>!a.payload?.errors).length;
  const err = list.filter(a=> a.payload?.errors).length;
  const enabledMap = {};
  setts.filter(s=>s.key.startsWith('agents.')).forEach(s=>{ enabledMap[s.key]=s.value==='true'; });

  const AGENT_DEFS = [
    {key:'research', name:'Research Agent',  desc:'Finds new products on CJ Dropshipping'},
    {key:'pricing',  name:'Pricing Agent',   desc:'Sets prices based on cost + markup rules'},
    {key:'copy',     name:'Copy Agent',      desc:'Writes product descriptions and captions'},
    {key:'ads',      name:'Ads Agent',       desc:'Creates Facebook/Instagram ad briefs'},
    {key:'cs',       name:'CS Agent',        desc:'Monitors orders, returns, and CS flags'},
  ];

  const agentControls = AGENT_DEFS.map(a => {
    const enabled = enabledMap[`agents.${a.key}_enabled`] !== false;
    const log = list.find(l=>(l.payload?.agent||'').toLowerCase().includes(a.key.slice(0,4)));
    return `<div class="agent-ctrl-row">
      <div class="agent-dot ${enabled?(log?.payload?.errors?'err':'ok'):'off'}"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--t1)">${a.name}</div>
        <div style="font-size:11px;color:var(--t3);margin-top:2px">${a.desc}</div>
        ${log?`<div style="font-size:10.5px;color:var(--t4);margin-top:3px">${(log.payload?.exec_summary||'').slice(0,90)} · ${timeAgo(log.ts||log.created_at)}</div>`:''}
      </div>
      <label class="toggle">
        <input type="checkbox" class="agent-toggle" data-agent="${a.key}" ${enabled?'checked':''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </label>
    </div>`;
  }).join('');

  return `
  <div class="kpi-row kpi-row-3">
    ${kpi('Agents', AGENT_DEFS.length, 'configured', 'blue')}
    ${kpi('Healthy', ok, 'no errors', 'green')}
    ${kpi('Errors', err, 'need attention', err>0?'red':'green')}
  </div>
  <div class="panel">
    <div class="pnl-title">Agent Controls — Toggle On / Off</div>
    ${agentControls}
  </div>
  <div class="panel">
    <div class="pnl-title">Recent Activity</div>
    <table class="tbl">
      <thead><tr><th>Agent</th><th>Last Summary</th><th>When</th></tr></thead>
      <tbody>${list.slice(0,10).map(a=>`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="agent-dot ${a.payload?.errors?'err':'ok'}"></div><strong style="color:var(--t1)">${a.payload?.agent||a.agent_id||'—'}</strong></div></td>
        <td class="tc-m" style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(a.payload?.exec_summary||'—').slice(0,100)}</td>
        <td class="tc-m">${timeAgo(a.ts||a.created_at)}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
}

// ── MODULE: Settings (fully editable) ────────────────────────
async function settings() {
  const [setts, kpis, shopProds] = await Promise.all([
    api('/api/settings'),
    api('/api/shopify/kpis').catch(()=>null),
    api('/api/shopify/products').catch(()=>null),
  ]);

  const shopOk = Array.isArray(shopProds);
  const byGroup = {};
  setts.forEach(s => { if (!byGroup[s.group_name]) byGroup[s.group_name] = []; byGroup[s.group_name].push(s); });

  const editRow = s => {
    const isBool = s.value === 'true' || s.value === 'false';
    if (isBool) return `
      <div class="set-row" data-key="${s.key}">
        <span class="set-k">${s.label}</span>
        <div style="flex:1"></div>
        <label class="toggle">
          <input type="checkbox" class="toggle-cb" data-key="${s.key}" ${s.value==='true'?'checked':''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </div>`;
    return `
      <div class="set-row" data-key="${s.key}">
        <span class="set-k">${s.label}</span>
        <input class="set-input" data-key="${s.key}" value="${s.value}" />
        <button class="set-save" data-key="${s.key}">Save</button>
      </div>`;
  };

  const groups = Object.entries(byGroup).map(([grp, rows]) => `
    <div class="panel">
      <div class="pnl-title">${grp} Settings</div>
      ${rows.map(editRow).join('')}
    </div>`).join('');

  return `
  <div class="panel">
    <div class="pnl-title">Connections</div>
    <div class="set-row"><span class="set-k">Shopify</span><span class="set-v">lumera-aura.myshopify.com</span><span class="${shopOk?'set-ok':'set-err'}">${shopOk?'● Connected':'● Error'}</span></div>
    <div class="set-row"><span class="set-k">Products in Store</span><span class="set-v">${kpis?.shopifyProductCount??'—'}</span></div>
    <div class="set-row"><span class="set-k">Supabase</span><span class="set-v">qjclbnbzntdxfjuomdwr.supabase.co</span><span class="set-ok">● Connected</span></div>
    <div class="set-row"><span class="set-k">n8n Agents</span><span class="set-v">clariva-n8n.onrender.com</span><span class="set-ok">● Running</span></div>
  </div>
  ${groups}`;
}

// ── Button bindings ───────────────────────────────────────────
function bind() {
  // Queue prev/next
  document.querySelectorAll('[data-qprev]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r = btn.dataset.qprev;
      S.qi[r] = Math.max(0, (S.qi[r]||0) - 1);
      renderPage();
    });
  });
  document.querySelectorAll('[data-qnext]').forEach(btn => {
    btn.addEventListener('click', () => {
      const r   = btn.dataset.qnext;
      const max = Number(btn.closest('[data-qtotal]')?.dataset.qtotal||999) - 1;
      S.qi[r] = Math.min(max, (S.qi[r]||0) + 1);
      renderPage();
    });
  });

  // Approve
  document.querySelectorAll('[data-approve]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Approving…';
      try {
        await fetch(`/api/decisions/${btn.dataset.approve}/approve`, {method:'POST'});
        S.expanded = null; renderPage();
      } catch { btn.disabled = false; btn.textContent = 'Retry'; }
    });
  });

  // Reject / skip
  document.querySelectorAll('[data-reject]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Skipping…';
      try {
        await fetch(`/api/decisions/${btn.dataset.reject}/reject`, {method:'POST'});
        S.expanded = null; renderPage();
      } catch { btn.disabled = false; btn.textContent = 'Retry'; }
    });
  });

  // Settings: save a value
  document.querySelectorAll('.set-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      const inp = document.querySelector(`.set-input[data-key="${key}"]`);
      if (!inp) return;
      btn.disabled = true; btn.textContent = '…';
      await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key, value: inp.value }) });
      btn.textContent = '✓'; setTimeout(()=>{ btn.textContent='Save'; btn.disabled=false; }, 1500);
    });
  });

  // Settings: toggle boolean
  document.querySelectorAll('.toggle-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      await fetch('/api/settings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: cb.dataset.key, value: cb.checked ? 'true' : 'false' }) });
    });
  });

  // Agents: toggle on/off
  document.querySelectorAll('.agent-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      await fetch(`/api/agents/${cb.dataset.agent}/${cb.checked?'enable':'disable'}`, { method:'POST' });
    });
  });

  // Price editing in Products
  document.querySelectorAll('.price-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pid = btn.dataset.pid;
      const inp = document.querySelector(`.price-input[data-pid="${pid}"]`);
      if (!inp) return;
      btn.disabled = true; btn.textContent = '…';
      const r = await fetch(`/api/shopify/products/${pid}/price`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ price: inp.value }) });
      btn.textContent = r.ok ? '✓ Saved' : '✗ Error';
      setTimeout(()=>{ btn.textContent='Save'; btn.disabled=false; }, 2000);
    });
  });
  document.querySelectorAll('.price-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.querySelector(`.price-save[data-pid="${inp.dataset.pid}"]`)?.click();
    });
  });

  // Research on demand
  document.getElementById('resSubmit')?.addEventListener('click', async () => {
    const btn = document.getElementById('resSubmit');
    const keywords = document.getElementById('resKeywords')?.value.trim();
    const category = document.getElementById('resCategory')?.value.trim();
    const maxCost  = document.getElementById('resMaxCost')?.value.trim();
    if (!keywords) { document.getElementById('resKeywords')?.focus(); return; }
    btn.disabled = true; btn.textContent = 'Queuing…';
    await fetch('/api/trigger/research', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ keywords, category, max_cost: maxCost }) });
    btn.textContent = '✓ Research queued — check Commander for status';
    setTimeout(() => go('commander'), 2000);
  });

  // Commander send
  const sendBtn  = document.getElementById('cmdSend');
  const textarea = document.getElementById('cmdText');
  if (sendBtn && textarea) {
    const doSend = async () => {
      const msg = textarea.value.trim();
      if (!msg) return;
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      textarea.disabled = true;
      try {
        await fetch('/api/commands', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: msg }) });
        textarea.value = '';
        renderPage();
      } catch {
        sendBtn.disabled = false; sendBtn.textContent = 'Send';
        textarea.disabled = false;
      }
    };
    sendBtn.addEventListener('click', doSend);
    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doSend();
    });
  }

  document.getElementById('tbRefresh')?.addEventListener('click', renderPage);
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  startSSE();
  go('overview');
});
