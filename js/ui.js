/* ================================================================
   FINLENS — ui.js
   View registry, drawer, chart helpers, rendering utilities
================================================================ */

/* ---------- VIEWS ---------- */
const VIEWS = {};
function registerView(id, title, render) { VIEWS[id]={title,render}; }

// Transactions and the four screens its filter pills open (Income, Spending, Bills,
// Transfers). The app bar keeps Transactions underlined on all five (v1.14.0).
const TX_VIEWS = ['transactions','income','spending','bills','transfers'];

function showView(id) {
  if (!VIEWS[id]) id='overview';
  // Moving to another screen closes any open menu. Re-rendering the same screen (a filter
  // change from the Accounts popover) leaves it open, so several boxes can be toggled.
  if (id!==State.currentView) closeAppBarPopups();
  // App bar + menus: mark the current page. The Plan button stands for its five screens,
  // and the Transactions link for its pill screens (aria-current="true" there, not "page").
  $$('.mainnav [data-view], .menu [data-view], .mobile-menu [data-view], .appbar .gear').forEach(a=>{
    const v=a.dataset.view;
    const exact=v===id;
    const parent=!exact && v==='transactions' && TX_VIEWS.includes(id) && !!a.closest('.mainnav, .mobile-menu');
    a.classList.toggle('active',exact||parent);
    if (exact) a.setAttribute('aria-current','page');
    else if (parent) a.setAttribute('aria-current','true');
    else a.removeAttribute('aria-current');
  });
  const pb=$('#planBtn'); if (pb) pb.classList.toggle('active',PLAN_VIEWS.includes(id));
  const gear=$('.appbar .gear'); if (gear) gear.classList.toggle('on',id==='settings');
  const pt=$('#pageTitle'); if (pt) pt.textContent=VIEWS[id].title;
  if (typeof updateSyncBadge==='function') updateSyncBadge();
  const c=$('#content'); if (!c) return;
  c.innerHTML='';
  const sec=document.createElement('section');
  sec.className='view active';
  sec.id='view-'+id;
  c.appendChild(sec);
  VIEWS[id].render(sec);
  State.currentView=id;
}

function renderActive() { showView(State.currentView||'overview'); }

/* ---------- DRAWER ---------- */
// One shared side panel (#txDrawer in index.html) with a title row, a scrolling body and
// an optional footer pinned at the bottom:
//   openDrawer(bodyHtml, { title, footer })
// Older callers (Budget, Bucket, Debt forms) put their own <h3> first in the body: it
// becomes the title. The scrim, × and Escape close it, and focus goes back to the
// element that opened it.
let _drawerReturnFocus=null;
function openDrawer(html, opts={}) {
  const dr=$('#txDrawer'), body=$('#drawerBody');
  if (!dr||!body) return;
  body.innerHTML=html;
  let title=opts.title;
  const h=body.firstElementChild;
  if (!title && h && h.tagName==='H3') { title=h.textContent; h.remove(); }
  const tt=$('#drawerTitle'); if (tt) tt.textContent=title||'Details';
  const foot=$('#drawerFoot');
  if (foot) { foot.innerHTML=opts.footer||''; foot.hidden=!opts.footer; }
  if (!dr.classList.contains('open')) _drawerReturnFocus=document.activeElement;
  dr.classList.add('open');
  dr.setAttribute('aria-hidden','false');
  const s=$('#drawerScrim'); if (s) s.hidden=false;
  body.scrollTop=0;
  const close=dr.querySelector('.drawer-head .close');
  if (close) setTimeout(()=>{ if (dr.classList.contains('open')) close.focus({preventScroll:true}); },0);
}
function closeDrawer() {
  const dr=$('#txDrawer'); if (!dr) return;
  const wasOpen=dr.classList.contains('open');
  dr.classList.remove('open');
  dr.setAttribute('aria-hidden','true');
  const s=$('#drawerScrim'); if (s) s.hidden=true;
  if (wasOpen && _drawerReturnFocus && _drawerReturnFocus.isConnected) _drawerReturnFocus.focus({preventScroll:true});
  _drawerReturnFocus=null;
}

