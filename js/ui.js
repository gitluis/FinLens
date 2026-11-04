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
  // The shell's title row. A view may reword it while it renders (shellHero(), the Welcome).
  const pt=$('#pageTitle'); if (pt) pt.textContent=VIEWS[id].title;
  const bar=$('.pagebar'); if (bar) bar.classList.remove('hero');
  // Screens that don't use the date range hide its label: the Plan screens (Budget has its
  // own month), Trends (always the latest six months), Settings and the developer views.
  const rl=$('#rangeLabel'); if (rl) rl.hidden=NO_RANGE_VIEWS.includes(id);
  // body[data-view] lets CSS size the page per screen (Settings is narrower); first-run is
  // set again by the Welcome if it shows.
  document.body.dataset.view=id;
  document.body.classList.remove('first-run');
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

// The Welcome (no data yet) rewords the shell's title as its headline and centers it.
// With firstRun, the app bar shows only the brand, as in the mockup: there is nothing to
// navigate to yet. showView() undoes both before the next render.
function shellHero(title, firstRun) {
  const pt=$('#pageTitle'); if (pt) pt.textContent=title;
  const bar=$('.pagebar'); if (bar) bar.classList.add('hero');
  const rl=$('#rangeLabel'); if (rl) rl.hidden=true;
  document.body.classList.toggle('first-run', !!firstRun);
}

/* ---------- DRAWER ---------- */
// One shared side panel (#txDrawer in index.html) with a title row, a scrolling body and
// an optional footer pinned at the bottom:
//   openDrawer(bodyHtml, { title, footer })
// Older callers (Budget, Bucket, Debt forms) put their own <h3> first in the body: it
// becomes the title. The scrim, × and Escape close it.
// It's a modal dialog (v1.16.14): role="dialog" + aria-modal, named by its title. While it's
// open, the rest of the page is inert (no focus, no clicks, hidden from screen readers), Tab
// and Shift+Tab cycle inside it, and an open app bar menu or popover is closed. It opens
// with focus on its first field (on × when there is none). Closing it returns focus to the
// control that opened it, or to that control's new copy when Save or Delete re-rendered the
// screen. Opening it while it's open swaps the contents and keeps the original opener.
let _drawerReturnFocus=null;   // the element that had focus when the drawer opened
let _drawerReturnKey=null;     // a selector that finds that element again after a re-render
let _drawerInert=[];           // the elements openDrawer() made inert; closeDrawer() undoes only these
function openDrawer(html, opts={}) {
  const dr=$('#txDrawer'), body=$('#drawerBody');
  if (!dr||!body) return;
  const wasOpen=dr.classList.contains('open');
  if (!wasOpen) {
    let from=document.activeElement;
    // Focus inside a menu that's about to close goes back to that menu's button instead.
    if (_appBarOpen && from && _appBarOpen.panel.contains(from)) from=_appBarOpen.btn;
    _drawerReturnFocus=from;
    _drawerReturnKey=_drawerFocusKey(from);
  }
  closeAppBarPopups();
  body.innerHTML=html;
  let title=opts.title;
  const h=body.firstElementChild;
  if (!title && h && h.tagName==='H3') { title=h.textContent; h.remove(); }
  const tt=$('#drawerTitle'); if (tt) tt.textContent=title||'Details';
  const foot=$('#drawerFoot');
  if (foot) { foot.innerHTML=opts.footer||''; foot.hidden=!opts.footer; }
  dr.classList.add('open');
  dr.setAttribute('aria-hidden','false');
  const s=$('#drawerScrim'); if (s) s.hidden=false;
  // Everything outside the drawer and its scrim (the app bar, the page, the footer). The
  // scrim stays live: clicking it closes the drawer.
  if (!wasOpen) {
    _drawerInert=[...document.body.children].filter(el=>el!==dr&&el!==s&&el.tagName!=='SCRIPT'&&!el.inert);
    _drawerInert.forEach(el=>{ el.inert=true; });
  }
  body.scrollTop=0;
  const field=_drawerTabbables(body).find(el=>/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)&&!el.readOnly);
  const target=field||dr.querySelector('.drawer-head .close');
  if (target) target.focus({preventScroll:true});
}
function closeDrawer() {
  const dr=$('#txDrawer'); if (!dr) return;
  const wasOpen=dr.classList.contains('open');
  dr.classList.remove('open');
  dr.setAttribute('aria-hidden','true');
  const s=$('#drawerScrim'); if (s) s.hidden=true;
  // Lift inert first: an inert element can't take focus.
  _drawerInert.forEach(el=>{ el.inert=false; });
  _drawerInert=[];
  const from=_drawerReturnFocus, key=_drawerReturnKey;
  _drawerReturnFocus=null; _drawerReturnKey=null;
  if (!wasOpen) return;
  if (from && from.isConnected) from.focus({preventScroll:true});
  // Save and Delete call renderActive() right after closing, which replaces the opener, and
  // a re-render while the drawer was open already did. Once that's done, focus its new copy,
  // unless focus has gone somewhere else. Focus still in the drawer counts as lost: the
  // drawer stays visible (and its button focused) for the .25s it takes to slide out.
  setTimeout(()=>{
    if (dr.classList.contains('open')) return;
    const a=document.activeElement;
    if (a && a!==document.body && a.isConnected && !dr.contains(a)) return;
    let again=null;
    if (key) try { again=$(key); } catch(e) { /* not a valid selector */ }
    if (again) again.focus({preventScroll:true});
    if (dr.contains(document.activeElement)) document.activeElement.blur();
  },0);
}
// A selector for the opener: its id, or its data-* attributes. Row buttons have no id
// ([data-open="tx…"], [data-bud-open="2"], [data-dt-edit="0"]); their re-rendered copies
// carry the same attributes. An opener with neither (the Transfers row's button) is found
// by its place inside the nearest of its parents that has one (tr[data-out][data-in]).
function _drawerFocusKey(el) {
  const own=n=>{
    if (n.id) return '#'+CSS.escape(n.id);
    const data=[...n.attributes].filter(a=>a.name.startsWith('data-'));
    return data.length ? n.tagName.toLowerCase()+data.map(a=>`[${a.name}="${CSS.escape(a.value)}"]`).join('') : null;
  };
  const path=[];
  for (let n=el; n && n.nodeType===1 && n!==document.body && n!==document.documentElement && path.length<4; n=n.parentElement) {
    const k=own(n);
    if (k) return [k,...path].join(' > ');
    if (!n.parentElement) return null;
    path.unshift(`${n.tagName.toLowerCase()}:nth-child(${[...n.parentElement.children].indexOf(n)+1})`);
  }
  return null;
}
// The controls Tab stops at inside `root`, in page order: visible, enabled, not tabindex -1,
// and one radio per group (the checked one, or the first).
function _drawerTabbables(root) {
  const els=$$('a[href],button,input,select,textarea,summary,[tabindex]',root)
    .filter(el=>el.tabIndex>=0 && !el.disabled && el.type!=='hidden' && el.getClientRects().length>0);
  return els.filter(el=>{
    if (el.type!=='radio' || !el.name) return true;
    const group=els.filter(r=>r.type==='radio' && r.name===el.name);
    return el===(group.find(r=>r.checked)||group[0]);
  });
}
// Tab and Shift+Tab wrap around inside the open drawer. The rest of the page is inert, so
// without this, Tab from the last control would leave the page for the browser's toolbar.
document.addEventListener('keydown', e=>{
  if (e.key!=='Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const dr=$('#txDrawer');
  if (!dr || !dr.classList.contains('open')) return;
  const items=_drawerTabbables(dr);
  if (!items.length) return;
  const first=items[0], last=items[items.length-1], a=document.activeElement;
  if (!dr.contains(a)) { e.preventDefault(); (e.shiftKey?last:first).focus(); }
  else if (e.shiftKey && a===first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a===last) { e.preventDefault(); first.focus(); }
});

/* ---------- THEME ---------- */
// Light only for now (v1.13.0). The dark theme and its Settings choice were taken out and
// will come back later. State.theme is still saved and loaded so its key doesn't change,
// but nothing reads it.
function applyTheme() {
  // Chart.js draws axis labels, legends and grid lines in its own defaults, which don't
  // follow the theme. Use the theme's tokens instead.
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = cssVar('--text-2');
    Chart.defaults.borderColor = cssVar('--chart-grid');
    Chart.defaults.font.family = "'Inter',system-ui,sans-serif";
  }
}

