/* ================================================================
   FINLENS — ui.js
   View registry, drawer, chart helpers, rendering utilities
================================================================ */

/* ---------- VIEWS ---------- */
const VIEWS = {};
function registerView(id, title, render) { VIEWS[id]={title,render}; }

function showView(id) {
  if (!VIEWS[id]) id='overview';
  // Moving to another screen closes any open menu. Re-rendering the same screen (a filter
  // change from the Accounts popover) leaves it open, so several boxes can be toggled.
  if (id!==State.currentView) closeAppBarPopups();
  // App bar + menus: mark the current page. The Plan button stands for its five screens.
  $$('.mainnav [data-view], .menu [data-view], .mobile-menu [data-view], .appbar .gear').forEach(a=>{
    const on=a.dataset.view===id;
    a.classList.toggle('active',on);
    if (on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
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
function openDrawer(html) {
  $('#drawerBody').innerHTML=html;
  $('#txDrawer').classList.add('open');
}
function closeDrawer() { $('#txDrawer').classList.remove('open'); }

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

/* ---------- SPARKLINE ---------- */
function drawSpark(id, accountId, opts={}) {
  const ctx=document.getElementById(id);
  if (!ctx) return;
  const txs=State.transactions.filter(t=>t.account===accountId).sort((a,b)=>a.date-b.date);
  if (!txs.length) return;
  const balances=currentBalances();
  let bal=balances[accountId]||0;
  const series=[];
  for (let i=txs.length-1;i>=0;i--){ series.unshift(bal); bal-=txs[i].amount; }
  series.unshift(bal);
  const last30=series.slice(-30);
  const lineColor=opts.color||chartColor('--chart-in');
  const fillColor=opts.bg||chartColor('--chart-in',.15);
  new Chart(ctx,{
    type:'line',
    data:{labels:last30.map((_,i)=>i),datasets:[{data:last30,borderColor:lineColor,backgroundColor:fillColor,fill:true,tension:.4,pointRadius:0,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}}}
  });
}

/* ---------- HEATMAP ---------- */
function renderHeatmap(holder, txs) {
  const map={};
  txs.forEach(t=>{ const k=dayjs(t.date).format('YYYY-MM-DD'); map[k]=(map[k]||0)+Math.abs(t.amount); });
  const today=new Date();
  const start=new Date(today); start.setDate(start.getDate()-365);
  while (start.getDay()!==0) start.setDate(start.getDate()-1);
  const days=[];
  for (let d=new Date(start);d<=today;d.setDate(d.getDate()+1)) {
    const k=dayjs(d).format('YYYY-MM-DD');
    days.push({date:new Date(d),amount:map[k]||0});
  }
  const max=Math.max(...days.map(d=>d.amount),1);
  const cols=Math.ceil(days.length/7);
  const html=[`<div class="heat" style="grid-template-columns:repeat(${cols},1fr)">`];
  for (let col=0;col<cols;col++) {
    for (let row=0;row<7;row++) {
      const idx=col*7+row;
      const d=days[idx];
      if (!d){ html.push('<div></div>'); continue; }
      const r=d.amount/max;
      let cls='cell';
      if (d.amount>0){
        if (r<0.2) cls+=' l1'; else if(r<0.4) cls+=' l2'; else if(r<0.6) cls+=' l3'; else if(r<0.8) cls+=' l4'; else cls+=' l5';
      }
      html.push(`<div class="${cls}" title="${dayjs(d.date).format('MMM D, YYYY')}: ${fmt(d.amount)}"></div>`);
    }
  }
  html.push('</div>');
  holder.innerHTML=html.join('');
}

/* ---------- TRANSFER FLOW SVG ---------- */
function renderTransferFlow(holder, paths) {
  const accts=Object.values(State.accounts);
  if (!accts.length){ holder.innerHTML='<span class="muted">No accounts loaded.</span>'; return; }
  const w=520, h=Math.max(180,accts.length*60+40);
  const neutral=chartColor('--chart-neutral');
  const colors={bank_checking:chartColor('--chart-in'),bank_savings:chartColor('--chart-save'),credit_card:chartColor('--chart-card'),unknown:neutral};
  const yFor=i=>30+i*60;
  let svg=`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`;
  svg+=`<defs><marker id="arr" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${neutral}"/></marker></defs>`;
  accts.forEach((a,i)=>{
    const c=colors[a.kind]||neutral;
    svg+=`<rect x="20" y="${yFor(i)-18}" width="160" height="36" rx="10" fill="${c}22" stroke="${c}"/>`;
    svg+=`<text x="100" y="${yFor(i)+4}" text-anchor="middle" font-size="12" font-weight="600" font-family="Inter" fill="var(--text)">${escapeHtml(a.name)}</text>`;
    svg+=`<rect x="${w-180}" y="${yFor(i)-18}" width="160" height="36" rx="10" fill="${c}22" stroke="${c}"/>`;
    svg+=`<text x="${w-100}" y="${yFor(i)+4}" text-anchor="middle" font-size="12" font-weight="600" font-family="Inter" fill="var(--text)">${escapeHtml(a.name)}</text>`;
  });
  for (const k in paths) {
    const [from,to]=k.split('→');
    const fi=accts.findIndex(a=>a.id===from);
    const ti=accts.findIndex(a=>a.id===to);
    if (fi<0||ti<0) continue;
    const count=paths[k];
    const stroke=Math.max(1.5,Math.min(8,count*1.5));
    svg+=`<path d="M180,${yFor(fi)} C${w/2},${yFor(fi)} ${w/2},${yFor(ti)} ${w-180},${yFor(ti)}" stroke="${neutral}" stroke-width="${stroke}" fill="none" marker-end="url(#arr)" opacity=".7"/>`;
    svg+=`<text x="${w/2}" y="${(yFor(fi)+yFor(ti))/2-4}" text-anchor="middle" font-size="11" font-weight="600" font-family="Inter" fill="var(--text-2)">×${count}</text>`;
  }
  svg+='</svg>';
  holder.innerHTML=svg;
}

/* ---------- UPCOMING CALENDAR ---------- */
function renderUpcomingCal(holder) {
  const today=new Date();
  const start=startOfMonth(today);
  const end=endOfMonth(today);
  const days=end.getDate();
  const lead=start.getDay();
  const html=['<div class="cal">'];
  ['S','M','T','W','T','F','S'].forEach(d=>html.push(`<div class="dh">${d}</div>`));
  for (let i=0;i<lead;i++) html.push('<div class="day empty"></div>');
  for (let d=1;d<=days;d++) {
    const bills=(State.bills||[]).filter(b=>{
      const bd=new Date(b.dueDate); return bd.getDate()===d&&bd.getMonth()===today.getMonth();
    });
    const isToday=d===today.getDate();
    const marks=bills.map(b=>{
      const dd=Math.ceil((new Date(b.dueDate)-today)/(1000*60*60*24));
      let cls='dot';
      if (b.paid) cls='dot gray';
      else if (dd<0) cls='dot red';
      else if (dd<=7) cls='dot amber';
      return `<span class="${cls}" title="${b.merchant} ${fmt(b.amount)}"></span>`;
    }).join('');
    html.push(`<div class="day${isToday?' today':''}"><span class="num">${d}</span><div class="marks">${marks}</div></div>`);
  }
  html.push('</div>');
  holder.innerHTML=html.join('');
}

/* ---------- BILL HELPERS ---------- */
function confirmRecurring(key, merchant, amount, freq, nextDue, category) {
  State.recurringConfirmed[key]='confirmed';
  lsSet('recurring',State.recurringConfirmed);
  State.bills.push({merchant,amount,frequency:freq,dueDate:nextDue,category,paid:false,source:'auto'});
  lsSet('bills',State.bills);
  renderActive();
}
function dismissRecurring(key) {
  State.recurringConfirmed[key]='dismissed';
  lsSet('recurring',State.recurringConfirmed);
  renderActive();
}
function toggleBillPaid(i){ State.bills[i].paid=!State.bills[i].paid; lsSet('bills',State.bills); renderActive(); }
function deleteBill(i){ if(!confirm('Delete this bill?')) return; State.bills.splice(i,1); lsSet('bills',State.bills); renderActive(); }

function showBillForm(existing) {
  const b=existing||{merchant:'',amount:0,frequency:'Monthly',dueDate:dayjs().format('YYYY-MM-DD'),category:'Bills & Utilities',paid:false};
  openDrawer(`
    <h3>${existing?'Edit':'Add'} Bill</h3>
    <label class="lbl">Merchant</label><input class="input" id="bMerchant" value="${escapeHtml(b.merchant)}">
    <label class="lbl" style="margin-top:8px">Amount</label><input class="input" id="bAmount" type="number" step="0.01" value="${b.amount}">
    <label class="lbl" style="margin-top:8px">Category</label>
    <select class="select" id="bCategory">${State.categories.map(c=>`<option ${c===b.category?'selected':''}>${c}</option>`).join('')}</select>
    <label class="lbl" style="margin-top:8px">Frequency</label>
    <select class="select" id="bFreq">${['Monthly','Weekly','Bi-weekly','Quarterly','Annual','One-time'].map(f=>`<option ${f===b.frequency?'selected':''}>${f}</option>`).join('')}</select>
    <label class="lbl" style="margin-top:8px">Due Date</label><input class="input" id="bDue" type="date" value="${b.dueDate}">
    <label class="check" style="margin-top:10px"><input type="checkbox" id="bPaid" ${b.paid?'checked':''}> Paid</label>
    <div class="hr"></div>
    <button class="btn" onclick="saveBill()">Save</button> <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
  `);
}
function saveBill() {
  const bill={
    merchant:$('#bMerchant').value.trim(),
    amount:parseFloat($('#bAmount').value)||0,
    category:$('#bCategory').value,
    frequency:$('#bFreq').value,
    dueDate:$('#bDue').value,
    paid:$('#bPaid').checked,
    source:'manual'
  };
  if (!bill.merchant){ alert('Merchant required.'); return; }
  State.bills.push(bill);
  lsSet('bills',State.bills);
  closeDrawer(); renderActive();
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