/* ---------- THEME ---------- */
// State.theme is 'light' (default), 'dark' or 'system' (follow the OS). It's chosen in
// Settings → General → Theme; there is no toggle in the app bar (v1.13.0).
function resolvedTheme() {
  if (State.theme==='dark') return 'dark';
  if (State.theme==='system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}
function applyTheme() {
  document.documentElement.setAttribute('data-theme', resolvedTheme());
  // Chart.js draws axis labels, legends and grid lines in its own defaults, which don't
  // follow the theme. Use the theme's tokens instead.
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = cssVar('--text-2');
    Chart.defaults.borderColor = cssVar('--chart-grid');
    Chart.defaults.font.family = "'Inter',system-ui,sans-serif";
  }
}
function setTheme(mode) {
  State.theme = ['light','dark','system'].includes(mode) ? mode : 'light';
  lsSet('theme', State.theme);
  applyTheme();
  renderActive();   // charts read their colors when they draw
}
// "Match system": follow the OS when it switches between light and dark.
if (window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => { if (State.theme==='system') { applyTheme(); renderActive(); } };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

/* ---------- THEME COLORS FOR CHARTS ---------- */
// Chart.js and the inline SVGs can't read CSS variables, so they ask for the current
// value when they draw. Views redraw on every render, and setTheme() re-renders, so a
// theme change recolors them. Pass alpha (0–1) for a translucent fill.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function chartColor(name, alpha) {
  const c = cssVar(name) || '#94a3b8';
  if (alpha == null) return c;
  const m = c.match(/^#([0-9a-f]{6})$/i);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n>>16&255},${n>>8&255},${n&255},${alpha})`;
}

/* ---------- APP BAR: Plan menu, filter popovers, ☰ menu ---------- */
const PLAN_VIEWS = ['budgets','buckets','debt','investments','forecast'];
let _appBarOpen = null;   // { btn, panel } of the menu or popover that's open

function openAppBarPopup(btn, panel) {
  closeAppBarPopups();
  panel.hidden = false;
  btn.setAttribute('aria-expanded','true');
  btn.classList.add('open');
  if (panel.id === 'mobileMenu') { const s=$('#menuScrim'); if (s) s.hidden=false; }
  _appBarOpen = { btn, panel };
}
function closeAppBarPopups(focusBtn) {
  if (!_appBarOpen) return;
  const { btn, panel } = _appBarOpen;
  panel.hidden = true;
  btn.setAttribute('aria-expanded','false');
  btn.classList.remove('open');
  const s=$('#menuScrim'); if (s) s.hidden=true;
  _appBarOpen = null;
  if (focusBtn) btn.focus();
}
function toggleAppBarPopup(btn, panel) {
  if (_appBarOpen && _appBarOpen.panel === panel) closeAppBarPopups();
  else openAppBarPopup(btn, panel);
}

// Date range popover: check the active range; the dot shows it differs from the default (This month).
function updateRangeUI(pendingCustom) {
  const mode = State.range && State.range.mode;
  const custom = pendingCustom || mode === 'custom';
  $$('#rangePop [data-range]').forEach(b => b.setAttribute('aria-checked', String(custom ? b.dataset.range === 'custom' : b.dataset.range === mode)));
  const cr = $('#customRange'); if (cr) cr.hidden = !custom;
  const label = 'Date range: ' + describeRange();
  const btn = $('#rangeBtn'); if (btn) { btn.setAttribute('aria-label', label); btn.title = label; btn.classList.toggle('on', mode !== 'month'); }
  const dot = $('#rangeDot'); if (dot) dot.hidden = mode === 'month';
}

// Accounts popover: the dot shows only some accounts are included.
function updateAcctUI() {
  const all = State.selectedAccounts === 'all';
  const names = all ? 'All accounts' : orderedAccounts()
    .filter(a => State.selectedAccounts.includes(a.id))
    .map(a => State.accountLabels?.[a.id] || a.name).join(', ');
  const label = 'Accounts: ' + (names || 'All accounts');
  const btn = $('#acctBtn'); if (btn) { btn.setAttribute('aria-label', label); btn.title = label; btn.classList.toggle('on', !all); }
  const dot = $('#acctDot'); if (dot) dot.hidden = all;
  const ab = $('#acctAll'); if (ab) ab.setAttribute('aria-checked', String(all));
}

/* ---------- CHART GUARD (CLAUDE.md §7, rule 4) ---------- */
// Views draw charts in setTimeout(…, 0). When a view renders twice before those timers
// run (loadFiles() then showView() at boot, or Reconnect re-rendering after an import),
// both timers target the same canvas IDs and Chart.js throws "Canvas is already in use"
// for the second. Every `new Chart(...)` goes through this subclass, which destroys a
// chart already on the canvas first. It also destroys charts whose canvas has left the
// page: views rebuild their DOM on every render (§12) and never destroyed the old charts,
// so each render leaked them. Statics (defaults, getChart, register) are inherited.
if (typeof Chart !== 'undefined' && !Chart._finlensGuard) {
  const ChartJS = Chart;
  Chart = class extends ChartJS {
    constructor(item, config) {
      for (const c of Object.values(ChartJS.instances)) if (!c.canvas || !c.canvas.isConnected) c.destroy();
      const existing = ChartJS.getChart(item);
      if (existing) existing.destroy();
      super(item, config);
    }
  };
  Chart._finlensGuard = true;
}

/* ---------- CHART PALETTE ---------- */
// Mid-tone hues that read on both the light and the dark surfaces, indigo first.
const CHART_PALETTE = ['#6366f1','#f59e0b','#14b8a6','#ec4899','#0ea5e9','#84cc16','#8b5cf6','#f97316','#64748b','#22c55e','#eab308','#06b6d4'];
const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend:{ display:false } }
};