/* ---------- THEME COLORS FOR CHARTS ---------- */
// Chart.js and the inline SVGs can't read CSS variables, so they ask for the current
// value when they draw. Pass alpha (0–1) for a translucent fill.
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
// Screens that ignore the date range: the shell hides its label there (v1.15.0, v1.16.0).
// The developer views (not in the nav: showView() from DevTools) show stored records, the
// changelog or the eval's samples, never the range (v1.16.27).
const NO_RANGE_VIEWS = [...PLAN_VIEWS, 'trends', 'settings', 'db-inspector', 'db-schema', 'changelog', 'ai-eval', 'db-logs'];
let _appBarOpen = null;   // { btn, panel } of the menu or popover that's open

function openAppBarPopup(btn, panel) {
  closeAppBarPopups();
  panel.hidden = false;
  btn.setAttribute('aria-expanded','true');
  btn.classList.add('open');
  if (panel.id === 'mobileMenu') { const s=$('#menuScrim'); if (s) s.hidden=false; btn.setAttribute('aria-label','Close menu'); }
  _appBarOpen = { btn, panel };
}
function closeAppBarPopups(focusBtn) {
  if (!_appBarOpen) return;
  const { btn, panel } = _appBarOpen;
  panel.hidden = true;
  btn.setAttribute('aria-expanded','false');
  btn.classList.remove('open');
  const s=$('#menuScrim'); if (s) s.hidden=true;
  if (panel.id === 'mobileMenu') btn.setAttribute('aria-label','Open menu');
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
    .map(a => acctName(a.id)).join(', ');
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
if (typeof Chart !== 'undefined' && !Chart._appChartGuard) {
  const ChartJS = Chart;
  Chart = class extends ChartJS {
    constructor(item, config) {
      for (const c of Object.values(ChartJS.instances)) if (!c.canvas || !c.canvas.isConnected) c.destroy();
      const existing = ChartJS.getChart(item);
      if (existing) existing.destroy();
      super(item, config);
    }
  };
  Chart._appChartGuard = true;
}

/* ---------- CHART PALETTE ---------- */
// Mid-tone hues that read on the light surfaces, indigo first.
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
// Display name of an account: the name you typed (State.accountLabels), else its default
// name (defaultAccountName() in core.js). The default is worked out rather than read from
// account.name: older versions copied the typed name in there, so data they saved can
// still hold a name you've since cleared.
function acctName(id) {
  if (!id) return 'Outside FinLens';
  const a=State.accounts[id];
  return State.accountLabels?.[id]||defaultAccountName(a)||a?.name||id;
}

/* ---------- INLINE SVG CHARTS (v1.14.0) ---------- */
// The Overview, Spending and account cards draw small line charts as inline SVG. Their
// colors come from CSS classes in index.html (.lc-*, .spark, .hue-*), which read the
// theme tokens directly, without chartColor().
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
// Re-categorize all (Spending → Category rules): every loaded transaction gets the category the
// rules give it now (categoryFromRules(), core.js), and the result is saved (v1.16.25). Up to
// v1.16.24 it changed the categories in memory only: nothing saved them, so a reload from
// browser storage brought the imported ones back, and app-state.json kept them only if
// another change happened to save it afterwards.
// - Saved in State.ruleCategories, by transaction id, where it differs from the import's
//   category or from its IndexedDB row's (lsSet: localStorage, IndexedDB app_state, then the
//   debounced state-file save). The two can differ: a re-import re-reads a checking row with
//   the current rules, but the store keeps the row from its first import. mkTx() and
//   reconstituteTx() apply it, so it holds after a reload from IndexedDB or the state file,
//   and after a re-import. Ids not loaded keep their entry, as edits do.
// - Shown on every transaction except one with a category edit (the edit wins) and a detected
//   transfer (it keeps Transfer in / Transfer out). Under those it's still saved, and shows
//   once the edit is cleared or the transaction stops being a transfer.
// - The import's category is _originalCategories; a transaction from a app-state.json
//   written before v1.16.1 doesn't record it: then its IndexedDB row's, else the category it
//   shows, if nothing but the import can have set it (no edit, not a transfer, not re-categorized).
async function recategorizeAll() {
  const has=(c)=>Array.isArray(c)&&c.length>0;
  const prev=State.ruleCategories||{};
  // The stored rows: what a reload from IndexedDB starts from. A row only fills in a value
  // the transaction doesn't record (CLAUDE.md §4.5); the store can be empty or partial.
  const rows=typeof DB!=='undefined'&&DB._db
    ? new Map((await DB._getAllTransactions()).map(r=>[r.id,r])) : new Map();
  const loaded=new Set(State.transactions.map(t=>t.id));
  const next=Object.fromEntries(Object.entries(prev).filter(([id])=>!loaded.has(id)));
  for (const t of State.transactions) {
    const ov=State.txOverrides[t.id]||{};
    const edited=!!((ov.categories&&ov.categories.length)||ov.category);
    const detected=t.type==='transfer'&&ov.type!=='transfer';
    const row=rows.get(t.id);
    const rowCat=row&&has(row.categories) ? row.categories[0] : null;
    const importCat=has(t._originalCategories) ? t._originalCategories[0]
      : rowCat!==null ? rowCat
      : (!edited&&t.type!=='transfer'&&!(t.id in prev)) ? t.category : null;
    const cat=categoryFromRules(t,importCat);
    if (cat!==importCat||(rowCat!==null&&cat!==rowCat)) next[t.id]=cat;
    if (!edited&&!detected) t.categories=[cat];
  }
  State.ruleCategories=next;
  lsSet('ruleCategories',next);
  renderActive();
}

/* ---------- PLAN FORMS: shared bits (v1.15.0) ---------- */
// A drawer's Delete button: the first click arms it, the second runs `fn` (no confirm()).
function _armTwoClick(btn, fn) {
  if (!btn) return;
  btn.onclick=()=>{
    if (btn.dataset.armed!=='1') { btn.dataset.armed='1'; btn.textContent='Click again to delete'; return; }
    closeDrawer(); fn();
  };
}
// Show a form error in the drawer and mark the field.
function _formError(msg, el) {
  const err=$('#planFormErr');
  if (err) { err.textContent=msg; err.hidden=false; }
  if (el) { el.setAttribute('aria-invalid','true'); el.focus(); }
}
const _drawerFooter=(isEdit, saveId, saveLabel, delId)=>
  `${isEdit?`<button type="button" class="btn ghost danger-text" id="${delId}">Delete</button>`:''}<span class="grow"></span><button type="button" class="btn ghost" onclick="closeDrawer()">Cancel</button><button type="button" class="btn" id="${saveId}">${saveLabel}</button>`;

/* ---------- PLAN LINKS: transactions → budgets, buckets, debts (v1.16.7) ---------- */
// A transaction's link is State.txOverrides[txId].link = { type: 'budget'|'bucket'|'debt', id },
// the id of an item in State.budgets / buckets / debts (PLAN_LINK_TYPES, newPlanId() in core.js).
// Every item gets its id when it's created and keeps it when edited, so deleting one never
// moves another's links. Deleting one, or clearing its list, removes the links to it.
// The item a link points at, or null (no such type or id).
function planItem(type, id) {
  const t=PLAN_LINK_TYPES[type];
  if (!t||typeof id!=='string'||!id) return null;
  return (State[t[0]]||[]).find(x=>x&&x.id===id)||null;
}
// Transactions linked to item `id` of `type`, newest first.
function linkedTransactions(type, id) {
  if (!id) return [];
  return State.transactions.filter(t=>{ const l=(State.txOverrides[t.id]||{}).link; return !!l&&l.type===type&&l.id===id; }).sort((x,y)=>y.date-x.date);
}
// Removes the links to items of `type` whose id is `ids` (an id or a list of ids), or to
// every item of `type` when `ids` is 'all' (Data & reset → Clear budgets / buckets / debts).
// A missing id removes nothing. An edit left with nothing else in it goes too.
// Saves txOverrides if anything changed; returns the count.
function unlinkPlanItems(type, ids) {
  const only=ids==='all'?null:new Set([].concat(ids).filter(Boolean));
  if (only&&!only.size) return 0;
  const ovs=State.txOverrides||{};
  let n=0;
  for (const [txId,ov] of Object.entries(ovs)) {
    const l=ov&&ov.link;
    if (!l||l.type!==type||(only&&!only.has(l.id))) continue;
    delete ov.link; n++;
    if (!Object.keys(ov).length) delete ovs[txId];
  }
  if (n) lsSet('txOverrides',ovs);
  return n;
}
// Items without an id (put in by hand, or by an older version in another tab) get one
// before a transaction can be linked to them. Boot gives every stored item one (migrate.js).
function ensurePlanIds() {
  for (const [type,[key]] of Object.entries(PLAN_LINK_TYPES)) {
    const list=State[key]||[];
    let n=0;
    list.forEach(x=>{ if (x&&typeof x==='object'&&!x.id) { x.id=newPlanId(type,list); n++; } });
    if (n) lsSet(key,list);
  }
}

/* ---------- BUDGET HELPERS ---------- */
// State.budgets entries: { id, name, limit, categories:[…] }. Budgets saved before v1.15.0 may
// also carry a hex `color`; it's kept but no longer shown (rows are colored by status).
// id (v1.16.7): 'bud_…', given when the budget is created; transaction links point at it.
// The suggested set is the starter budget when there's no spending to build one from.
const SUGGESTED_BUDGETS=[
  {name:'Food & Dining',limit:600,categories:['Food & Dining','Groceries']},
  {name:'Housing',limit:1500,categories:['Housing']},
  {name:'Transport',limit:300,categories:['Transport']},
  {name:'Entertainment',limit:150,categories:['Entertainment']},
  {name:'Health',limit:150,categories:['Health']},
  {name:'Shopping',limit:250,categories:['Shopping']},
  {name:'Bills & Utilities',limit:300,categories:['Bills & Utilities']},
  {name:'Subscriptions',limit:80,categories:['Subscriptions']},
];
// "Use starter budget": one row per category you spend on (starterBudgetList() in
// aggregation.js), or the suggested set without any spending. Only categories no budget
// covers yet are added, so it never replaces or changes a budget you already have.
function starterBudgetsToAdd() {
  const have=new Set((State.budgets||[]).flatMap(b=>b.categories||[]));
  let src=starterBudgetList();
  if (!src.length) src=JSON.parse(JSON.stringify(SUGGESTED_BUDGETS));
  return src.filter(b=>!b.categories.some(c=>have.has(c)));
}
function seedBudgets() {
  const add=starterBudgetsToAdd();
  if (add.length) { add.forEach(b=>State.budgets.push({ ...b, id:newPlanId('budget',State.budgets) })); lsSet('budgets',State.budgets); }
  renderActive();
  return add.length;
}
function addBudget(){ editBudget(-1); }
// Categories a budget can count: those you spend on (biggest first), then the rest of your
// category list, then any the budget already has.
function budgetCategoryChoices(b) {
  const spent=byCategory(State.transactions,'expense').map(c=>c.category);
  const listed=(State.categories||[]).filter(c=>!['Income','Transfer'].includes(c));
  return [...new Set([...spent, ...listed, ...(b.categories||[])])];
}
// Edit budget i in the drawer, or add one (i < 0).
function editBudget(i) {
  const b=i>=0?State.budgets[i]:{name:'',limit:'',categories:[]};
  const cats=budgetCategoryChoices(b);
  openDrawer(`<div class="dform">
    <label class="field">Name<input class="input" id="bnName" value="${escapeHtml(b.name||'')}" placeholder="e.g. Groceries" autocomplete="off"></label>
    <label class="field">Monthly budget ($)<input class="input" id="bnLimit" type="number" min="0" step="10" inputmode="decimal" value="${b.limit===''?'':escapeHtml(String(Number(b.limit)||0))}"></label>
    <fieldset class="flag-set" id="bnCats"><legend>Counts spending in</legend>
      ${cats.map(c=>`<label class="check-chip"><input type="checkbox" value="${escapeHtml(c)}" ${(b.categories||[]).includes(c)?'checked':''}>${escapeHtml(c)}</label>`).join('')}
    </fieldset>
    <p class="drawer-note">Every charge in these categories counts in full. Pick one category for a budget per category.</p>
    <p class="form-err" id="planFormErr" role="alert" hidden></p></div>`,
    { title:i>=0?'Edit budget':'Add budget category', footer:_drawerFooter(i>=0,'bnSave','Save budget','bnDelete') });
  // The name follows the first category picked while it's still empty.
  $$('#bnCats input').forEach(cb=>cb.addEventListener('change',()=>{ const n=$('#bnName'); if (cb.checked&&!n.value.trim()) n.value=cb.value; }));
  $('#bnSave').onclick=()=>saveBudget(i);
  _armTwoClick($('#bnDelete'),()=>deleteBudget(i));
}
function saveBudget(i) {
  const name=$('#bnName').value.trim();
  const categories=$$('#bnCats input:checked').map(c=>c.value);
  if (!name) return _formError('Give the budget a name.', $('#bnName'));
  if (!categories.length) return _formError('Pick at least one category.', $('#bnCats input'));
  const prev=i>=0?State.budgets[i]:{};
  const obj={ ...prev, name, limit:Math.max(0,parseFloat($('#bnLimit').value)||0), categories };
  obj.id=prev.id||newPlanId('budget',State.budgets);   // kept when edited
  if (i>=0) State.budgets[i]=obj; else State.budgets.push(obj);
  lsSet('budgets',State.budgets);
  closeDrawer(); renderActive();
}
// The Budget screen's inline edit: just the monthly amount.
function setBudgetLimit(i, v) {
  const b=State.budgets[i]; if (!b) return;
  b.limit=Math.max(0,parseFloat(v)||0);
  lsSet('budgets',State.budgets);
}
// No confirm() here: the edit drawer's Delete button asks for a second click.
// Links to the deleted budget go; links to the others point at them by id, so they stay.
function deleteBudget(i){ const [b]=State.budgets.splice(i,1); lsSet('budgets',State.budgets); if (b) unlinkPlanItems('budget',b.id); renderActive(); }

/* ---------- SAVINGS BUCKET HELPERS ---------- */
// State.buckets entries: { id, name, goal, current, targetDate:'YYYY-MM-DD'|'', icon, hue }.
//   id (v1.16.7): 'bkt_…', given when the bucket is created; transaction links point at it.
//   icon: a BUCKET_ICONS key, hue: one of BUCKET_HUES (v1.15.0). Buckets saved before have an
//   emoji icon and a hex color: until edited they show an icon guessed from the name and a
//   hue by position (the old values stay in the record).
const BUCKET_ICONS={
  shield:'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  plane:'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  laptop:'M4 5h16v11H4zM2 20h20',
  wrench:'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z',
  home:'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  gift:'M4 11h16v10H4zM2 7h20v4H2zM12 7v14M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1',
  heart:'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  book:'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z',
  star:'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
};
const BUCKET_ICON_NAMES={shield:'Shield',plane:'Plane',laptop:'Laptop',wrench:'Wrench',home:'House',gift:'Gift',heart:'Heart',book:'Book',star:'Star'};
const BUCKET_HUES=['accent','pink','sky','card','good','violet','teal','warn'];
const BUCKET_HUE_NAMES={accent:'Indigo',pink:'Pink',sky:'Blue',card:'Orange',good:'Green',violet:'Violet',teal:'Teal',warn:'Amber'};
function guessBucketIcon(name) {
  const n=(name||'').toLowerCase();
  if (/emergenc|rainy|safety|cushion/.test(n)) return 'shield';
  if (/trip|travel|vacation|holiday|flight/.test(n)) return 'plane';
  if (/laptop|computer|phone|tech|tablet/.test(n)) return 'laptop';
  if (/car|auto|repair|mainten/.test(n)) return 'wrench';
  if (/home|house|down payment|apartment|moving/.test(n)) return 'home';
  if (/gift|christmas|birthday|present/.test(n)) return 'gift';
  if (/wedding|health|medical|baby|dental/.test(n)) return 'heart';
  if (/school|tuition|college|course|book|education/.test(n)) return 'book';
  return 'star';
}
function bucketIconKey(b) { return BUCKET_ICONS[b.icon]?b.icon:guessBucketIcon(b.name); }
function bucketHue(b, i) { return BUCKET_HUES.includes(b.hue)?b.hue:BUCKET_HUES[i%BUCKET_HUES.length]; }
function bucketIconSvg(key, size=20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${BUCKET_ICONS[key]||BUCKET_ICONS.star}"/></svg>`;
}
function addBucket(b) { if (!b.id) b.id=newPlanId('bucket',State.buckets); State.buckets.push(b); lsSet('buckets',State.buckets); }
// Edit bucket i in the drawer, or add one (i < 0).
function editBucket(i) {
  const b=i>=0?State.buckets[i]:{name:'',goal:'',current:0,targetDate:''};
  const icon=i>=0?bucketIconKey(b):'star', hue=i>=0?bucketHue(b,i):BUCKET_HUES[State.buckets.length%BUCKET_HUES.length];
  const linked=i<0?[]:linkedTransactions('bucket',b.id);
  openDrawer(`<div class="dform">
    <label class="field">Name<input class="input" id="bkName" value="${escapeHtml(b.name||'')}" placeholder="e.g. Holiday gifts" autocomplete="off"></label>
    <div class="field-row">
      <label class="field">Target ($)<input class="input" id="bkGoal" type="number" min="0" step="50" inputmode="decimal" value="${b.goal===''?'':escapeHtml(String(Number(b.goal)||0))}"></label>
      <label class="field">Saved so far ($)<input class="input" id="bkCur" type="number" min="0" step="50" inputmode="decimal" value="${escapeHtml(String(Number(b.current)||0))}"></label>
    </div>
    <label class="field">Target date<input class="input" id="bkDate" type="date" value="${escapeHtml(b.targetDate||'')}"></label>
    <fieldset class="choice-set"><legend>Icon</legend>
      ${Object.keys(BUCKET_ICONS).map(k=>`<label class="choice" title="${BUCKET_ICON_NAMES[k]}"><input type="radio" name="bkIcon" value="${k}" aria-label="${BUCKET_ICON_NAMES[k]}" ${k===icon?'checked':''}>${bucketIconSvg(k,18)}</label>`).join('')}
    </fieldset>
    <fieldset class="choice-set"><legend>Color</legend>
      ${BUCKET_HUES.map(h=>`<label class="choice hue-${h}" title="${BUCKET_HUE_NAMES[h]}"><input type="radio" name="bkHue" value="${h}" aria-label="${BUCKET_HUE_NAMES[h]}" ${h===hue?'checked':''}><span class="sw" aria-hidden="true"></span></label>`).join('')}
    </fieldset>
    ${i>=0?`<div class="linked"><h3>Linked transactions <span>· ${linked.length}</span></h3>
      ${linked.length?`<div class="rows">${linked.slice(0,20).map(t=>`<div class="r"><span class="d">${dayjs(t.date).format('MMM D')}</span><span class="t">${escapeHtml(t.description)}</span><span class="amt">${fmtSigned(t.amount)}</span></div>`).join('')}</div>`
        :`<p class="drawer-note">None yet. Open a transaction and use <strong>Link to → Bucket</strong>.</p>`}</div>`:''}
    <p class="form-err" id="planFormErr" role="alert" hidden></p></div>`,
    { title:i>=0?'Edit bucket':'New bucket', footer:_drawerFooter(i>=0,'bkSave','Save bucket','bkDelete') });
  $('#bkSave').onclick=()=>saveBucket(i);
  _armTwoClick($('#bkDelete'),()=>deleteBucket(i));
}
function saveBucket(i) {
  const name=$('#bkName').value.trim();
  if (!name) return _formError('Give the bucket a name.', $('#bkName'));
  const prev=i>=0?State.buckets[i]:{};
  const obj={ ...prev, name,
    goal:Math.max(0,parseFloat($('#bkGoal').value)||0),
    current:Math.max(0,parseFloat($('#bkCur').value)||0),
    targetDate:$('#bkDate').value||'',
    icon:($('input[name="bkIcon"]:checked')||{}).value||guessBucketIcon(name),
    hue:($('input[name="bkHue"]:checked')||{}).value||BUCKET_HUES[0] };
  obj.id=prev.id||newPlanId('bucket',State.buckets);   // kept when edited
  if (i>=0) State.buckets[i]=obj; else State.buckets.push(obj);
  lsSet('buckets',State.buckets);
  closeDrawer(); renderActive();
}
// No confirm() here: the edit drawer's Delete button asks for a second click.
// Links to the deleted bucket go; links to the others point at them by id, so they stay.
function deleteBucket(i){ const [b]=State.buckets.splice(i,1); lsSet('buckets',State.buckets); if (b) unlinkPlanItems('bucket',b.id); renderActive(); }

/* ---------- DEBT HELPERS ---------- */
// State.debts entries: { id, name, type, balance, apr, minPayment, limit, dueDay, account? }.
//   id (v1.16.7): 'dbt_…', given when the debt is created; transaction links point at it.
//   account (v1.15.0): a credit card account from your CSVs. The balance and credit limit
//   then come from that account (debtBalance(), debtLimit() in aggregation.js); `balance`
//   keeps the value it had when last saved, used if the account is gone.
const DEBT_TYPES=['Credit Card','Personal Loan','Student Loan','Auto Loan','Mortgage','Other'];
const DEBT_TYPE_LABEL={'Credit Card':'Credit card','Personal Loan':'Personal loan','Student Loan':'Student loan','Auto Loan':'Auto loan','Mortgage':'Mortgage','Other':'Other'};
// Card accounts a debt can take its balance from: those no other debt uses yet.
function debtCardChoices(current) {
  const used=new Set((State.debts||[]).map(d=>d.account).filter(Boolean));
  return orderedAccounts().filter(a=>a.kind==='credit_card'&&(a.id===current||!used.has(a.id)));
}
// Edit debt i in the drawer, or add one (i < 0); `account` links a new one to a card.
function editDebt(i, account) {
  // A new debt started from a card takes the APR and due day entered in Settings → Credit cards.
  const cd=(account&&State.cardDetails&&State.cardDetails[account])||{};
  const d=i>=0?State.debts[i]:{name:account?acctName(account):'',type:'Credit Card',balance:'',apr:cd.apr??'',minPayment:'',limit:'',dueDay:cd.dueDay??'',account:account||''};
  const acct=debtLinked(d)?d.account:'';
  const cards=debtCardChoices(acct);
  const limit=acct?(State.manualBalances[acct+'_limit']??''):(d.limit||'');
  const num=v=>v===''||v==null?'':escapeHtml(String(Number(v)||0));
  openDrawer(`<div class="dform">
    ${cards.length?`<label class="field">Balance from<select class="select" id="dtAcct"><option value="">I'll enter it</option>${cards.map(a=>`<option value="${escapeHtml(a.id)}" ${a.id===acct?'selected':''}>${escapeHtml(acctName(a.id))} (your CSV)</option>`).join('')}</select></label>`:''}
    <label class="field">Name<input class="input" id="dtName" value="${escapeHtml(d.name||'')}" placeholder="e.g. Auto loan" autocomplete="off"></label>
    <div class="field-row">
      <label class="field">Type<select class="select" id="dtType">${DEBT_TYPES.map(t=>`<option value="${t}" ${t===d.type?'selected':''}>${DEBT_TYPE_LABEL[t]}</option>`).join('')}</select></label>
      <label class="field">Balance ($)<input class="input" id="dtBal" type="number" min="0" step="0.01" inputmode="decimal" value="${acct?escapeHtml(debtBalance(d).toFixed(2)):num(d.balance)}" ${acct?'readonly aria-describedby="dtBalNote"':''}></label>
    </div>
    <p class="drawer-note" id="dtBalNote" ${acct?'':'hidden'}>The balance comes from the card's transactions (or the balance you set in Settings → Credit cards) and updates when you import.</p>
    <div class="field-row">
      <label class="field">APR (%)<input class="input" id="dtApr" type="number" min="0" step="0.01" inputmode="decimal" value="${num(d.apr)}"></label>
      <label class="field">Minimum payment ($)<input class="input" id="dtMin" type="number" min="0" step="1" inputmode="decimal" value="${num(d.minPayment)}"></label>
    </div>
    <div class="field-row">
      <label class="field">Credit limit ($)<input class="input" id="dtLim" type="number" min="0" step="100" inputmode="decimal" value="${num(limit)}" placeholder="Cards only"></label>
      <label class="field">Due day<input class="input" id="dtDue" type="number" min="1" max="31" value="${d.dueDay?escapeHtml(String(d.dueDay)):''}" placeholder="1–31"></label>
    </div>
    <p class="form-err" id="planFormErr" role="alert" hidden></p></div>`,
    { title:i>=0?'Edit debt':'Add debt', footer:_drawerFooter(i>=0,'dtSave','Save debt','dtDelete') });
  const sel=$('#dtAcct');
  if (sel) sel.onchange=()=>{
    const id=sel.value, bal=$('#dtBal'), name=$('#dtName');
    bal.readOnly=!!id;
    if (id) bal.setAttribute('aria-describedby','dtBalNote'); else bal.removeAttribute('aria-describedby');
    $('#dtBalNote').hidden=!id;
    if (id) {
      bal.value=debtBalance({account:id}).toFixed(2);
      $('#dtType').value='Credit Card';
      if (!name.value.trim()||cards.some(a=>acctName(a.id)===name.value)) name.value=acctName(id);
      const l=State.manualBalances[id+'_limit']; $('#dtLim').value=l==null||l===''?'':l;
      const c=(State.cardDetails||{})[id]||{};
      if (!$('#dtApr').value&&c.apr!=null) $('#dtApr').value=c.apr;
      if (!$('#dtDue').value&&c.dueDay!=null) $('#dtDue').value=c.dueDay;
    }
  };
  $('#dtSave').onclick=()=>saveDebt(i);
  _armTwoClick($('#dtDelete'),()=>deleteDebt(i));
}
function saveDebt(i) {
  const name=$('#dtName').value.trim();
  if (!name) return _formError('Give the debt a name.', $('#dtName'));
  const account=$('#dtAcct')?$('#dtAcct').value:'';
  const prev=i>=0?State.debts[i]:{};
  const limRaw=$('#dtLim').value.trim();
  const obj={ ...prev, name, type:$('#dtType').value,
    apr:Math.max(0,parseFloat($('#dtApr').value)||0),
    minPayment:Math.max(0,parseFloat($('#dtMin').value)||0),
    dueDay:Math.min(31,Math.max(1,parseInt($('#dtDue').value,10)||1)) };
  if (account) {
    obj.account=account;
    obj.balance=Math.round(debtBalance({account})*100)/100;
    // A linked card's limit is the account's credit limit, shared with the Overview and Settings.
    State.manualBalances[account+'_limit']=limRaw===''?'':Math.max(0,parseFloat(limRaw)||0);
    lsSet('manualBalances',State.manualBalances);
  } else {
    delete obj.account;
    obj.balance=Math.max(0,parseFloat($('#dtBal').value)||0);
    obj.limit=Math.max(0,parseFloat(limRaw)||0);
  }
  obj.id=prev.id||newPlanId('debt',State.debts);   // kept when edited (also a new debt started from a card)
  if (i>=0) State.debts[i]=obj; else State.debts.push(obj);
  lsSet('debts',State.debts);
  closeDrawer(); renderActive();
}
// No confirm() here: the edit drawer's Delete button asks for a second click.
// Links to the deleted debt go; links to the others point at them by id, so they stay.
function deleteDebt(i){ const [d]=State.debts.splice(i,1); lsSet('debts',State.debts); if (d) unlinkPlanItems('debt',d.id); renderActive(); }

// Older payoff simulation (before v1.15.0), kept unchanged for compatibility: pays every
// minimum, then `extra` goes to the first debt in the given order that still has a
// balance. A paid-off debt's minimum is not moved on. The Debt screen uses payoffPlan().
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
// The Debt screen's payoff plan (State.debtPlan, saved): strategy and extra per month.
function setPayoffStrategy(s) {
  State.debtPlan={ ...(State.debtPlan||{}), strategy:['avalanche','snowball','minimum'].includes(s)?s:'avalanche' };
  lsSet('debtPlan',State.debtPlan);
}
function setPayoffExtra(v) {
  State.debtPlan={ ...(State.debtPlan||{}), extra:Math.max(0,Math.round(parseFloat(v)||0)) };
  lsSet('debtPlan',State.debtPlan);
}

/* ---------- EXPORT / IMPORT ---------- */
// What a JSON export holds (Settings → Data & reset): everything you entered or chose, as
// State key → the kind of value it holds. The import reads the same list.
// Left out on purpose: transactions and accounts (your CSVs bring them back), the API key
// (never written anywhere, CLAUDE.md §15), this browser's own state (sampleData,
// csvAutoImportPaused, lastFolderName), the session (date range, accounts filter, current
// screen), customSchemas (nothing in the app creates one) and ruleCategories (worked out from
// the category rules, which are in it: Re-categorize all after importing gives them again).
// Version 1.2 (v1.16.6) added accountLabels … theme; 1.1 had the keys above them.
const JSON_EXPORT_VERSION='1.2';
const JSON_EXPORT_KEYS={
  budgets:'list', buckets:'list', debts:'list', bills:'list',
  txOverrides:'map', manualBalances:'map', categoryRules:'list', categories:'list',
  aiHistory:'list', scenarios:'list', recurringConfirmed:'map', investAlloc:'map',
  debtPlan:'map', cardDetails:'map',
  accountLabels:'map', accountOrder:'list', fileAssignments:'map',
  txRules:'list', transferKeywords:'list', theme:'theme',
};
const _JSON_KIND={
  list:(v)=>Array.isArray(v),
  map:(v)=>!!v&&typeof v==='object'&&!Array.isArray(v),
  theme:(v)=>['light','dark','system'].includes(v),   // kept for the round trip; nothing reads it (light only for now)
};
function exportAllData() {
  const data={ version:JSON_EXPORT_VERSION, exportedAt:new Date().toISOString() };
  for (const k of Object.keys(JSON_EXPORT_KEYS)) data[k]=State[k];
  downloadFile(`app-export-${dayjs().format('YYYYMMDD')}.json`, JSON.stringify(data,null,2),'application/json');
}
// Reads any export version (1.0, 1.1, 1.2): a key the file doesn't have, has as null, or
// holds the wrong kind of value keeps its current value. Each key is saved under its
// storage key (storageKey(), core.js): up to v1.16.3 they were saved under their State
// names, so the spotted-charge choices ('recurring') and category rules ('catRules') were
// lost on the next reload.
function importJsonFile(ev) {
  const file=ev.target.files[0]; if (!file) return;
  const reader=new FileReader();
  reader.onload=async e=>{
    try {
      const d=JSON.parse(e.target.result);
      if (!_JSON_KIND.map(d)) throw new Error('this file is not a FinLens export.');
      // Exports from before v1.12.0 use the old account codes (migrate.js)
      IdMigration.migrateState(d);
      const before={ ...(State.txOverrides||{}) };   // the edits the loaded transactions show now
      const changed=new Set();
      for (const [k,kind] of Object.entries(JSON_EXPORT_KEYS)) {
        if (!_JSON_KIND[kind](d[k])) continue;
        if (JSON.stringify(d[k])!==JSON.stringify(State[k])) changed.add(k);
        State[k]=d[k]; lsSet(storageKey(k),d[k]);
      }
      if (IdMigration.adoptOverrides(State.transactions).size) { lsSet('txOverrides',State.txOverrides); changed.add('txOverrides'); }
      await _applyImportedSettings(changed, before);
      alert('Imported successfully.'); renderActive();
    } catch(err){ alert('Import failed: '+err.message); }
  };
  reader.readAsText(file);
}
// Imported settings take effect now, without a reload. Most keys only need the render
// that follows. Category rules apply to the next import (or Re-categorize all) and "Read
// as" choices to the next CSV read. Transaction edits rebuild the loaded transactions
// (applyImportedEdits(), v1.16.18): that also applies the flag rules and transfer keywords
// now in State, so those two steps are only needed on their own without new edits.
// Imported account names need no copying: acctName() reads State.accountLabels, and an
// account's own name stays its default (v1.16.12). `before`: txOverrides before the import.
async function _applyImportedSettings(changed, before) {
  if (changed.has('accountLabels')||changed.has('accountOrder')) buildAccountFilter();
  if (changed.has('txOverrides')) await applyImportedEdits(before||{});
  else {
    if (changed.has('txRules')) applyTxRulesToAll();
    if (changed.has('transferKeywords')) reapplyTransferKeywords();   // views-main.js; re-runs transfer detection
  }
}
// The loaded transactions with the edits a JSON import brought (v1.16.18). Each one is rebuilt
// from its CSV values (DataCleanup._unedited(), as Clear transaction edits does), with its edit
// now in State.txOverrides on top (reconstituteTx()); then transfers are detected again. That
// is what an import of the CSVs makes with these edits (mkTx(), detectTransfers()):
// description, categories, type, notes and flags from the edit, the flags it doesn't set from
// the transaction rules (txFlags()), and a transaction the file has no edit for back to its
// CSV values. Plan links need nothing: they're read from State.txOverrides.
// `before` is txOverrides as it was: _unedited() reads it for a transaction from a ≤v1.16.0
// state file, which doesn't record its CSV category and type (its IndexedDB row gives them,
// when this browser has one).
// Up to v1.16.17 the import only saved the edits: every screen kept the old descriptions,
// categories, types, flags and notes until a reload, and a reload from app-state.json
// kept an old edit's category and type where the file had no edit.
async function applyImportedEdits(before) {
  const known=(t)=>t._originalType&&Array.isArray(t._originalCategories)&&t._originalCategories.length;
  let rows=new Map();
  if (State.transactions.some(t=>!known(t))&&typeof DB!=='undefined'&&DB._db) {
    rows=new Map((await DB._getAllTransactions()).map(r=>[r.id,r]));
  }
  State.transactions=State.transactions.map(t=>{
    const base=DataCleanup._unedited(t,before[t.id],rows.get(t.id));
    const ov=State.txOverrides[t.id];
    return ov?reconstituteTx({ ...base, description:base._originalDesc },ov):base;
  });
  detectTransfers();
}
// Erase everything and reload. Clearing only localStorage (as ≤v1.8.1 did) was undone on
// reload by IndexedDB and app-state.json, so this delegates to the full reset in
// views-cleanup.js. Call it from a click handler (it may need folder write access).
function clearAllData() {
  return DataCleanup.startOver('archive');
}