function mergeChartOpts(extra) {
  return Object.assign({}, CHART_DEFAULTS, extra);
}

/* ---------- SMALL FORMATTERS (v1.14.0) ---------- */
// Signed money with a real minus sign: "+$2,450.00", "−$65.00". `zero` decides the sign of 0.
function fmtSigned(n, zero='+') {
  if (n===null||n===undefined||isNaN(n)) return '—';
  const sign=n>0.004?'+':n<-0.004?'−':zero;
  return sign+fmt(Math.abs(n)).replace('-','');
}
// Axis labels: $0, $950, $2k, $12.5k, −$3k.
function fmtShort(v) {
  const a=Math.abs(v), s=v<0?'−':'';
  if (a>=1000) return s+'$'+(+(a/1000).toFixed(a%1000?1:0))+'k';
  return s+'$'+Math.round(a);
}
const ordinal=(n)=>n+(n%10===1&&n!==11?'st':n%10===2&&n!==12?'nd':n%10===3&&n!==13?'rd':'th');
// Display name of an account (custom label first).
function acctName(id) {
  if (!id) return 'Outside FinLens';
  return State.accountLabels?.[id]||State.accounts[id]?.name||id;
}

/* ---------- INLINE SVG CHARTS (v1.14.0) ---------- */
// The Overview, Spending and account cards draw small line charts as inline SVG. Their
// colors come from CSS classes in index.html (.lc-*, .spark, .hue-*), which read the
// theme tokens, so they follow light/dark without chartColor().
function niceStep(x) {
  if (!(x>0)) return 1;
  const p=Math.pow(10,Math.floor(Math.log10(x))), f=x/p;
  return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;
}
// pts: [{ v, tip }] evenly spaced left to right.
// opts: { w, h, hue, xLabels:[{ i, text }], valueAt (index to label with its value),
//         hollowLast (an unfinished last point), dots (default true when ≤ 40 points) }
function svgLineChart(pts, opts={}) {
  const w=opts.w||760, h=opts.h||180, L=40, R=12, T=18, B=28;
  if (!pts.length) return '';
  const vals=pts.map(p=>p.v);
  let lo=Math.min(0,...vals), hi=Math.max(0,...vals);
  const step=niceStep((hi-lo)/2||1);
  hi=Math.ceil(hi/step-1e-9)*step; lo=Math.floor(lo/step+1e-9)*step;
  if (hi<=lo) hi=lo+step;
  const pw=w-L-R, ph=h-T-B;
  const X=i=>L+(pts.length<2?pw/2:i*pw/(pts.length-1));
  const Y=v=>T+(hi-v)/(hi-lo)*ph;
  const out=[`<svg class="linechart hue-${opts.hue||'accent'}" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml(opts.ariaLabel||'')}">`];
  for (let v=lo; v<=hi+1e-9; v+=step) {
    const y=Y(v).toFixed(1);
    out.push(`<line class="${Math.abs(v)<1e-9?'lc-axis':'lc-grid'}" x1="${L}" y1="${y}" x2="${w-R}" y2="${y}"/>`);
    out.push(`<text class="lc-label" x="0" y="${(+y+4).toFixed(1)}">${fmtShort(v)}</text>`);
  }
  out.push(`<polyline class="lc-line" points="${pts.map((p,i)=>X(i).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ')}"/>`);
  const dots=opts.dots??pts.length<=40;
  pts.forEach((p,i)=>{
    const last=i===pts.length-1;
    if (!dots && !last && i!==opts.valueAt) return;
    const cls=last&&opts.hollowLast?'lc-pt hollow':'lc-pt';
    const r=last&&!opts.hollowLast||i===opts.valueAt?5:3.5;
    out.push(`<circle class="${cls}" cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${r}"><title>${escapeHtml(p.tip||fmt(p.v))}</title></circle>`);
  });
  if (opts.valueAt!=null && pts[opts.valueAt]) {
    const i=opts.valueAt;
    out.push(`<text class="lc-value" x="${X(i).toFixed(1)}" y="${(Y(pts[i].v)-11).toFixed(1)}" text-anchor="middle">${fmt0(pts[i].v)}</text>`);
  }
  // x labels: drop any that would overlap the one before (the last label always stays)
  const box=(l)=>{
    const wd=l.text.length*6.2, x=X(l.i);
    const anchor=l.i===0&&pts.length>1?'start':l.i===pts.length-1&&pts.length>1?'end':'middle';
    return { l, anchor, a:anchor==='start'?x:anchor==='end'?x-wd:x-wd/2, b:anchor==='start'?x+wd:anchor==='end'?x:x+wd/2 };
  };
  const kept=[];
  (opts.xLabels||[]).map(box).forEach(bx=>{
    while (kept.length && bx.a<kept[kept.length-1].b+8) {
      if (bx.l.i===pts.length-1 && kept.length>1) kept.pop(); else return;
    }
    kept.push(bx);
  });
  kept.forEach(bx=>out.push(`<text class="lc-label" x="${X(bx.l.i).toFixed(1)}" y="${h-6}" text-anchor="${bx.anchor}">${escapeHtml(bx.l.text)}</text>`));
  out.push('</svg>');
  return out.join('');
}
// A sparkline that stretches to its box. hue: accent | good | card | warn
function sparkSvg(vals, hue, label) {
  if (vals.length<2) return '';
  const lo=Math.min(...vals), hi=Math.max(...vals), span=hi-lo||1;
  const pts=vals.map((v,i)=>`${(i*220/(vals.length-1)).toFixed(1)},${(40-(v-lo)/span*36).toFixed(1)}`).join(' ');
  return `<svg class="spark hue-${hue}" viewBox="0 0 220 44" preserveAspectRatio="none" width="100%" height="44" role="img" aria-label="${escapeHtml(label||'')}"><polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- DAILY SPENDING HEATMAP (v1.14.0) ---------- */
// One column per week (Sunday first), from `start` to `end`. Days are shaded in six
// steps by where they fall among the days that had spending (quartiles, then the top 5%),
// so a few large days (rent) don't wash everything else out. Days outside the period are blank.
function dailyHeatmapHtml(txs, start, end) {
  const map={};
  txs.forEach(t=>{ const k=dayjs(t.date).format('YYYY-MM-DD'); map[k]=(map[k]||0)+Math.abs(t.amount); });
  const vals=Object.values(map).filter(v=>v>0).sort((a,b)=>a-b);
  const q=p=>vals.length?vals[Math.min(vals.length-1,Math.floor(p*(vals.length-1)))]:0;
  const th=[q(.25),q(.5),q(.75),q(.95)];
  const level=v=>v<=0?0:v<=th[0]?1:v<=th[1]?2:v<=th[2]?3:v<=th[3]?4:5;
  const s=new Date(start.getFullYear(),start.getMonth(),start.getDate());
  const e=new Date(end.getFullYear(),end.getMonth(),end.getDate());
  const first=new Date(s); first.setDate(first.getDate()-first.getDay());
  const weeks=[], months=[];
  for (let d=new Date(first), w=0; d<=e; w++) {
    const col=[];
    for (let i=0;i<7;i++,d.setDate(d.getDate()+1)) {
      if (d.getDate()===1 || (w===0&&i===0)) {
        const lbl=dayjs(d<s?s:d).format('MMM');
        if (!months.length || months[months.length-1].text!==lbl) months.push({ col:w, text:lbl });
      }
      if (d<s||d>e) { col.push('<span class="hm-cell none" aria-hidden="true"></span>'); continue; }
      const k=dayjs(d).format('YYYY-MM-DD'), v=map[k]||0;
      col.push(`<span class="hm-cell l${level(v)}" title="${dayjs(d).format('ddd, MMM D')}: ${v?fmt(v):'no spending'}"></span>`);
    }
    weeks.push(`<span class="hm-week">${col.join('')}</span>`);
  }
  // drop a month label that would sit on top of the previous one
  const labels=months.filter((m,i)=>i===0||m.col-months[i-1].col>=3);
  return `<div class="heatmap">
    <div class="hm-days" aria-hidden="true"><span>Sun</span><span></span><span>Tue</span><span></span><span>Thu</span><span></span><span>Sat</span></div>
    <div class="hm-main">
      <div class="hm-months" aria-hidden="true" style="grid-template-columns:repeat(${weeks.length},15px)">${labels.map(m=>`<span style="grid-column:${m.col+1}/span 4">${m.text}</span>`).join('')}</div>
      <div class="hm-grid" role="img" aria-label="Daily spending from ${dayjs(s).format('MMM D')} to ${dayjs(e).format('MMM D, YYYY')}: ${vals.length} days with spending, the highest ${fmt(vals[vals.length-1]||0)}">${weeks.join('')}</div>
    </div>
  </div>`;
}

/* ---------- BILL HELPERS ---------- */
// State.bills entries: { merchant, amount, category, frequency, dueDate:'YYYY-MM-DD', paid,
//   source:'auto'|'manual', account?, subscription?, recurringKey? }  (CLAUDE.md §4.1)
// Bills added in this session show "Just added" in the bills table.
const _justAddedBills=new Set();
function billIsSubscription(b) {
  if (b.subscription!=null) return !!b.subscription;
  const m=(b.merchant||'').toUpperCase();
  return b.category==='Subscriptions' || SUBS_KEYWORDS.some(k=>m.includes(k));
}
function addBill(bill) {
  State.bills.push(bill);
  _justAddedBills.add(bill);
  lsSet('bills',State.bills);
}
// Confirm a charge detectRecurring() spotted: it becomes a bill that pays from the same
// account, due on its next expected date.
function confirmRecurring(r) {
  State.recurringConfirmed[r.key]='confirmed';
  lsSet('recurring',State.recurringConfirmed);
  addBill({ merchant:r.merchant, amount:Math.round(r.avg*100)/100, frequency:r.freq,
    dueDate:dayjs(r.nextDue).format('YYYY-MM-DD'), category:r.category, paid:false, source:'auto',
    account:r.account||'', subscription:!!r.isSubscription, recurringKey:r.key });
  renderActive();
}
function dismissRecurring(key) {
  State.recurringConfirmed[key]='dismissed';
  lsSet('recurring',State.recurringConfirmed);
  renderActive();
}
function undoDismissRecurring(key) {
  delete State.recurringConfirmed[key];
  lsSet('recurring',State.recurringConfirmed);
  renderActive();
}
function toggleBillPaid(i){ State.bills[i].paid=!State.bills[i].paid; lsSet('bills',State.bills); renderActive(); }
// No confirm() here: the edit drawer's Delete button asks for a second click instead.
function deleteBill(i){ State.bills.splice(i,1); lsSet('bills',State.bills); renderActive(); }

function _billAccountOptions(sel) {
  return `<option value="">Not set</option>`+orderedAccounts().map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===sel?'selected':''}>${escapeHtml(acctName(a.id))}</option>`).join('');
}
function _billFreqOptions(sel) {
  return Object.entries(BILL_FREQS).map(([v,f])=>`<option value="${v}" ${v===sel?'selected':''}>${f.label}</option>`).join('');
}
// Edit a bill (i ≥ 0) or add one (i < 0) in the drawer.
function showBillForm(i=-1) {
  const b=i>=0?State.bills[i]:{merchant:'',amount:'',frequency:'Monthly',dueDate:dayjs().format('YYYY-MM-DD'),category:'Bills & Utilities',paid:false,account:''};
  const cats=[...new Set([...State.categories, b.category].filter(Boolean))];
  openDrawer(`<div class="dform">
    <label class="field">Name<input class="input" id="bMerchant" value="${escapeHtml(b.merchant)}" placeholder="e.g. Car insurance"></label>
    <div class="field-row">
      <label class="field">Amount<input class="input" id="bAmount" type="number" step="0.01" inputmode="decimal" value="${b.amount===''?'':b.amount}"></label>
      <label class="field">Repeats<select class="select" id="bFreq">${_billFreqOptions(b.frequency)}</select></label>
    </div>
    <div class="field-row">
      <label class="field">Next due<input class="input" id="bDue" type="date" value="${escapeHtml(b.dueDate)}"></label>
      <label class="field">Pays from<select class="select" id="bAccount">${_billAccountOptions(b.account)}</select></label>
    </div>
    <label class="field">Category<select class="select" id="bCategory">${cats.map(c=>`<option ${c===b.category?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label>
    <fieldset class="flag-set"><legend>Flags</legend>
      <label class="check-chip"><input type="checkbox" id="bSub" ${billIsSubscription(b)?'checked':''}>Subscription</label>
      <label class="check-chip"><input type="checkbox" id="bPaid" ${b.paid?'checked':''}>Paid</label>
    </fieldset>
    ${i>=0&&b.recurringKey?`<p class="drawer-note">Confirmed from a recurring charge FinLens spotted. Its last payment and next due date come from your transactions.</p>`:''}</div>`,
    { title:i>=0?'Edit bill':'Add bill',
      footer:`${i>=0?'<button type="button" class="btn ghost danger-text" id="bDelete">Delete</button>':''}<span class="grow"></span><button type="button" class="btn ghost" onclick="closeDrawer()">Cancel</button><button type="button" class="btn" id="bSave">Save bill</button>` });
  $('#bSave').onclick=()=>saveBill(i);
  const del=$('#bDelete');
  if (del) del.onclick=()=>{
    if (del.dataset.armed!=='1') { del.dataset.armed='1'; del.textContent='Click again to delete'; return; }
    closeDrawer(); deleteBill(i);
  };
}
function saveBill(i=-1) {
  const merchant=$('#bMerchant').value.trim();
  if (!merchant){ alert('Give the bill a name.'); return; }
  const prev=i>=0?State.bills[i]:{source:'manual'};
  const bill={ ...prev,
    merchant,
    amount:parseFloat($('#bAmount').value)||0,
    category:$('#bCategory').value,
    frequency:$('#bFreq').value,
    dueDate:$('#bDue').value||dayjs().format('YYYY-MM-DD'),
    account:$('#bAccount').value,
    subscription:$('#bSub').checked,
    paid:$('#bPaid').checked,
  };
  closeDrawer();
  if (i>=0) { State.bills[i]=bill; if (_justAddedBills.has(prev)) _justAddedBills.add(bill); lsSet('bills',State.bills); }
  else addBill(bill);
  renderActive();
}

/* ---------- CATEGORY HELPERS ---------- */
function addCatRule() {
  const c=$('#ruleContains').value.trim();
  const cat=$('#ruleCat').value;
  if (!c) return;
  State.categoryRules=State.categoryRules||[];
  State.categoryRules.push({contains:c,category:cat});
  lsSet('catRules',State.categoryRules);
  renderActive();
}
function delCatRule(i){ State.categoryRules.splice(i,1); lsSet('catRules',State.categoryRules); renderActive(); }
function recategorizeAll() {
  for (const t of State.transactions) {
    const ov=State.txOverrides[t.id];
    if (ov&&ov.categories&&ov.categories.length) continue;
    t.categories=[autoCategory(t._originalDesc||t.description)];
  }
  renderActive();
}

/* ---------- BUDGET HELPERS ---------- */
const SUGGESTED_BUDGETS=[
  {name:'Food & Dining',limit:600,categories:['Food & Dining','Groceries'],color:'#EF4444'},
  {name:'Housing',limit:1500,categories:['Housing'],color:'#8B5CF6'},
  {name:'Transport',limit:300,categories:['Transport'],color:'#3B82F6'},
  {name:'Entertainment',limit:150,categories:['Entertainment'],color:'#F472B6'},
  {name:'Health',limit:150,categories:['Health'],color:'#34D399'},
  {name:'Shopping',limit:250,categories:['Shopping'],color:'#F59E0B'},
  {name:'Bills & Utilities',limit:300,categories:['Bills & Utilities'],color:'#7DD3FC'},
  {name:'Subscriptions',limit:80,categories:['Subscriptions'],color:'#A78BFA'},
];
function seedBudgets(){ State.budgets=JSON.parse(JSON.stringify(SUGGESTED_BUDGETS)); lsSet('budgets',State.budgets); renderActive(); }
function addBudget(){ editBudget(-1); }
function editBudget(i) {
  const b=i>=0?State.budgets[i]:{name:'',limit:0,categories:[],color:'#6366f1'};
  openDrawer(`
    <h3>${i>=0?'Edit':'Add'} Budget</h3>
    <label class="lbl">Name</label><input class="input" id="bnName" value="${escapeHtml(b.name)}">
    <label class="lbl" style="margin-top:8px">Monthly Limit ($)</label><input class="input" id="bnLimit" type="number" step="1" value="${b.limit}">
    <label class="lbl" style="margin-top:8px">Linked Categories (comma-separated)</label>
    <input class="input" id="bnCats" value="${(b.categories||[]).join(', ')}" placeholder="${State.categories.slice(0,3).join(', ')}">
    <div class="muted" style="font-size:11px;margin-top:4px">Available: ${State.categories.join(', ')}</div>
    <label class="lbl" style="margin-top:8px">Color</label>
    <input class="input" id="bnColor" type="color" value="${b.color||'#6366f1'}" style="height:40px;padding:2px">
    <div class="hr"></div>
    <button class="btn" onclick="saveBudget(${i})">Save</button> <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
  `);
}
function saveBudget(i) {
  const obj={
    name:$('#bnName').value.trim(),
    limit:parseFloat($('#bnLimit').value)||0,
    categories:$('#bnCats').value.split(',').map(s=>s.trim()).filter(Boolean),
    color:$('#bnColor').value
  };
  if (!obj.name||!obj.categories.length){ alert('Name and at least one category required.'); return; }
  if (i>=0) State.budgets[i]=obj; else State.budgets.push(obj);
  lsSet('budgets',State.budgets);
  closeDrawer(); renderActive();
}
function deleteBudget(i){ if(!confirm('Delete this budget?')) return; State.budgets.splice(i,1); lsSet('budgets',State.budgets); renderActive(); }

/* ---------- SAVINGS BUCKET HELPERS ---------- */
function editBucket(i) {
  const b=i>=0?State.buckets[i]:{name:'',goal:0,current:0,targetDate:'',color:'#6366f1',icon:'💰'};
  openDrawer(`
    <h3>${i>=0?'Edit':'Add'} Bucket</h3>
    <label class="lbl">Name</label><input class="input" id="bkName" value="${escapeHtml(b.name)}">
    <div class="row" style="margin-top:8px">
      <div style="flex:1"><label class="lbl">Goal $</label><input class="input" id="bkGoal" type="number" step="1" value="${b.goal||0}"></div>
      <div style="flex:1"><label class="lbl">Currently Saved $</label><input class="input" id="bkCur" type="number" step="1" value="${b.current||0}"></div>
    </div>
    <label class="lbl" style="margin-top:8px">Target Date (optional)</label><input class="input" id="bkDate" type="date" value="${b.targetDate||''}">
    <div class="row" style="margin-top:8px">
      <div style="flex:1"><label class="lbl">Color</label><input class="input" id="bkColor" type="color" value="${b.color||'#6366f1'}" style="height:40px;padding:2px"></div>
      <div style="flex:1"><label class="lbl">Icon (emoji)</label><input class="input" id="bkIcon" value="${b.icon||'💰'}"></div>
    </div>
    <div class="hr"></div>
    <button class="btn" onclick="saveBucket(${i})">Save</button> <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
  `);
}
function saveBucket(i) {
  const obj={name:$('#bkName').value.trim(),goal:parseFloat($('#bkGoal').value)||0,current:parseFloat($('#bkCur').value)||0,targetDate:$('#bkDate').value,color:$('#bkColor').value,icon:$('#bkIcon').value||'💰'};
  if (!obj.name){ alert('Name required.'); return; }
  if (i>=0) State.buckets[i]=obj; else State.buckets.push(obj);
  lsSet('buckets',State.buckets);
  closeDrawer(); renderActive();
}
function deleteBucket(i){ if(!confirm('Delete this bucket?')) return; State.buckets.splice(i,1); lsSet('buckets',State.buckets); renderActive(); }

/* ---------- DEBT HELPERS ---------- */
function editDebt(i) {
  const d=i>=0?State.debts[i]:{name:'',type:'Credit Card',balance:0,apr:0,minPayment:0,limit:0,dueDay:1};
  openDrawer(`
    <h3>${i>=0?'Edit':'Add'} Debt</h3>
    <label class="lbl">Name</label><input class="input" id="dtName" value="${escapeHtml(d.name)}">
    <label class="lbl" style="margin-top:8px">Type</label>
    <select class="select" id="dtType">${['Credit Card','Personal Loan','Student Loan','Auto Loan','Mortgage','Other'].map(t=>`<option ${t===d.type?'selected':''}>${t}</option>`).join('')}</select>
    <div class="row" style="margin-top:8px">
      <div style="flex:1"><label class="lbl">Balance $</label><input class="input" id="dtBal" type="number" step="0.01" value="${d.balance||0}"></div>
      <div style="flex:1"><label class="lbl">APR %</label><input class="input" id="dtApr" type="number" step="0.01" value="${d.apr||0}"></div>
    </div>
    <div class="row" style="margin-top:8px">
      <div style="flex:1"><label class="lbl">Min Payment $</label><input class="input" id="dtMin" type="number" step="1" value="${d.minPayment||0}"></div>
      <div style="flex:1"><label class="lbl">Limit $ (CC only)</label><input class="input" id="dtLim" type="number" step="1" value="${d.limit||0}"></div>
    </div>
    <label class="lbl" style="margin-top:8px">Due Day of Month</label><input class="input" id="dtDue" type="number" min="1" max="31" value="${d.dueDay||1}">
    <div class="hr"></div>
    <button class="btn" onclick="saveDebt(${i})">Save</button> <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
  `);
}
function saveDebt(i) {
  const obj={name:$('#dtName').value.trim(),type:$('#dtType').value,balance:parseFloat($('#dtBal').value)||0,apr:parseFloat($('#dtApr').value)||0,minPayment:parseFloat($('#dtMin').value)||0,limit:parseFloat($('#dtLim').value)||0,dueDay:parseInt($('#dtDue').value)||1};
  if (!obj.name){ alert('Name required.'); return; }
  if (i>=0) State.debts[i]=obj; else State.debts.push(obj);
  lsSet('debts',State.debts);
  closeDrawer(); renderActive();
}
function deleteDebt(i){ if(!confirm('Delete this debt?')) return; State.debts.splice(i,1); lsSet('debts',State.debts); renderActive(); }

function simulatePayoff(debtsIn, extra) {
  const debts=debtsIn.map(d=>({name:d.name,balance:d.balance||0,apr:(d.apr||0)/100/12,minPayment:d.minPayment||0}));
  let month=0, totalInterest=0;
  const rows=[];
  while (debts.some(d=>d.balance>0.01)&&month<360) {
    month++;
    let monthInterest=0, monthPrincipal=0, monthPayment=0;
    debts.forEach(d=>{ if (d.balance>0){ const i=d.balance*d.apr; d.balance+=i; monthInterest+=i; totalInterest+=i; } });
    debts.forEach(d=>{ if (d.balance<=0) return; const pay=Math.min(d.balance,d.minPayment); d.balance-=pay; monthPayment+=pay; monthPrincipal+=pay; });
    const target=debts.find(d=>d.balance>0);
    if (target&&extra>0){ const pay=Math.min(target.balance,extra); target.balance-=pay; monthPayment+=pay; monthPrincipal+=pay; }
    rows.push({month,balance:debts.reduce((s,d)=>s+d.balance,0),interest:monthInterest,payment:monthPayment,principal:monthPrincipal});
  }
  return {months:month,totalInterest,rows};
}
function setPayoffStrategy(s){ State.payoffStrategy=s; renderActive(); }

/* ---------- EXPORT / IMPORT ---------- */
function exportAllData() {
  const data={
    version:'1.1', exportedAt:new Date().toISOString(),
    budgets:State.budgets, buckets:State.buckets, debts:State.debts, bills:State.bills,
    txOverrides:State.txOverrides, manualBalances:State.manualBalances,
    categoryRules:State.categoryRules, categories:State.categories,
    aiHistory:State.aiHistory, scenarios:State.scenarios,
    recurringConfirmed:State.recurringConfirmed, investAlloc:State.investAlloc,
  };
  downloadFile(`finlens-export-${dayjs().format('YYYYMMDD')}.json`, JSON.stringify(data,null,2),'application/json');
}
function importJsonFile(ev) {
  const file=ev.target.files[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try {
      const d=JSON.parse(e.target.result);
      // Exports from before v1.12.0 use the old account codes (migrate.js)
      IdMigration.migrateState(d);
      ['budgets','buckets','debts','bills','txOverrides','manualBalances','categoryRules','categories','aiHistory','scenarios','recurringConfirmed','investAlloc'].forEach(k=>{
        if (d[k]!==undefined){ State[k]=d[k]; lsSet(k,d[k]); }
      });
      if (IdMigration.adoptOverrides(State.transactions).size) lsSet('txOverrides',State.txOverrides);
      alert('Imported successfully.'); renderActive();
    } catch(err){ alert('Import failed: '+err.message); }
  };
  reader.readAsText(file);
}
// Erase everything and reload. Clearing only localStorage (as ≤v1.8.1 did) was undone on
// reload by IndexedDB and finlens-state.json, so this delegates to the full reset in
// views-cleanup.js. Call it from a click handler (it may need folder write access).
function clearAllData() {
  return DataCleanup.startOver('archive');
}
