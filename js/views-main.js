/* ================================================================
   FINLENS — views-main.js
   The Finances screens (Clarity, v1.14.0): Overview, Transactions (All and
   Payments), and the screens its filter pills open: Income, Spending, Bills,
   Transfers. All four are registered views; the app bar keeps Transactions
   underlined on them (TX_VIEWS in ui.js).
================================================================ */

/* =================== SHARED PIECES =================== */
const _svg=(paths,size=16)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON={
  reload:  _svg('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>'),
  sparkle: _svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  download:_svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>'),
  search:  _svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  pencil:  _svg('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  bank:    _svg('<path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 21h18M12 3l9 5H3z"/>',18),
  piggy:   _svg('<path d="M19 7c-1-2-3.5-3-7-3C7 4 4 6.5 4 10c0 2.4 1.3 4.4 3.3 5.6V20h3v-2h3.4v2h3v-4.4A6 6 0 0 0 20 12h1V9h-1.3A6 6 0 0 0 19 7z"/><circle cx="15.5" cy="9.5" r="0.5"/>',18),
  card:    _svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',18),
};
const DAY=86400000;
const fmtSigned0=(n)=>(n>=0.5?'+':n<=-0.5?'−':'')+fmt0(Math.abs(n)).replace('-','');
const plural=(n,one,many)=>`${n.toLocaleString()} ${n===1?one:(many||one+'s')}`;
const pctStr=(x,d=0)=>(x*100).toFixed(d)+'%';
const cap=(s)=>s?s[0].toUpperCase()+s.slice(1):s;

// The row under the page title: a note on the left, the screen's actions on the right.
// `note` and `acts` are HTML (callers escape what they put in).
function pageActions(root, note, acts) {
  const d=document.createElement('div');
  d.className='page-actions';
  d.innerHTML=`${note?`<p class="note">${note}</p>`:'<span></span>'}${acts?`<div class="acts">${acts}</div>`:''}`;
  root.appendChild(d);
  return d;
}

// Transactions filter pills. All and Payments filter the Transactions list (txPillFilter);
// Income, Spending, Bills and Transfers open their own registered views.
const TX_PILLS=[['all','All','transactions'],['income','Income','income'],['spending','Spending','spending'],
  ['bills','Bills','bills'],['payments','Payments','transactions'],['transfers','Transfers','transfers']];
function renderTxPills(root, current) {
  const nav=document.createElement('nav');
  nav.className='fpills';
  nav.setAttribute('aria-label','Transaction filters');
  nav.innerHTML=TX_PILLS.map(([k,l,v])=>`<a class="fpill" href="#${v}" data-pill="${k}"${k===current?' aria-current="page"':''}>${l}</a>`).join('');
  nav.addEventListener('click',e=>{
    const a=e.target.closest('[data-pill]');
    if (!a) return;
    e.preventDefault();
    const k=a.dataset.pill;
    txPillFilter=k; txPage=1; selectedTxIds.clear();
    showView(TX_PILLS.find(p=>p[0]===k)[2]);
    const now=$(`#content .fpill[data-pill="${k}"]`);
    if (now) now.focus({preventScroll:true});
  });
  root.appendChild(nav);
}

// KPI tiles: [{ label, value (HTML), sub, cls }]
function kpiTiles(items) {
  return `<div class="kpis">${items.map(k=>`<div class="kpi"><span class="k-label">${k.label}</span><span class="k-val ${k.cls||''}">${k.value}</span>${k.sub!=null?`<span class="k-sub">${k.sub}</span>`:''}</div>`).join('')}</div>`;
}
// The active range for a sentence: "this month", "all time", or "Dec 1, 2026 – Dec 31, 2026".
function rangeText() { const r=describeRange(); return State.range.mode==='custom'?r:r.toLowerCase(); }
function emptyPanel(msg) { return `<section class="panel"><p class="empty-note">${msg}</p></section>`; }
function appendHtml(root, html) { root.insertAdjacentHTML('beforeend', html); }

// In-view links: <a href="#trends" data-goto="trends">. Optional data-tab (a Settings
// tab), data-pill (the Transactions filter) and data-cat (its category filter).
function wireLinks(root) {
  root.addEventListener('click',e=>{
    const a=e.target.closest('[data-goto]');
    if (!a||!root.contains(a)) return;
    e.preventDefault();
    if (a.dataset.tab) settingsTab=a.dataset.tab;
    if (a.dataset.pill) txPillFilter=a.dataset.pill;
    if (a.dataset.cat!=null) { txCatFilter=a.dataset.cat; txSearch=''; txPage=1; }
    showView(a.dataset.goto);
    window.scrollTo(0,0);
  });
}
// Rows whose [data-open] element opens the transaction drawer.
function wireTxOpeners(root) {
  root.addEventListener('click',e=>{
    const b=e.target.closest('[data-open]');
    if (b&&root.contains(b)) showTxDrawer(b.dataset.open);
  });
}
const isCashAcct=a=>a.kind==='bank_checking'||a.kind==='bank_savings';
const isCardAcct=a=>a.kind==='credit_card';
// Card balances count as debt whichever sign they were entered with (as before v1.14.0).
const debtOf=b=>b==null||isNaN(b)?0:Math.abs(b);
const KIND_LABEL={bank_checking:'Checking',bank_savings:'Savings',credit_card:'Credit card',unknown:'Account'};
const FREQ_LABEL={'Bi-weekly':'Every 2 weeks',Monthly:'Monthly',Weekly:'Weekly',Quarterly:'Every 3 months',Annual:'Yearly',Irregular:'Irregular'};
const medianDay=(dates)=>{ const d=dates.map(x=>x.getDate()).sort((a,b)=>a-b); return d.length?d[Math.floor((d.length-1)/2)]:null; };
// "Monthly, around the 16th" from a list of dates.
function rhythmOf(dates) {
  if (dates.length<2) return '';
  const s=[...dates].sort((a,b)=>a-b);
  const gaps=s.slice(1).map((d,i)=>(d-s[i])/DAY);
  const g=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  if (g>=27&&g<=33) return `Monthly, around the ${ordinal(medianDay(s))}`;
  if (g>=12&&g<=16) return 'Every 2 weeks';
  if (g>=6&&g<=8) return 'Weekly';
  return '';
}

/* =================== OVERVIEW =================== */
let nwPeriod='all';   // net worth chart: '1m' | '3m' | 'all'

registerView('overview','Overview',(root)=>{
  if (!State.transactions.length) { renderWelcome(root); return; }
  wireLinks(root);
  wireTxOpeners(root);
  pageActions(root, escapeHtml(dayjs().format('dddd, MMMM D')),
    `<button type="button" class="btn ghost lg" id="ovReload">${ICON.reload}Reload CSVs</button>
     <a class="btn lg" href="#ai" data-goto="ai">${ICON.sparkle}Ask AI about this</a>`);
  $('#ovReload').onclick=()=>reloadDataFiles();

  const accts=orderedAccounts();
  const txs=filteredTx();
  const endBal={}; accts.forEach(a=>{ endBal[a.id]=periodEndBalance(a.id); });
  const netWith=(balOf)=>accts.reduce((s,a)=>isCashAcct(a)?s+(balOf(a.id)||0):isCardAcct(a)?s-debtOf(balOf(a.id)):s,0);
  const net=netWith(id=>endBal[id]);
  // The balance history ends at the range end or the last transaction, whichever is first.
  const span=dataSpan(State.transactions);
  const rEnd=State.range.end;
  const seriesEnd=span?new Date(Math.min(rEnd?rEnd.getTime():Infinity, new Date(span.last).setHours(23,59,59))):null;
  const hasHistory=!!(span&&seriesEnd>=span.first);
  const netAt=(d)=>netWith(id=>balanceAt(id,d));

  /* ---- Net worth + latest month ---- */
  const row1=document.createElement('div'); row1.className='cols-3';
  const money=fmt(net), dot=money.lastIndexOf('.');
  let deltaHtml='';
  if (hasHistory) {
    const prevEnd=new Date(seriesEnd.getFullYear(), seriesEnd.getMonth(), 0, 23,59,59);
    if (prevEnd>=span.first) {
      const ch=netAt(seriesEnd)-netAt(prevEnd);
      deltaHtml=`<div class="delta-pill ${ch>=0?'up':'down'}"><span aria-hidden="true">${ch>=0?'▲':'▼'}</span><span class="sr-only">${ch>=0?'Up':'Down'}</span> ${fmt(Math.abs(ch))} since ${dayjs(prevEnd).format('MMM D')}</div>`;
    }
  }
  const flow=monthlyFlow(txs);
  const latest=flow[flow.length-1];
  let latestHtml;
  if (latest) {
    const last=dataSpan(latest.txs).last;
    const full=last.getDate()===endOfMonth(last).getDate();
    const rate=latest.income>0?latest.net/latest.income:null;
    const recent=flow.slice(-6).filter(m=>m.income>0);
    const avg=recent.length?recent.reduce((s,m)=>s+m.net/m.income,0)/recent.length:null;
    latestHtml=`
      <div>
        <h2 id="ovMonthH" class="k-quiet">Latest month · ${dayjs(latest.date).format('MMMM')}</h2>
        <p class="sub">${full?'Full month':`Data runs through ${dayjs(last).format('MMM D')}`}</p>
      </div>
      <div class="kv">
        <div><span class="k">Money in</span><span class="v c-good">${fmtSigned(latest.income)}</span></div>
        <div><span class="k">Money out</span><span class="v">${fmtSigned(-latest.expense,'−')}</span></div>
        <div class="total"><span class="k">Net</span><span class="v">${fmtSigned(latest.net)}</span></div>
      </div>
      ${rate==null?'':`<div class="rate-box">
        <div class="top"><span>Savings rate</span><b>${pctStr(rate)}</b></div>
        <div class="progress on-2" role="img" aria-label="Savings rate ${pctStr(rate)}"><div style="width:${Math.max(0,Math.min(100,rate*100)).toFixed(1)}%"></div></div>
        ${recent.length>1&&avg!=null?`<span class="s">${recent.length}-month average ${pctStr(avg)}</span>`:''}
      </div>`}
      <a class="more-link end" href="#trends" data-goto="trends">See trends →</a>`;
  } else {
    latestHtml=`<div><h2 id="ovMonthH" class="k-quiet">Latest month</h2><p class="sub">No transactions in ${escapeHtml(rangeText())}.</p></div>`;
  }
  row1.innerHTML=`
    <section class="panel span-2 hero" aria-labelledby="ovNwH">
      <div class="panel-head hero-head">
        <div>
          <h2 id="ovNwH" class="k-quiet">Net worth</h2>
          <div class="hero-val">${money.slice(0,dot)}<span class="cents">${money.slice(dot)}</span></div>
          ${deltaHtml}
        </div>
        ${hasHistory?`<div class="seg" role="group" aria-label="Chart period">
          ${[['1m','1M'],['3m','3M'],['all','All']].map(([k,l])=>`<button type="button" data-nw="${k}" aria-pressed="${nwPeriod===k}">${l}</button>`).join('')}
        </div>`:''}
      </div>
      <div id="nwChart">${hasHistory?'':'<p class="empty-note">No balance history before this period.</p>'}</div>
    </section>
    <section class="panel" aria-labelledby="ovMonthH">${latestHtml}</section>`;
  root.appendChild(row1);

  const drawNetWorth=()=>{
    const holder=$('#nwChart'); if (!holder||!hasHistory) return;
    const first=new Date(span.first);
    const dates=[];
    if (nwPeriod==='all') {
      dates.push(new Date(first.getFullYear(),first.getMonth(),first.getDate(),23,59,59));
      for (let m=new Date(first.getFullYear(),first.getMonth()+1,0,23,59,59); m<seriesEnd; m=new Date(m.getFullYear(),m.getMonth()+2,0,23,59,59)) if (m>dates[0]) dates.push(m);
      if (seriesEnd>dates[dates.length-1]) dates.push(seriesEnd);
    } else {
      const days=nwPeriod==='1m'?30:91, step=nwPeriod==='1m'?1:7;
      const start=new Date(Math.max(first.getTime(), seriesEnd.getTime()-days*DAY));
      for (let d=new Date(start); d<seriesEnd; d=new Date(d.getTime()+step*DAY)) dates.push(new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59));
      if (!dates.length||seriesEnd>dates[dates.length-1]) dates.push(seriesEnd);
    }
    const pts=dates.map(d=>({ v:netAt(d), tip:`${dayjs(d).format('MMM D, YYYY')}: ${fmt(netAt(d))}` }));
    const labels=[];
    if (nwPeriod==='all') {
      dates.forEach((d,i)=>{
        if (i===0||i===dates.length-1) labels.push({i,text:dayjs(d).format('MMM D')});
        else labels.push({i,text:dayjs(d).format('MMM')});
      });
    } else {
      const every=Math.max(1,Math.ceil(dates.length/6));
      dates.forEach((d,i)=>{ if (i===0||i===dates.length-1||(i%every===0&&dates.length-1-i>=every/2)) labels.push({i,text:dayjs(d).format('MMM D')}); });
    }
    const a=pts[0].v, b=pts[pts.length-1].v;
    const w=Math.max(300,Math.min(900,Math.round(holder.clientWidth||760)));
    holder.innerHTML=svgLineChart(pts,{ w, h:190, hue:'accent', xLabels:labels,
      ariaLabel:`Net worth ${b>=a?'rose':'fell'} from ${fmt0(a)} on ${dayjs(dates[0]).format('MMMM D')} to ${fmt0(b)} on ${dayjs(dates[dates.length-1]).format('MMMM D')}` });
  };
  drawNetWorth();
  $$('[data-nw]',row1).forEach(btn=>btn.onclick=()=>{
    nwPeriod=btn.dataset.nw;
    $$('[data-nw]',row1).forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
    drawNetWorth();
  });

  /* ---- Accounts ---- */
  const acctSec=document.createElement('section');
  acctSec.className='acct-section';
  acctSec.setAttribute('aria-labelledby','ovAcctH');
  const pairsAll=transferPairs(State.transactions);
  acctSec.innerHTML=`<div class="section-head"><h2 id="ovAcctH">Accounts</h2><a class="more-link" href="#settings" data-goto="settings" data-tab="accounts">Manage accounts</a></div>
    <div class="acct-cards">${accts.map(a=>accountCardHtml(a,endBal[a.id],seriesEnd,pairsAll)).join('')}</div>`;
  root.appendChild(acctSec);
  wireAccountRename(acctSec);

  /* ---- Cash flow + upcoming bills ---- */
  const row2=document.createElement('div'); row2.className='cols-3';
  const months=flow.slice(-6);
  let cfHtml;
  if (months.length) {
    const max=Math.max(1,...months.map(m=>Math.max(m.income,m.expense)));
    const peakIn=months.reduce((p,m)=>m.income>p.income?m:p,months[0]);
    const peakOut=months.reduce((p,m)=>m.expense>p.expense?m:p,months[0]);
    const mName=(m)=>dayjs(m.date).format('MMMM');
    cfHtml=`
      <div role="img" class="bars fill" aria-label="Money in and out by month, ${mName(months[0])} to ${mName(months[months.length-1])}. Money in peaked at ${fmt0(peakIn.income)} in ${mName(peakIn)}; money out peaked at ${fmt0(peakOut.expense)} in ${mName(peakOut)}.">
        ${months.map(m=>`<div class="grp" title="${dayjs(m.date).format('MMM YYYY')}: in ${fmt(m.income)}, out ${fmt(m.expense)}"><div class="bar hue-accent" style="height:${(m.income/max*100).toFixed(1)}%"></div><div class="bar hue-warn" style="height:${(m.expense/max*100).toFixed(1)}%"></div></div>`).join('')}
      </div>
      <div class="bars-x">${months.map(m=>`<div><div>${dayjs(m.date).format('MMM')}</div><div class="v"><span class="full">${fmtSigned0(m.net)}</span><span class="short" aria-hidden="true">${m.net<0?'−':'+'}${fmtShort(Math.abs(m.net))}</span></div></div>`).join('')}</div>`;
  } else cfHtml=`<p class="empty-note">No transactions in ${escapeHtml(rangeText())}.</p>`;
  row2.innerHTML=`
    <section class="panel span-2" aria-labelledby="ovCfH">
      <div class="panel-head"><h2 id="ovCfH">Cash flow</h2>
        <div class="legend"><span><i class="sw hue-accent"></i>Money in</span><span><i class="sw hue-warn"></i>Money out</span></div></div>
      ${cfHtml}
    </section>
    <section class="panel" aria-labelledby="ovBillsH">${upcomingBillsHtml()}</section>`;
  root.appendChild(row2);

  /* ---- Largest card purchases ---- */
  const cards=accts.filter(isCardAcct);
  if (cards.length) {
    const cardIds=new Set(cards.map(a=>a.id));
    const cardTx=txs.filter(t=>cardIds.has(t.account)&&t.amount<0&&t.type!=='transfer');
    const lastMonth=cardTx.length?monthKey(dataSpan(cardTx).last):null;
    const inMonth=cardTx.filter(t=>monthKey(t.date)===lastMonth).sort((a,b)=>a.amount-b.amount).slice(0,5);
    const which=new Set(inMonth.map(t=>t.account));
    const sub=lastMonth?`${escapeHtml(which.size===1?acctName([...which][0]):cards.length===1?acctName(cards[0].id):'All cards')} · ${dayjs(lastMonth+'-01').format('MMMM')}`:'';
    const sec=document.createElement('section');
    sec.className='panel';
    sec.setAttribute('aria-labelledby','ovTopH');
    sec.innerHTML=`<div class="panel-head"><div><h2 id="ovTopH">Largest card purchases</h2>${sub?`<p class="sub">${sub}</p>`:''}</div>
        <a class="more-link" href="#transactions" data-goto="transactions" data-pill="all">All transactions →</a></div>
      ${inMonth.length?`<div class="table-scroll"><table class="tbl flush mw-560 fit-sm">
        <thead><tr><th scope="col">Merchant</th><th scope="col" class="w-date">Date</th><th scope="col" class="hide-sm">Category</th><th scope="col" class="r w-amt">Amount</th></tr></thead>
        <tbody>${inMonth.map(t=>`<tr>
          <td><button type="button" class="link-btn" data-open="${escapeHtml(t.id)}">${escapeHtml(t.description)}</button></td>
          <td class="dim nowrap">${dayjs(t.date).format('MMM D')}</td>
          <td class="hide-sm"><span class="tag">${escapeHtml(t.category)}</span></td>
          <td class="r strong nowrap">${fmtSigned(t.amount)}</td></tr>`).join('')}</tbody></table></div>`
        :`<p class="empty-note">No card purchases in ${escapeHtml(rangeText())}.</p>`}`;
    root.appendChild(sec);
  }
});

/* =================== WELCOME (no transactions yet, v1.16.0) =================== */
// What the Overview shows with no transactions. On a true first run (nothing saved at all)
// the app bar shows only the brand, as in the mockup; once you have a folder, plans, AI
// history or a key, it keeps its menus so you can still reach them.
function isFirstRun() {
  return !State.transactions.length && !State.lastFolderName && !State.apiKey
    && !['budgets','bills','buckets','debts','aiHistory','scenarios'].some(k=>(State[k]||[]).length);
}
function renderWelcome(root) {
  shellHero('Your money in one view, on your own computer', isFirstRun());
  const linked=!!(State._folderLinked&&State.lastFolderName);
  const folderBtn=linked
    ?`<button type="button" class="btn xl" id="wcFolder">${ICON.reload}Reload CSVs from “${escapeHtml(State.lastFolderName)}”</button>`
    :`<button type="button" class="btn xl" id="wcFolder">${_svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',18)}Pick your CSV folder</button>`;
  const step=(n,t,d)=>`<li><span class="step-num" aria-hidden="true">${n}</span><h2>${t}</h2><p>${d}</p></li>`;
  const feat=(icon,t,d)=>`<div>${_svg(icon,20)}<div><div class="t">${t}</div><div class="d">${d}</div></div></div>`;
  appendHtml(root,`<div class="welcome">
    <p class="lead">FinLens reads the CSV files your bank lets you download. Nothing is uploaded, and there's no account to create.</p>
    <div class="hero-acts">${folderBtn}<button type="button" class="btn ghost xl" id="wcSample">Try it with sample data</button></div>
    <p class="hint">Works best in Chrome, Edge, Arc or Brave. In Safari or Firefox you'll <button type="button" class="inline-link" id="wcFiles">choose the files</button> each time instead.</p>
    <p class="status-line" id="wcStatus" role="status"></p>
  </div>
  <ol class="steps" aria-label="How to start">
    ${step(1,'Download your CSVs','From your bank\'s website, export checking and savings transactions as CSV, and download each credit card\'s activity as CSV.')}
    ${step(2,'Put them in one folder','Any folder works. Drop newer exports in later and FinLens adds only the new rows.')}
    ${step(3,'Pick the folder','FinLens saves your budgets, bills and edits back to that folder as finlens-state.json, so clearing the browser loses nothing.')}
  </ol>
  <div class="features">
    ${feat('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>','No bank login','FinLens never connects to your bank.')}
    ${feat('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>','Stays on this computer','No server and no cloud sync.')}
    ${feat('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>','AI is optional','It uses your own Anthropic key, and only sends a summary.')}
  </div>`);
  // The existing import paths, each from its own click (the folder and file pickers need one).
  $('#wcFolder').onclick=()=>linked?reloadDataFiles():pickDataFolder();
  $('#wcSample').onclick=()=>loadSampleData($('#wcStatus'));
  $('#wcFiles').onclick=()=>$('#filePick').click();
}

// One account card on the Overview: balance, a sparkline (cash) or utilization bar (card),
// and where the balance comes from.
function accountCardHtml(a, bal, seriesEnd, pairsAll) {
  const own=State.transactions.filter(t=>t.account===a.id);
  const name=acctName(a.id);
  const manual=State.manualBalances[a.id]!=null;
  const kind=a.kind;
  const tile=kind==='bank_savings'?['t-good',ICON.piggy]:kind==='credit_card'?['t-card',ICON.card]:['',ICON.bank];
  let sub=`${KIND_LABEL[kind]||'Account'} · ${plural(own.length,'transaction')}`;
  let middle='', foot='';
  const sparkVals=()=>{
    if (!own.length||!seriesEnd) return [];
    const first=dataSpan(own).first.getTime(), end=seriesEnd.getTime();
    if (end<=first) return [];
    const n=24, out=[];
    for (let i=0;i<n;i++) out.push(balanceAt(a.id,new Date(first+(end-first)*i/(n-1))));
    return out;
  };
  if (kind==='credit_card') {
    const owed=debtOf(bal);
    const limit=Number(State.manualBalances[a.id+'_limit'])||0;
    const pays=own.filter(isCardPayment).sort((x,y)=>y.date-x.date);
    const lastPair=pays.length?pairsAll.find(p=>p.inId===pays[0].id):null;
    const autopay=!!(lastPair&&lastPair.outId&&/auto\s?pay/i.test(State.transactions.find(t=>t.id===lastPair.outId)?.description||''));
    const payNote=autopay?'Autopay on':pays.length?`Last paid ${dayjs(pays[0].date).format('MMM D')}`:'No payments yet';
    const balHtml=`${fmt(owed)} <small>owed</small>`;
    middle=limit
      ?`<div class="util"><div class="progress hue-card" role="img" aria-label="${pctStr(owed/limit)} of the credit limit used"><div style="width:${Math.min(100,owed/limit*100).toFixed(1)}%"></div></div>
          <div class="meta"><span>${pctStr(owed/limit)} of ${fmt0(limit)} limit</span><span>${payNote}</span></div></div>`
      :`<div class="util"><div class="meta"><span>No credit limit set · <a href="#settings" data-goto="settings" data-tab="credit-cards">Add one</a></span><span>${payNote}</span></div></div>`;
    foot=manual?'Balance entered in Settings → Accounts':'Computed from imported transactions';
    return accountCardShell(a,name,sub,tile,balHtml,middle,foot);
  }
  const vals=sparkVals();
  const hue=kind==='bank_savings'?'good':'accent';
  middle=vals.length>1?sparkSvg(vals,hue,`${name} balance trend, ${vals[vals.length-1]>=vals[0]?'rising':'falling'}`):'';
  if (kind==='bank_savings') {
    const interest=own.filter(t=>t.amount>0&&/interest/i.test(t._originalDesc||t.description)&&(!seriesEnd||t.date<=seriesEnd)).reduce((s,t)=>s+t.amount,0);
    if (interest>0) sub=`Savings · interest ${fmt(interest)} to date`;
    const buckets=State.buckets||[];
    if (buckets.length) {
      const assigned=buckets.reduce((s,b)=>s+(Number(b.current)||0),0);
      foot=`${assigned>=(bal||0)-0.005?'Fully assigned':`${fmt0(assigned)} assigned`} to ${plural(buckets.length,'bucket')} · <a href="#buckets" data-goto="buckets">View</a>`;
    } else foot=`No savings buckets yet · <a href="#buckets" data-goto="buckets">Create one</a>`;
  } else {
    foot=manual?'Balance entered in Settings → Accounts'
      :State.manualBalances[a.id+'_initial']!=null?'Starting balance plus imported transactions'
      :`Sum of imported transactions · <a href="#settings" data-goto="settings" data-tab="accounts">Set balance</a>`;
  }
  return accountCardShell(a,name,sub,tile,fmt(bal),middle,foot);
}
function accountCardShell(a,name,sub,tile,balHtml,middle,foot) {
  return `<div class="card acct-card">
    <div class="acct-top">
      <span class="icon-tile ${tile[0]}">${tile[1]}</span>
      <div style="flex:1;min-width:0">
        <span class="acct-name" tabindex="0" role="button" data-acct-id="${escapeHtml(a.id)}" title="Double-click to rename" aria-label="${escapeHtml(name)}. Press Enter to rename.">${escapeHtml(name)}</span>
        <div class="acct-kind">${sub}</div>
      </div>
    </div>
    <div class="acct-bal">${balHtml}</div>
    ${middle}
    <span class="acct-foot">${foot}</span>
  </div>`;
}
// Double-click an account name (or focus it and press Enter) to rename it. The name is
// saved in State.accountLabels and used everywhere (setAccountName() in views-data.js, as
// Settings → Accounts does): an empty name brings the default name back, and a name left
// as it was saves nothing.
function wireAccountRename(scope) {
  $$('.acct-name',scope).forEach(el=>{
    const start=()=>{
      const id=el.dataset.acctId, cur=el.textContent.trim();
      const inp=document.createElement('input');
      inp.className='input'; inp.value=cur;
      inp.setAttribute('aria-label','Account name');
      inp.style.cssText='font-size:15px;font-weight:600;min-height:32px;padding:3px 8px';
      el.replaceWith(inp); inp.focus(); inp.select();
      let done=false;
      const save=()=>{
        if (done) return; done=true;
        if (inp.value.trim()!==cur) setAccountName(id,inp.value);
        renderActive();
      };
      inp.addEventListener('blur',save);
      inp.addEventListener('keydown',e=>{
        if (e.key==='Enter'){ e.preventDefault(); save(); }
        if (e.key==='Escape'){ done=true; e.stopPropagation(); inp.replaceWith(el); el.focus(); }
      });
    };
    el.addEventListener('dblclick',start);
    el.addEventListener('keydown',e=>{ if (e.key==='Enter'||e.key==='F2'){ e.preventDefault(); start(); } });
  });
}
// Overview: bills due in the next three weeks (and any overdue). With no bills yet, the
// recurring charges FinLens spotted that are due in that window, marked as not confirmed.
function upcomingBillsHtml() {
  const t0=today(), horizon=new Date(t0.getTime()+21*DAY);
  const bills=State.bills||[];
  let items, spotted=false;
  if (bills.length) {
    items=bills.map(b=>({ name:b.merchant, amount:b.amount, due:billNextDue(b), paid:b.paid })).filter(x=>!x.paid&&x.due<=horizon);
  } else {
    spotted=true;
    items=detectRecurring().filter(r=>!State.recurringConfirmed[r.key]&&r.nextDue>=t0&&r.nextDue<=horizon)
      .map(r=>({ name:r.merchant, amount:r.avg, due:r.nextDue }));
  }
  items.sort((a,b)=>a.due-b.due);
  const rows=items.slice(0,6).map(x=>{
    const days=Math.round((new Date(x.due.getFullYear(),x.due.getMonth(),x.due.getDate())-t0)/DAY);
    const pill=days<0?`<span class="pill bad">Overdue ${-days}d</span>`:days===0?'<span class="pill warn">Due today</span>':'';
    return `<div class="r"><div class="date-block"><div class="mo">${dayjs(x.due).format('MMM')}</div><div class="dd">${x.due.getDate()}</div></div>
      <div class="t" style="white-space:normal">${escapeHtml(x.name)}${pill?`<div>${pill}</div>`:''}</div><span class="amt">${fmt(x.amount)}</span></div>`;
  }).join('');
  return `<div class="panel-head"><h2 id="ovBillsH">Upcoming bills</h2><span class="aside">Next 3 weeks</span></div>
    ${rows?`<div class="rows">${rows}</div>`:`<p class="empty-note">Nothing due in the next 3 weeks.</p>`}
    ${spotted&&rows?`<p class="sub" style="margin:0">Spotted in your transactions, not confirmed as bills yet.</p>`:''}
    <a class="more-link end" href="#bills" data-goto="bills">${spotted?'Review in Bills →':'All bills →'}</a>`;
}

/* =================== TRANSACTIONS (All · Payments) =================== */
let txSort={key:'date',dir:'desc'};
let txPage=1;
let txSearch='';
let txCatFilter='all';
let txPillFilter='all'; // the current pill: all | income | spending | bills | payments | transfers
let txAmtMode='';
let txAmtVal=null;
let txAmtVal2=null;
let selectedTxIds=new Set();
const TX_PAGE_SIZE=50;
const TX_SORTS=[['date-desc','Newest first'],['date-asc','Oldest first'],['amount-desc','Largest amount'],['amount-asc','Smallest amount'],['description-asc','Description A–Z']];
const FLAG_LABEL={bill:'Bill',recurring:'Recurring',subscription:'Subscription'};

registerView('transactions','Transactions',(root)=>{
  // Income, Spending, Bills and Transfers are their own screens; this one lists All or Payments.
  if (!['all','payments'].includes(txPillFilter)) txPillFilter='all';
  const pay=txPillFilter==='payments';
  const all=filteredTx();
  const base=pay?all.filter(isCardPayment):all;
  wireLinks(root);
  const files=Object.values(State.accounts).filter(a=>a.sourceFile&&a.sourceFile!=='manual').length;
  pageActions(root, files?plural(files,'CSV file'):'',
    `<a class="btn ghost lg" href="#txRules" id="txRulesJump">Transaction rules</a>
     <button type="button" class="btn lg" id="txExport">${ICON.download}Export CSV</button>`);
  renderTxPills(root, txPillFilter);

  if (pay) {
    const total=base.reduce((s,t)=>s+t.amount,0);
    const bals=currentBalances();
    const owed=orderedAccounts().filter(isCardAcct).reduce((s,a)=>s+debtOf(bals[a.id]),0);
    appendHtml(root,kpiTiles([
      {label:'Card payments',value:base.length.toLocaleString()},
      {label:'Total paid',value:fmt(total)},
      {label:'Average payment',value:base.length?fmt(total/base.length):'—'},
      {label:'Card balance now',value:fmt(owed),cls:'c-card'},
    ]));
  } else {
    const inc=sumIncome(base), out=sumExpense(base);
    appendHtml(root,kpiTiles([
      {label:'Transactions',value:base.length.toLocaleString()},
      {label:'Money in',value:fmtSigned(inc),cls:'c-good'},
      {label:'Money out',value:fmtSigned(-out,'−')},
      {label:'Net',value:fmtSigned(inc-out)},
    ]));
  }

  const TRANSFER_CATS=['Transfer in','Transfer out'];
  const cats=[...new Set(base.flatMap(t=>t.categories||[t.category]).filter(c=>c&&!TRANSFER_CATS.includes(c)&&c!=='Other'))].sort();
  if (txCatFilter!=='all'&&txCatFilter!=='(Uncategorized)'&&!cats.includes(txCatFilter)) cats.push(txCatFilter);
  const sortVal=`${txSort.key}-${txSort.dir}`;
  const list=document.createElement('section');
  list.className='panel flush';
  list.setAttribute('aria-label',pay?'Card payments':'Transaction list');
  list.innerHTML=`
    <div class="toolbar">
      <label class="search">${ICON.search}<span class="sr-only">Search transactions</span>
        <input type="search" id="txSearch" placeholder="Search description or notes" value="${escapeHtml(txSearch)}" autocomplete="off"></label>
      <label class="inline-field">Category
        <select class="select" id="txCat">
          <option value="all"${txCatFilter==='all'?' selected':''}>All categories</option>
          <option value="(Uncategorized)"${txCatFilter==='(Uncategorized)'?' selected':''}>(Uncategorized)</option>
          ${cats.map(c=>`<option value="${escapeHtml(c)}"${c===txCatFilter?' selected':''}>${escapeHtml(c)}</option>`).join('')}
        </select></label>
      <label class="inline-field">Sort
        <select class="select" id="txSortSel">${TX_SORTS.map(([v,l])=>`<option value="${v}"${v===sortVal?' selected':''}>${l}</option>`).join('')}</select></label>
      <div class="inline-field">
        <label for="txAmtMode">Amount</label>
        <select class="select" id="txAmtMode">
          <option value=""${txAmtMode===''?' selected':''}>Any</option>
          <option value="eq"${txAmtMode==='eq'?' selected':''}>Exactly</option>
          <option value="lt"${txAmtMode==='lt'?' selected':''}>Less than</option>
          <option value="gt"${txAmtMode==='gt'?' selected':''}>More than</option>
          <option value="range"${txAmtMode==='range'?' selected':''}>Between</option>
        </select>
        <input class="input" id="txAmtVal" type="number" step="0.01" placeholder="$" aria-label="Amount" value="${txAmtVal!==null?txAmtVal:''}"${txAmtMode?'':' hidden'}>
        <span id="txAmtSep"${txAmtMode==='range'?'':' hidden'}>and</span>
        <input class="input" id="txAmtVal2" type="number" step="0.01" placeholder="max" aria-label="Maximum amount" value="${txAmtVal2!==null?txAmtVal2:''}"${txAmtMode==='range'?'':' hidden'}>
      </div>
    </div>
    <div class="bulk-bar" id="bulkBar" hidden>
      <strong id="bulkCount"></strong>
      <select class="select" id="bulkCatSel" aria-label="Category for the selected transactions">
        <option value="">Set category…</option>
        ${State.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <button type="button" class="btn sm" id="bulkApplyCat">Apply</button>
      <select class="select" id="bulkTypeSel" aria-label="Type for the selected transactions">
        <option value="">Set type…</option>
        <option value="debit">Expense</option>
        <option value="credit">Income / refund</option>
        <option value="transfer">Transfer</option>
        <option value="payment">Card payment</option>
      </select>
      <button type="button" class="btn sm" id="bulkApplyType">Apply type</button>
      <button type="button" class="btn ghost sm" id="bulkMarkBill">Mark as bill</button>
      <button type="button" class="btn ghost sm" id="bulkMarkSub">Mark as subscription</button>
      <button type="button" class="btn ghost sm" id="bulkClear" style="margin-left:auto">Clear selection</button>
    </div>
    <div class="table-scroll"><table class="tbl tx-table mw-860 fit-sm" id="txTable"></table></div>
    <div class="list-foot"><span id="txCount" aria-live="polite"></span><div class="pager" id="txPager" role="group" aria-label="Pages"></div></div>`;
  root.appendChild(list);

  const matches=(t)=>{
    if (txSearch){
      const q=txSearch.toLowerCase();
      const cs=(t.categories||[t.category]).join(' ');
      if (!(t.description+' '+cs+' '+(t.notes||'')).toLowerCase().includes(q)) return false;
    }
    if (txCatFilter==='(Uncategorized)') {
      const tc=(t.categories||[t.category]);
      if (!(!tc.length||tc.every(c=>!c||c==='Other'))) return false;
    } else if (txCatFilter!=='all'&&!(t.categories||[t.category]).includes(txCatFilter)) return false;
    if (txAmtMode) {
      const abs=Math.abs(t.amount);
      if (txAmtMode==='eq'    && txAmtVal!==null && Math.abs(abs-txAmtVal)>0.01) return false;
      if (txAmtMode==='lt'    && txAmtVal!==null && abs>=txAmtVal) return false;
      if (txAmtMode==='gt'    && txAmtVal!==null && abs<=txAmtVal) return false;
      if (txAmtMode==='range') {
        if (txAmtVal!==null  && abs<txAmtVal)  return false;
        if (txAmtVal2!==null && abs>txAmtVal2) return false;
      }
    }
    return true;
  };

  const updateBulk=(rowsLen,pages)=>{
    const bar=$('#bulkBar'); if (bar) bar.hidden=!selectedTxIds.size;
    const bc=$('#bulkCount'); if (bc) bc.textContent=`${selectedTxIds.size} selected`;
  };
  const countText=(rows,slice)=>{
    const sel=selectedTxIds.size?` · ${selectedTxIds.size} selected`:'';
    if (pay) return `Showing ${slice.length} of ${plural(rows.length,'card payment')}${sel}`;
    const filtered=rows.length!==base.length?` (${base.length.toLocaleString()} before filters)`:'';
    return `Showing ${slice.length} of ${rows.length.toLocaleString()}${filtered} · ${TX_PAGE_SIZE} per page${sel}`;
  };

  const renderTable=()=>{
    const rows=base.filter(matches);
    rows.sort((a,b)=>{
      let av=a[txSort.key], bv=b[txSort.key];
      if (txSort.key==='amount'){ av=Math.abs(a.amount); bv=Math.abs(b.amount); }
      if (txSort.key==='description'){ av=(a.description||'').toLowerCase(); bv=(b.description||'').toLowerCase(); }
      if (av<bv) return txSort.dir==='asc'?-1:1;
      if (av>bv) return txSort.dir==='asc'?1:-1;
      return 0;
    });
    const pages=Math.max(1,Math.ceil(rows.length/TX_PAGE_SIZE));
    if (txPage>pages) txPage=pages;
    const slice=rows.slice((txPage-1)*TX_PAGE_SIZE,txPage*TX_PAGE_SIZE);
    const pageIds=slice.map(t=>t.id);
    const allChecked=pageIds.length&&pageIds.every(id=>selectedTxIds.has(id));
    const empty=txSearch?`No transactions match “${escapeHtml(txSearch)}”.`
      :pay?`No card payments in ${escapeHtml(rangeText())}.`
      :base.length?'No transactions match these filters.':`No transactions in ${escapeHtml(rangeText())}.`;
    $('#txTable').innerHTML=`
      <thead><tr>
        <th scope="col" class="chk"><input type="checkbox" id="txSelectAll" ${allChecked?'checked':''} aria-label="Select all on this page"></th>
        <th scope="col" class="w-date">Date</th><th scope="col">Description</th><th scope="col" class="hide-sm">Category</th>
        <th scope="col" class="hide-sm">Account</th><th scope="col" class="hide-sm">Flags</th><th scope="col" class="r w-amt">Amount</th>
      </tr></thead>
      <tbody>${slice.length?slice.map(t=>{
        const cs=(t.categories&&t.categories.length?t.categories:[t.category]);
        const flags=[t.isBill&&'Bill',t.isRecurring&&'Recurring',t.isSubscription&&'Sub'].filter(Boolean);
        return `<tr class="click" data-id="${escapeHtml(t.id)}">
          <td class="chk"><input type="checkbox" class="tx-chk" data-id="${escapeHtml(t.id)}" ${selectedTxIds.has(t.id)?'checked':''} aria-label="Select ${escapeHtml(t.description)}"></td>
          <td class="dim nowrap">${dayjs(t.date).format('MMM D')}</td>
          <td style="max-width:320px"><button type="button" class="link-btn" data-open="${escapeHtml(t.id)}" aria-label="Edit ${escapeHtml(t.description)}, ${fmtSigned(t.amount)}">${escapeHtml(t.description)}</button>${t.notes?`<div class="note-line">${escapeHtml(t.notes)}</div>`:''}<div class="note-line show-sm">${escapeHtml(cs.join(', '))} · ${escapeHtml(acctName(t.account))}${flags.length?' · '+flags.join(', '):''}</div></td>
          <td class="hide-sm"><div class="flags">${cs.map(c=>`<span class="tag">${escapeHtml(c)}</span>`).join('')}</div></td>
          <td class="dim nowrap hide-sm">${escapeHtml(acctName(t.account))}</td>
          <td class="hide-sm"><div class="flags">${flags.map(f=>`<span class="flag">${f}</span>`).join('')}</div></td>
          <td class="r strong nowrap ${t.amount>0?'c-good':''}">${fmtSigned(t.amount)}</td>
        </tr>`;
      }).join(''):`<tr><td colspan="7"><p class="empty-note">${empty}</p></td></tr>`}</tbody>`;
    $('#txCount').textContent=countText(rows,slice);
    // Pager: ‹ 1 … 4 5 6 … 12 ›
    const nums=[];
    for (let p=1;p<=pages;p++) if (p===1||p===pages||Math.abs(p-txPage)<=1) nums.push(p); else if (nums[nums.length-1]!=='…') nums.push('…');
    $('#txPager').innerHTML=pages>1?`<button type="button" data-page="${txPage-1}" aria-label="Previous page" ${txPage<=1?'disabled':''}>‹</button>
      ${nums.map(p=>p==='…'?'<span class="gap" aria-hidden="true">…</span>':`<button type="button" data-page="${p}" ${p===txPage?'aria-current="page"':''} aria-label="Page ${p}">${p}</button>`).join('')}
      <button type="button" data-page="${txPage+1}" aria-label="Next page" ${txPage>=pages?'disabled':''}>›</button>`:'';
    $$('#txPager [data-page]').forEach(b=>b.onclick=()=>{
      txPage=Math.min(pages,Math.max(1,+b.dataset.page)); renderTable();
      const cur=$('#txPager [aria-current="page"]'); if (cur) cur.focus({preventScroll:true});
      list.scrollIntoView({block:'start'});
    });
    updateBulk();
    $$('#txTable tr.click').forEach(tr=>tr.onclick=e=>{ if (!e.target.closest('.chk')&&!e.target.closest('[data-open]')) showTxDrawer(tr.dataset.id); });
    $$('#txTable [data-open]').forEach(b=>b.onclick=()=>showTxDrawer(b.dataset.open));
    $$('#txTable .tx-chk').forEach(cb=>{
      cb.onchange=()=>{
        cb.checked?selectedTxIds.add(cb.dataset.id):selectedTxIds.delete(cb.dataset.id);
        updateBulk();
        $('#txCount').textContent=countText(rows,slice);
        const sa=$('#txSelectAll'); if (sa) sa.checked=pageIds.every(id=>selectedTxIds.has(id));
      };
    });
    const sa=$('#txSelectAll');
    if (sa) sa.onchange=()=>{ pageIds.forEach(id=>sa.checked?selectedTxIds.add(id):selectedTxIds.delete(id)); renderTable(); const s2=$('#txSelectAll'); if (s2) s2.focus(); };
  };

  $('#txSearch').oninput=debounce((e)=>{ txSearch=e.target.value; txPage=1; renderTable(); },200);
  $('#txCat').onchange=(e)=>{ txCatFilter=e.target.value; txPage=1; renderTable(); };
  $('#txSortSel').onchange=(e)=>{ const [k,d]=e.target.value.split('-'); txSort={key:k,dir:d}; txPage=1; renderTable(); };
  $('#txAmtMode').onchange=(e)=>{
    txAmtMode=e.target.value; txAmtVal=null; txAmtVal2=null; txPage=1;
    const v=$('#txAmtVal'), sep=$('#txAmtSep'), v2=$('#txAmtVal2');
    v.value=''; v.hidden=!txAmtMode; sep.hidden=txAmtMode!=='range'; v2.value=''; v2.hidden=txAmtMode!=='range';
    renderTable();
  };
  $('#txAmtVal').oninput=debounce((e)=>{ txAmtVal=e.target.value?parseFloat(e.target.value):null; txPage=1; renderTable(); },300);
  $('#txAmtVal2').oninput=debounce((e)=>{ txAmtVal2=e.target.value?parseFloat(e.target.value):null; txPage=1; renderTable(); },300);

  // Bulk edits: stored as overrides, like single edits in the drawer. `after` runs once the
  // edits are saved, before the render.
  const bulk=(fn,after)=>{
    let changed=0;
    selectedTxIds.forEach(id=>{
      const t=State.transactions.find(x=>x.id===id); if (!t) return;
      const ov=State.txOverrides[id]||{};
      fn(t,ov); State.txOverrides[id]=ov; changed++;
    });
    if (changed){ lsSet('txOverrides',State.txOverrides); if (after) after(); selectedTxIds.clear(); renderActive(); }
  };
  $('#bulkApplyCat').onclick=()=>{ const cat=$('#bulkCatSel').value; if (cat) bulk((t,ov)=>{ ov.categories=[cat]; t.categories=[cat]; }); };
  $('#bulkApplyType').onclick=()=>{
    const type=$('#bulkTypeSel').value; if (!type) return;
    // A retyped row runs detection again after the save, so the legs it was paired with are
    // checked now (v1.16.26).
    let retyped=false;
    bulk((t,ov)=>{
      if (t.type!==type||ov.type!==type) retyped=true;
      ov.type=type;
      if (type==='transfer') {
        const existing=ov.categories||t.categories||[];
        if (!existing.includes('Transfer in')&&!existing.includes('Transfer out')) { ov.categories=[t.amount<0?'Transfer out':'Transfer in']; t.categories=ov.categories; }
      } else {
        // Not a transfer: Transfer out / Transfer in go from the edit and the row, as in the
        // drawer (v1.16.26); a row left with none shows its own category (ownCategories()).
        if (ov.categories) { ov.categories=withoutDirection(ov.categories); if (!ov.categories.length) delete ov.categories; }
        if (withoutDirection(t.categories).length!==t.categories.length) t.categories=ownCategories(t,ov);
      }
      t.type=type;
    },()=>{ if (retyped) redetectTransfers(); });
  };
  $('#bulkMarkBill').onclick=()=>bulk((t,ov)=>{ ov.isBill=true; t.isBill=true; });
  $('#bulkMarkSub').onclick=()=>bulk((t,ov)=>{ ov.isSubscription=true; t.isSubscription=true; });
  $('#bulkClear').onclick=()=>{ selectedTxIds.clear(); renderTable(); };

  $('#txExport').onclick=()=>{
    const r=filteredTx();
    const csv=Papa.unparse(r.map(t=>({Date:dayjs(t.date).format('YYYY-MM-DD'),Account:acctName(t.account),Description:t.description,Categories:(t.categories||[t.category]).join(';'),Amount:t.amount,Type:t.type,Subscription:t.isSubscription?'Yes':'',Balance:t.balance,Notes:t.notes||''})));
    downloadFile('transactions.csv',csv,'text/csv');
  };
  renderTable();

  /* ---- Transaction rules ---- */
  const rules=State.txRules||[];
  const groups=[];
  rules.forEach(r=>{
    const k=(r.contains||'').toLowerCase();
    let g=groups.find(x=>x.k===k);
    if (!g) groups.push(g={k,contains:r.contains,flags:[]});
    if (!g.flags.includes(r.flag)) g.flags.push(r.flag);
  });
  const matchCount=(c)=>{ const u=c.toUpperCase(); return State.transactions.filter(t=>(t._originalDesc||t.description||'').toUpperCase().includes(u)).length; };
  const rulesSec=document.createElement('section');
  rulesSec.className='panel';
  rulesSec.id='txRules';
  rulesSec.setAttribute('aria-labelledby','txRulesH');
  rulesSec.innerHTML=`
    <div><h2 id="txRulesH" tabindex="-1">Transaction rules</h2><p class="sub">Flag matching transactions automatically, now and on every future import.</p></div>
    ${groups.length?`<div>${groups.map((g,i)=>`<div class="rule-row"><span class="k">Contains</span><code class="code-tag">${escapeHtml(g.contains)}</code><span class="k" aria-hidden="true">→</span>${g.flags.map(f=>`<span class="pill accent">${FLAG_LABEL[f]||escapeHtml(f)}</span>`).join('')}<span class="grow"></span><span class="m">${plural(matchCount(g.contains),'match','matches')}</span><button type="button" class="icon-x" data-rule-del="${i}" aria-label="Delete rule ${escapeHtml(g.contains)}">×</button></div>`).join('')}</div>`
      :'<p class="empty-note" style="padding:8px 0;text-align:left">No rules yet. Add one below, e.g. NETFLIX → Subscription.</p>'}
    <div class="form-row">
      <label class="field" style="flex:1 1 240px">When description contains<input class="input" id="txRuleContains" placeholder="e.g. LIBERTY INTERNET"></label>
      <label class="field">Flag as<select class="select" id="txRuleFlag"><option value="bill">Bill</option><option value="recurring">Recurring</option><option value="subscription">Subscription</option></select></label>
      <button type="button" class="btn ghost" id="txRuleAdd">Add rule</button>
    </div>`;
  root.appendChild(rulesSec);
  $('#txRulesJump').onclick=(e)=>{ e.preventDefault(); rulesSec.scrollIntoView({behavior:'smooth',block:'start'}); $('#txRulesH').focus({preventScroll:true}); };
  const addRule=()=>{
    const inp=$('#txRuleContains');
    const contains=inp.value.trim();
    const flag=$('#txRuleFlag').value;
    if (!contains){ inp.setAttribute('aria-invalid','true'); inp.focus(); return; }
    if (!State.txRules) State.txRules=[];
    if (!State.txRules.some(r=>r.contains.toLowerCase()===contains.toLowerCase()&&r.flag===flag)) {
      State.txRules.push({contains,flag});
      lsSet('txRules',State.txRules);
      applyTxRulesToAll();
    }
    renderActive();
    const again=$('#txRuleContains'); if (again) again.focus({preventScroll:true});
  };
  $('#txRuleAdd').onclick=addRule;
  $('#txRuleContains').onkeydown=(e)=>{ if (e.key==='Enter'){ e.preventDefault(); addRule(); } };
  $$('[data-rule-del]',rulesSec).forEach(btn=>btn.onclick=()=>{
    const g=groups[+btn.dataset.ruleDel];
    State.txRules=(State.txRules||[]).filter(r=>(r.contains||'').toLowerCase()!==g.k);
    lsSet('txRules',State.txRules);
    applyTxRulesToAll();
    renderActive();
  });
});

/* ---- Transaction detail drawer ---- */
function showTxDrawer(id) {
  const t=State.transactions.find(x=>x.id===id);
  if (!t) return;
  const ov=State.txOverrides[t.id]||{};
  const cur=t.categories&&t.categories.length?t.categories:[t.category];
  const opts=[...new Set([...State.categories,...cur])];
  const extra=cur.slice(1);
  // Links point at a budget, bucket or debt by its id (v1.16.7). One to an item that's
  // gone shows as None, and saving drops it.
  ensurePlanIds();
  const lnk=ov.link&&planItem(ov.link.type,ov.link.id)?ov.link:null;
  const canLink=State.budgets.length||State.buckets.length||State.debts.length;
  const linkItems=(type)=>PLAN_LINK_TYPES[type]?State[PLAN_LINK_TYPES[type][0]]||[]:[];
  const linkOpts=(type,sel)=>linkItems(type).map((item,i)=>`<option value="${escapeHtml(item.id)}" ${item.id===sel?'selected':''}>${escapeHtml(item.name||item.merchant||item.category||'#'+i)}</option>`).join('');
  // The flags as the boxes show them on opening: the edit, else the rules (txFlags()). Saving
  // stores only a box changed from this, so the others keep following the rules, or keep an
  // edit already stored (CLAUDE.md §4.2). Until v1.16.9 every save stored all three.
  const flagBoxes=[['isBill','dBill'],['isRecurring','dRec'],['isSubscription','dSub']];
  const shown={ isBill:!!t.isBill, isRecurring:!!t.isRecurring, isSubscription:!!t.isSubscription };
  openDrawer(`<div class="dform">
    <div class="sum-box">
      <span class="amt ${t.amount>0?'c-good':''}">${fmtSigned(t.amount)}</span>
      <span class="meta">${dayjs(t.date).format('dddd, MMM D, YYYY')} · ${escapeHtml(acctName(t.account))}</span>
      <span class="orig">Original: <code>${escapeHtml(t._originalDesc||t.description)}</code></span>
    </div>
    <label class="field">Description<input class="input" id="dDesc" value="${escapeHtml(t.description)}"></label>
    <div class="field-row">
      <label class="field">Category<select class="select" id="dCat">${opts.map(c=>`<option value="${escapeHtml(c)}" ${c===cur[0]?'selected':''}>${escapeHtml(c)}</option>`).join('')}</select></label>
      <label class="field">Type<select class="select" id="dType">
        ${[['debit','Expense'],['credit','Income / refund'],['transfer','Transfer'],['payment','Card payment']].map(([v,l])=>`<option value="${v}" ${t.type===v?'selected':''}>${l}</option>`).join('')}
      </select></label>
    </div>
    <details class="more-cats"${extra.length?' open':''}>
      <summary>Also count it under other categories${extra.length?` (${extra.length})`:''}</summary>
      <div class="opts">${opts.map(c=>`<label class="check"><input type="checkbox" class="dCatCheck" value="${escapeHtml(c)}" ${extra.includes(c)?'checked':''}> ${escapeHtml(c)}</label>`).join('')}</div>
    </details>
    <fieldset class="flag-set"><legend>Flags</legend>
      <label class="check-chip"><input type="checkbox" id="dBill" ${shown.isBill?'checked':''}>Bill</label>
      <label class="check-chip"><input type="checkbox" id="dRec" ${shown.isRecurring?'checked':''}>Recurring</label>
      <label class="check-chip"><input type="checkbox" id="dSub" ${shown.isSubscription?'checked':''}>Subscription</label>
    </fieldset>
    <label class="field">Notes<textarea class="textarea" id="dNotes" rows="3" placeholder="Add a note">${escapeHtml(t.notes||'')}</textarea></label>
    ${canLink?`<div class="field"><span id="dLinkLbl">Link to a budget, bucket or debt</span>
      <div class="field-row">
        <select class="select" id="dLinkType" aria-labelledby="dLinkLbl">
          <option value="">None</option>
          ${State.budgets.length?`<option value="budget" ${lnk?.type==='budget'?'selected':''}>Budget</option>`:''}
          ${State.buckets.length?`<option value="bucket" ${lnk?.type==='bucket'?'selected':''}>Bucket</option>`:''}
          ${State.debts.length?`<option value="debt" ${lnk?.type==='debt'?'selected':''}>Debt</option>`:''}
        </select>
        <select class="select" id="dLinkTarget" aria-label="Which one" ${lnk?'':'hidden'}>${lnk?linkOpts(lnk.type,lnk.id):''}</select>
      </div></div>`:''}
    <p class="drawer-note">Edits are stored separately from the imported row, so re-importing the CSV never overwrites them.</p>
  </div>`,{ title:'Transaction detail',
    footer:`<span class="grow"></span><button type="button" class="btn ghost lg" onclick="closeDrawer()">Cancel</button><button type="button" class="btn lg" id="dSave">Save changes</button>` });
  // The fields as the form shows them on opening, read back from it. Saving stores a field
  // only when it's changed from this, as the flags above (v1.16.16). An untouched type keeps
  // following the transfer keywords and an untouched category the category rules, or each
  // keeps an edit already stored (CLAUDE.md §4.1). Until v1.16.15 every save stored all four.
  const fields=()=>{
    const primary=$('#dCat').value;
    return { description:$('#dDesc').value, notes:$('#dNotes').value, type:$('#dType').value,
             categories:[primary,...$$('.dCatCheck:checked').map(cb=>cb.value).filter(c=>c!==primary)] };
  };
  const opened=fields();
  const lt=$('#dLinkType');
  if (lt) lt.onchange=()=>{
    const tgt=$('#dLinkTarget');
    tgt.innerHTML=lt.value?linkOpts(lt.value,null):'';
    tgt.hidden=!lt.value;
  };
  $('#dSave').onclick=()=>{
    const o=State.txOverrides[t.id]||{};
    const now=fields();
    const same=(a,b)=>a.length===b.length&&a.every((c,i)=>c===b[i]);
    storeChangedText(t,o,opened,now);
    const typeChanged=now.type!==opened.type;
    if (typeChanged) { o.type=now.type; t.type=now.type; }
    let cats=now.categories;
    const catsChanged=!same(cats,opened.categories);
    if (now.type==='transfer') {
      // A transfer needs its direction as a category so the Transfers screen picks it up.
      // Checked only when you change the type or the categories, so neither is stored unchanged.
      if ((typeChanged||catsChanged)&&!cats.includes('Transfer in')&&!cats.includes('Transfer out')) cats=[t.amount<0?'Transfer out':'Transfer in'];
      if (!same(cats,opened.categories)) { o.categories=cats; t.categories=[...cats]; }
    } else if (typeChanged||catsChanged) {
      // Not a transfer: no Transfer out / Transfer in (v1.16.26). They go from the categories
      // you chose, or from the edit when you changed only the type. When none is left, the row
      // shows its own category (ownCategories(), core.js: Re-categorize all's, else the CSV's),
      // and nothing is stored, so it keeps following the rules. Before v1.16.26 a type changed
      // away from Transfer kept Transfer out / in: in memory, in finlens-state.json, and in the
      // edit when you changed the categories too.
      if (catsChanged) o.categories=withoutDirection(cats);
      else if (o.categories) o.categories=withoutDirection(o.categories);
      if (o.categories&&!o.categories.length) delete o.categories;
      t.categories=ownCategories(t,o);
    }
    for (const [key,box] of flagBoxes) { const v=$('#'+box).checked; if (v!==shown[key]) o[key]=v; }
    const linkType=lt?lt.value:'';
    const linkId=linkType?$('#dLinkTarget').value:'';
    if (linkType&&planItem(linkType,linkId)) o.link={ type:linkType, id:linkId };
    else delete o.link;
    // An edit with nothing left in it goes, as unlinkPlanItems() does.
    if (Object.keys(o).length) State.txOverrides[t.id]=o; else delete State.txOverrides[t.id];
    lsSet('txOverrides',State.txOverrides);
    Object.assign(t, txFlags(t._originalDesc||t.description, o));
    // A type you set takes the row out of transfer detection, so the leg it was paired with is
    // checked again now (v1.16.26), not at the next import, keyword change or reload.
    if (typeChanged) redetectTransfers();
    closeDrawer(); renderActive();
  };
}

// The Description and Notes fields of the transaction and transfer drawers (v1.16.16).
// Stores each in edit `o` only when it's changed from what the field showed on opening
// (`was`), and updates `t` to match. An emptied description means the original one. A
// description changed back to the original, or a note emptied, is removed from the edit
// instead: it would show the same as no edit at all.
function storeChangedText(t, o, was, now) {
  const desc=(v)=>v.trim()||t._originalDesc;
  if (desc(now.description)!==desc(was.description)) {
    const d=desc(now.description);
    if (d===t._originalDesc) delete o.description; else o.description=d;
    t.description=d;
  }
  if (now.notes!==was.notes) {
    if (now.notes) o.notes=now.notes; else delete o.notes;
    t.notes=now.notes;
  }
}

/* =================== INCOME =================== */
let incomeShowAll=false;
const SOURCE_HUES=['accent','warn','teal','pink','sky'];

registerView('income','Income',(root)=>{
  txPillFilter='income';
  wireLinks(root);
  wireTxOpeners(root);
  pageActions(root,'Transfers and card payments excluded','');
  renderTxPills(root,'income');
  const all=filteredTx();
  const inc=all.filter(t=>t.amount>0&&t.type!=='transfer'&&t.type!=='payment').sort((a,b)=>b.date-a.date);
  if (!inc.length){ appendHtml(root,emptyPanel(`No income in ${escapeHtml(rangeText())}.`)); return; }
  const total=sumIncome(all);
  const span=dataSpan(all);
  const interest=inc.filter(t=>/interest/i.test(t.description)||t.category==='Interest');
  const refunds=inc.filter(t=>/refund|return/i.test(t._originalDesc||t.description)||['Returns','Refunds','Refund'].includes(t.category)||State.accounts[t.account]?.kind==='credit_card');
  const sumOf=a=>a.reduce((s,t)=>s+t.amount,0);
  const intAccts=[...new Set(interest.map(t=>acctName(t.account)))];
  appendHtml(root,kpiTiles([
    {label:'Total income',value:fmt(total),cls:'c-good',sub:plural(inc.length,'deposit')},
    {label:'Average per month',value:fmt(total/Math.max(1,span.months)),sub:span.days>=45?`Over ${span.months.toFixed(1)} months`:`Over ${plural(span.days,'day')}`},
    {label:'Interest earned',value:fmt(sumOf(interest)),sub:interest.length?`${escapeHtml(intAccts.join(', '))} · ${plural(interest.length,'payment')}`:'None in this period'},
    {label:'Returns &amp; refunds',value:fmt(sumOf(refunds)),sub:refunds.length?`${plural(refunds.length,'refund')} · ${refunds.length===1?'':'latest '}${dayjs(refunds[0].date).format('MMM D')}`:'None in this period'},
  ]));

  /* ---- by source + monthly ---- */
  const bySrc={};
  inc.forEach(t=>{ const k=depositKey(t.description)||t.description; (bySrc[k]=bySrc[k]||{name:k,amount:0,count:0}); bySrc[k].amount+=t.amount; bySrc[k].count++; });
  let srcs=Object.values(bySrc).sort((a,b)=>b.amount-a.amount);
  if (srcs.length>5) { const rest=srcs.slice(4); srcs=[...srcs.slice(0,4),{name:'Everything else',amount:rest.reduce((s,x)=>s+x.amount,0),count:rest.reduce((s,x)=>s+x.count,0),other:true}]; }
  const srcTotal=srcs.reduce((s,x)=>s+x.amount,0)||1;
  const hueOf=(x,i)=>x.other?'neutral':SOURCE_HUES[i];
  const share=x=>(x.amount/srcTotal*100);
  const months=monthlyFlow(all).slice(-12);
  const maxIn=Math.max(1,...months.map(m=>m.income));
  const lastAll=dataSpan(State.transactions).last;
  const partial=(m)=>{ const end=endOfMonth(m.date); return monthKey(m.date)===monthKey(lastAll)&&lastAll.getDate()<end.getDate(); };
  const top=months.reduce((p,m)=>m.income>p.income?m:p,months[0]);
  const topCount=top?top.txs.filter(t=>t.amount>0&&t.type!=='transfer'&&t.type!=='payment').length:0;
  const row=document.createElement('div'); row.className='cols-3';
  row.innerHTML=`
    <section class="panel" aria-labelledby="inSrcH">
      <h2 id="inSrcH">Income by source</h2>
      <div class="stack" role="img" aria-label="${escapeHtml(srcs.map(x=>`${x.name} ${share(x).toFixed(1)}%`).join(', '))} of income">${srcs.map((x,i)=>`<span class="hue-${hueOf(x,i)}" style="width:${share(x).toFixed(2)}%"></span>`).join('')}</div>
      <div class="src-list">${srcs.map((x,i)=>`<div><i class="sw hue-${hueOf(x,i)}"></i><span class="who"><b>${escapeHtml(x.name)}</b><span>${share(x).toFixed(1)}% · ${plural(x.count,'deposit')}</span></span><span class="amt" style="font-weight:600">${fmt(x.amount)}</span></div>`).join('')}</div>
    </section>
    <section class="panel span-2" aria-labelledby="inMoH">
      <div class="panel-head"><h2 id="inMoH">Monthly income</h2>${months.length>1&&top?`<span class="aside">Highest: ${dayjs(top.date).format('MMMM')}, ${plural(topCount,'deposit')}</span>`:''}</div>
      <div class="bars tall" role="img" aria-label="Monthly income: ${months.map(m=>`${dayjs(m.date).format('MMMM')} ${fmt0(m.income)}${partial(m)?' so far':''}`).join(', ')}">
        ${months.map(m=>`<div class="col"><span class="v">${fmt0(m.income)}</span><div class="bar hue-${partial(m)?'dim':'accent'}" style="height:${(m.income/maxIn*84).toFixed(1)}%" title="${dayjs(m.date).format('MMMM YYYY')}: ${fmt(m.income)}"></div></div>`).join('')}
      </div>
      <div class="bars-x">${months.map(m=>`<span>${dayjs(m.date).format('MMM')}${partial(m)?` · to the ${ordinal(lastAll.getDate())}`:''}</span>`).join('')}</div>
    </section>`;
  root.appendChild(row);

  /* ---- recurring deposits ---- */
  const rec=recurringDepositsDetail(inc);
  const confPill={High:'good',Medium:'warn',Low:''};
  appendHtml(root,`<section class="panel" aria-labelledby="inRecH">
    <div><h2 id="inRecH">Recurring deposits</h2><p class="sub">Detected from deposits with a steady amount and rhythm</p></div>
    ${rec.length?`<div class="table-scroll"><table class="tbl flush mw-760">
      <thead><tr><th scope="col">Source</th><th scope="col">Frequency</th><th scope="col">Deposits</th><th scope="col">Last</th><th scope="col">Next expected</th><th scope="col">Confidence</th><th scope="col" class="r">Typical amount</th></tr></thead>
      <tbody>${rec.map(r=>`<tr>
        <td><div class="strong" style="font-weight:600">${escapeHtml(r.source)}</div>${r.account?`<div class="s2">${escapeHtml(acctName(r.account))}</div>`:''}</td>
        <td>${FREQ_LABEL[r.freq]||r.freq}</td><td>${r.count}</td>
        <td class="dim nowrap">${dayjs(r.last).format('MMM D')}</td>
        <td class="dim nowrap">${r.next?dayjs(r.next).format('MMM D'):'—'}</td>
        <td><span class="pill ${confPill[r.confidence]}">${r.confidence}</span></td>
        <td class="r strong nowrap">${r.steady?'':'~'}${fmt(r.avg)}</td></tr>`).join('')}</tbody></table></div>`
      :'<p class="empty-note">No deposits with a regular rhythm in this period.</p>'}
  </section>`);

  /* ---- all deposits ---- */
  const shown=incomeShowAll?inc:inc.slice(0,6);
  const depSec=document.createElement('section');
  depSec.className='panel';
  depSec.setAttribute('aria-labelledby','inDepH');
  depSec.innerHTML=`<div class="panel-head"><h2 id="inDepH">All deposits</h2><span class="aside">Newest first · ${plural(inc.length,'deposit')}</span></div>
    <div class="table-scroll"><table class="tbl flush mw-520 fit-sm"><caption class="sr-only">Deposits, newest first</caption>
      <thead class="sr-only"><tr><th scope="col">Date</th><th scope="col">Description</th><th scope="col">Account</th><th scope="col">Amount</th></tr></thead>
      <tbody>${shown.map(t=>`<tr><td class="dim nowrap w-date">${dayjs(t.date).format('MMM D')}</td>
        <td><button type="button" class="link-btn" data-open="${escapeHtml(t.id)}">${escapeHtml(t.description)}</button></td>
        <td class="dim nowrap hide-sm">${escapeHtml(acctName(t.account))}</td>
        <td class="r strong nowrap c-good w-amt">${fmtSigned(t.amount)}</td></tr>`).join('')}</tbody></table></div>
    ${inc.length>6?`<button type="button" class="btn text" id="inShowAll" aria-expanded="${incomeShowAll}" style="align-self:flex-start;padding:0">${incomeShowAll?'Show fewer':`Show all ${inc.length} deposits →`}</button>`:''}`;
  root.appendChild(depSec);
  const sa=$('#inShowAll',depSec);
  if (sa) sa.onclick=()=>{ incomeShowAll=!incomeShowAll; renderActive(); const b=$('#inShowAll'); if (b) b.focus({preventScroll:true}); };
});

/* =================== SPENDING =================== */
let spendingDrillCategory=null;

registerView('spending','Spending',(root)=>{
  txPillFilter='spending';
  wireLinks(root);
  wireTxOpeners(root);
  pageActions(root,'Transfers and card payments excluded','');
  renderTxPills(root,'spending');
  const all=filteredTx();
  const txs=all.filter(t=>t.amount<0&&t.type!=='transfer').sort((a,b)=>b.date-a.date);
  if (!txs.length){ appendHtml(root,emptyPanel(`No spending in ${escapeHtml(rangeText())}.`)); renderCategoryRules(root); return; }
  const total=sumExpense(all);
  const span=dataSpan(all);
  const cats=byCategory(all,'expense');
  const months=monthlyFlow(all).filter(m=>m.expense>0);
  const avgMonth=months.reduce((s,m)=>s+m.expense,0)/Math.max(1,months.length);
  const hi=months.reduce((p,m)=>m.expense>p.expense?m:p,months[0]);
  const above=avgMonth?(hi.expense/avgMonth-1):0;
  appendHtml(root,kpiTiles([
    {label:'Total spent',value:fmt(total),sub:plural(txs.length,'transaction')},
    {label:'Average per day',value:fmt(total/span.days),sub:`Over ${plural(span.days,'day')}`},
    {label:'Top category',value:escapeHtml(cats[0].category),sub:`${fmt(cats[0].amount)} · ${pctStr(cats[0].amount/total)} of spending`},
    {label:'Highest month',value:dayjs(hi.date).format('MMMM'),sub:months.length>1?`${fmt0(hi.expense)} · ${pctStr(Math.abs(above))} ${above>=0?'above':'below'} average`:`${fmt0(hi.expense)} · the only month`},
  ]));

  /* ---- by category + drill-down ---- */
  if (!cats.some(c=>c.category===spendingDrillCategory)) spendingDrillCategory=cats[0].category;
  const max=cats[0].amount||1;
  const row=document.createElement('div'); row.className='cols-3';
  row.innerHTML=`
    <section class="panel span-2" aria-labelledby="spCatH">
      <div class="panel-head"><h2 id="spCatH">By category</h2><span class="aside">Select a category to see its transactions</span></div>
      <div class="catlist">${cats.map((c,i)=>`<button type="button" class="catbtn" data-cat-i="${i}" aria-pressed="${c.category===spendingDrillCategory}">
        <span class="n">${escapeHtml(c.category)}</span>
        <span class="track" aria-hidden="true"><span style="width:${Math.max(1.5,c.amount/max*100).toFixed(1)}%"></span></span>
        <span class="a">${fmt(c.amount)}</span><span class="p">${pctStr(c.amount/total,1)}</span></button>`).join('')}</div>
    </section>
    <section class="panel" aria-labelledby="spDrH" aria-live="polite" id="spDrill"></section>`;
  root.appendChild(row);
  const drawDrill=()=>{
    const c=cats.find(x=>x.category===spendingDrillCategory);
    const list=txs.filter(t=>(t.categories||[t.category]).includes(c.category));
    $('#spDrill').innerHTML=`
      <div><span class="eyebrow">Drill-down</span><h2 id="spDrH" class="drill-title">${escapeHtml(c.category)}</h2><p class="sub" style="font-size:14px;color:var(--text-2)">${fmt(c.amount)} · ${plural(list.length,'transaction')}</p></div>
      <div class="rows">${list.slice(0,8).map(t=>`<div class="r"><span class="d" style="width:52px;font-size:13px">${dayjs(t.date).format('MMM D')}</span><button type="button" class="link-btn t" data-open="${escapeHtml(t.id)}">${escapeHtml(t.description)}</button><span class="amt">${fmtSigned(t.amount)}</span></div>`).join('')}</div>
      ${list.length>8?`<p class="sub" style="margin:0">${list.length-8} more in Transactions</p>`:''}
      <a class="more-link end" href="#transactions" data-goto="transactions" data-pill="all" data-cat="${escapeHtml(c.category)}">Open in Transactions →</a>`;
  };
  drawDrill();
  $$('[data-cat-i]',row).forEach(b=>b.onclick=()=>{
    spendingDrillCategory=cats[+b.dataset.catI].category;
    $$('[data-cat-i]',row).forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    drawDrill();
    // one column: the drill-down sits below the list, so bring it into view
    if (getComputedStyle(row).gridTemplateColumns.split(' ').length===1) $('#spDrill').scrollIntoView({behavior:'smooth',block:'start'});
  });

  /* ---- daily heatmap + monthly trend ---- */
  const r=State.range;
  let hmStart=new Date(Math.max(span.first.getTime(), r.start?r.start.getTime():-Infinity));
  const hmEnd=new Date(Math.min(span.last.getTime(), r.end?r.end.getTime():Infinity));
  if (hmEnd-hmStart>370*DAY) hmStart=new Date(hmEnd.getTime()-370*DAY);
  const lastAll=dataSpan(State.transactions).last;
  const lastM=months[months.length-1];
  const lastPartial=lastM&&monthKey(lastM.date)===monthKey(lastAll)&&lastAll.getDate()<endOfMonth(lastAll).getDate();
  // Which category pushed the highest month up the most, against its own monthly average
  let why='';
  if (months.length>1) {
    const catAvg={};
    months.forEach(m=>byCategory(m.txs,'expense').forEach(c=>{ catAvg[c.category]=(catAvg[c.category]||0)+c.amount/months.length; }));
    const ex=byCategory(hi.txs,'expense').map(c=>({c:c.category,d:c.amount-(catAvg[c.category]||0)})).sort((a,b)=>b.d-a.d)[0];
    if (ex&&ex.d>0) why=` ${dayjs(hi.date).format('MMMM')} ran high on ${escapeHtml(ex.c)}.`;
  }
  const row2=document.createElement('div'); row2.className='cols-3';
  row2.innerHTML=`
    <section class="panel span-2" aria-labelledby="spHmH">
      <div class="panel-head"><h2 id="spHmH">Daily spending</h2><span class="aside">Darker days cost more</span></div>
      ${dailyHeatmapHtml(txs,hmStart,hmEnd)}
      <div class="hm-legend" aria-hidden="true"><span>Less</span>${[0,1,2,3,4,5].map(l=>`<span class="hm-cell l${l}"></span>`).join('')}<span>More</span></div>
    </section>
    <section class="panel" aria-labelledby="spTrH">
      <h2 id="spTrH">Monthly trend</h2>
      <div id="spTrend"></div>
      <p class="trend-note">${lastPartial?`${dayjs(lastM.date).format('MMMM')} is partial (through the ${ordinal(lastAll.getDate())}).`:''}${why}</p>
    </section>`;
  root.appendChild(row2);
  const tr=$('#spTrend');
  if (months.length>1) {
    const hiIdx=months.indexOf(hi);
    const w=Math.max(280,Math.min(420,Math.round(tr.clientWidth||360)));
    tr.innerHTML=svgLineChart(months.map(m=>({v:m.expense,tip:`${dayjs(m.date).format('MMMM YYYY')}: ${fmt(m.expense)}`})),
      { w, h:200, hue:'warn', valueAt:hiIdx, hollowLast:lastPartial, xLabels:months.map((m,i)=>({i,text:dayjs(m.date).format('MMM')})),
        ariaLabel:`Monthly spending: ${months.map((m,i)=>`${dayjs(m.date).format('MMMM')} ${fmt0(m.expense)}${i===months.length-1&&lastPartial?' so far':''}`).join(', ')}` });
  } else tr.innerHTML=`<p class="empty-note">One month of data so far.</p>`;

  /* ---- top merchants + category rules ---- */
  const merch={};
  txs.forEach(t=>{
    const k=(t.description||'').replace(/\d+/g,'').replace(/\s+/g,' ').trim().slice(0,40)||t.description;
    const m=merch[k]=merch[k]||{name:k,amount:0,count:0,cats:{}};
    m.amount+=Math.abs(t.amount); m.count++; m.cats[t.category]=(m.cats[t.category]||0)+1;
  });
  const topM=Object.values(merch).sort((a,b)=>b.amount-a.amount).slice(0,7);
  const row3=document.createElement('div'); row3.className='cols-3';
  row3.innerHTML=`
    <section class="panel span-2" aria-labelledby="spTmH">
      <h2 id="spTmH">Top merchants</h2>
      <div class="table-scroll"><table class="tbl flush mw-520 fit-sm">
        <thead><tr><th scope="col">Merchant</th><th scope="col" class="hide-sm">Category</th><th scope="col" class="r w-num">Visits</th><th scope="col" class="r w-amt">Total</th></tr></thead>
        <tbody>${topM.map(m=>`<tr><td class="strong">${escapeHtml(m.name)}</td><td class="dim hide-sm">${escapeHtml(Object.entries(m.cats).sort((a,b)=>b[1]-a[1])[0][0])}</td><td class="r">${m.count}</td><td class="r strong nowrap">${fmt(m.amount)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>`;
  root.appendChild(row3);
  renderCategoryRules(row3);
});

// Category rules: "description contains X → category Y". Applied on import, or to
// everything with Re-categorize all (ui.js addCatRule / delCatRule / recategorizeAll).
function renderCategoryRules(parent) {
  const rules=State.categoryRules||[];
  const sec=document.createElement('section');
  sec.className='panel';
  sec.setAttribute('aria-labelledby','spRuleH');
  sec.innerHTML=`
    <div><h2 id="spRuleH">Category rules</h2><p class="sub">Teach FinLens your merchants. Rules apply to every import.</p></div>
    ${rules.length?`<div>${rules.map((r,i)=>`<div class="rule-row" style="padding:4px 0;border:0;font-size:13px"><code class="code-tag" style="font-size:12px">${escapeHtml(r.contains)}</code><span class="k">→ ${escapeHtml(r.category)}</span><span class="grow"></span><button type="button" class="icon-x" data-catrule-del="${i}" aria-label="Delete rule ${escapeHtml(r.contains)}">×</button></div>`).join('')}</div>`
      :'<p class="sub" style="margin:0">No rules yet.</p>'}
    <label class="field" style="font-weight:500">Description contains<input class="input" id="ruleContains" placeholder="e.g. CHIPOTLE"></label>
    <label class="field" style="font-weight:500">Category<select class="select" id="ruleCat">${State.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select></label>
    <div class="form-row"><button type="button" class="btn lg" id="ruleAdd">Add rule</button><button type="button" class="btn ghost lg" id="ruleReapply">Re-categorize all</button></div>`;
  parent.appendChild(sec);
  $('#ruleAdd').onclick=()=>{ const i=$('#ruleContains'); if (!i.value.trim()){ i.setAttribute('aria-invalid','true'); i.focus(); return; } addCatRule(); };
  $('#ruleContains').onkeydown=(e)=>{ if (e.key==='Enter'){ e.preventDefault(); $('#ruleAdd').click(); } };
  $('#ruleReapply').onclick=()=>recategorizeAll();
  $$('[data-catrule-del]',sec).forEach(b=>b.onclick=()=>delCatRule(+b.dataset.catruleDel));
}

/* =================== BILLS =================== */
let billsCalOpen=true;
let billFormOpen=false;

registerView('bills','Bills & subscriptions',(root)=>{
  txPillFilter='bills';
  wireLinks(root);
  pageActions(root,'Recurring charges, due dates and what FinLens has spotted',
    `<button type="button" class="btn lg" id="billAddBtn" aria-expanded="${billFormOpen}" aria-controls="billForm">+ Add bill</button>`);
  renderTxPills(root,'bills');
  $('#billAddBtn').onclick=()=>{ billFormOpen=!billFormOpen; renderActive(); const f=billFormOpen?$('#nbName'):$('#billAddBtn'); if (f) f.focus(); };

  const bills=State.bills||[];
  const t0=today();
  const daysTo=(d)=>Math.round((new Date(d.getFullYear(),d.getMonth(),d.getDate())-t0)/DAY);

  /* ---- new bill form ---- */
  if (billFormOpen) {
    appendHtml(root,`<section class="panel bill-form" id="billForm" aria-labelledby="billFormH">
      <h2 id="billFormH">New bill</h2>
      <div class="bf-grid">
        <label class="field wide">Name<input class="input" id="nbName" placeholder="e.g. Car insurance" autocomplete="off"></label>
        <label class="field">Amount<input class="input" id="nbAmt" type="number" step="0.01" inputmode="decimal" placeholder="0.00"></label>
        <label class="field">Due day<input class="input" id="nbDay" type="number" min="1" max="31" value="15"></label>
        <label class="field">Repeats<select class="select" id="nbFreq">${_billFreqOptions('Monthly')}</select></label>
        <label class="field">Pays from<select class="select" id="nbAcct">${_billAccountOptions('')}</select></label>
      </div>
      <div class="bf-acts"><button type="button" class="btn ghost lg" id="nbCancel">Cancel</button><button type="button" class="btn lg" id="nbSave">Save bill</button></div>
    </section>`);
    $('#nbCancel').onclick=()=>{ billFormOpen=false; renderActive(); const b=$('#billAddBtn'); if (b) b.focus(); };
    $('#nbSave').onclick=()=>{
      const name=$('#nbName').value.trim();
      if (!name){ $('#nbName').setAttribute('aria-invalid','true'); $('#nbName').focus(); return; }
      const day=Math.min(31,Math.max(1,parseInt($('#nbDay').value,10)||1));
      // first due date: that day this month if it hasn't passed, otherwise next month
      const clamp=(y,m)=>new Date(y,m,Math.min(day,new Date(y,m+1,0).getDate()));
      let due=clamp(t0.getFullYear(),t0.getMonth());
      if (due<t0) due=clamp(t0.getFullYear(),t0.getMonth()+1);
      addBill({ merchant:name, amount:parseFloat($('#nbAmt').value)||0, frequency:$('#nbFreq').value,
        dueDate:dayjs(due).format('YYYY-MM-DD'), category:'Bills & Utilities', paid:false, source:'manual', account:$('#nbAcct').value });
      billFormOpen=false;
      renderActive();
      const b=$('#billAddBtn'); if (b) b.focus();
    };
  }

  /* ---- KPIs ---- */
  const subs=bills.filter(billIsSubscription);
  const perMonth=bills.reduce((s,b)=>s+(Number(b.amount)||0)*billFreq(b).perMonth,0);
  const subsMonth=subs.reduce((s,b)=>s+(Number(b.amount)||0)*billFreq(b).perMonth,0);
  const allSpan=dataSpan(State.transactions);
  const pay=allSpan?sumIncome(State.transactions)/Math.max(1,allSpan.months):0;
  const withDue=bills.map((b,i)=>({b,i,due:billNextDue(b)}));
  const week=withDue.filter(x=>!x.b.paid&&daysTo(x.due)>=0&&daysTo(x.due)<=7);
  const overdue=withDue.filter(x=>!x.b.paid&&daysTo(x.due)<0);
  const dueToday=week.filter(x=>daysTo(x.due)===0);
  const weekNote=[plural(week.length,'bill')];
  if (dueToday.length) weekNote.push(`${escapeHtml(dueToday[0].b.merchant)} ${dueToday.length>1?`and ${dueToday.length-1} more are`:'is'} due today`);
  if (overdue.length) weekNote.push(`${overdue.length} overdue`);
  appendHtml(root,kpiTiles([
    {label:'Bills tracked',value:String(bills.length),sub:subs.length?`${subs.length} ${subs.length===1?'is a subscription':'are subscriptions'}`:'No subscriptions'},
    {label:'Per month',value:fmt(perMonth),sub:pay>0&&perMonth>0?`${pctStr(perMonth/pay)} of take-home pay`:'All bills, as a monthly cost'},
    {label:'Due in the next 7 days',value:fmt(week.reduce((s,x)=>s+(Number(x.b.amount)||0),0)),sub:weekNote.join(' · ')},
    {label:'Subscriptions',value:`${fmt(subsMonth)}<small>/mo</small>`,sub:`${fmt(subsMonth*12)} a year`},
  ]));

  /* ---- spotted recurring charges ---- */
  const recurring=detectRecurring();
  const billKeys=new Set(bills.map(b=>b.recurringKey||recurringKey(b.merchant)));
  const charges=State.transactions.filter(t=>t.amount<0&&t.type!=='transfer');
  const sugHtml=recurring.map((r,i)=>{
    const items=charges.filter(t=>recurringKey(t._originalDesc||t.description)===r.key);
    const steady=items.every(t=>Math.abs(Math.abs(t.amount)-r.avg)<0.005);
    const pattern=r.freq==='Monthly'?`Monthly, around the ${ordinal(medianDay(items.map(t=>t.date))||r.lastSeen.getDate())}`:FREQ_LABEL[r.freq]||r.freq;
    const conf=Math.round(r.confidence*100);
    const state=billKeys.has(r.key)?'confirmed':State.recurringConfirmed[r.key]==='dismissed'?'dismissed':'pending';
    const acts=state==='confirmed'?'<span class="done-chip">✓ Added to bills</span>'
      :state==='dismissed'?`Dismissed<button type="button" class="btn text" data-undo="${i}" aria-label="Undo dismiss ${escapeHtml(r.merchant)}">Undo</button>`
      :`<button type="button" class="btn ghost" data-dismiss="${i}" aria-label="Dismiss ${escapeHtml(r.merchant)}">Dismiss</button><button type="button" class="btn" data-confirm="${i}" aria-label="Confirm ${escapeHtml(r.merchant)} as a bill">Confirm as bill</button>`;
    return `<div class="sug" data-sug-key="${escapeHtml(r.key)}">
      <div class="who"><div class="n">${escapeHtml(r.merchant)}</div><div class="m">${pattern} · ${r.count} charges · ${escapeHtml(acctName(r.account))}</div></div>
      <div class="amt">${steady?'':'avg '}${fmt(r.avg)}</div>
      <div class="conf"><span>${conf}% confidence</span><span class="confbar hue-${conf>=80?'good':conf>=60?'warn':'neutral'}" aria-hidden="true"><span style="width:${conf}%"></span></span></div>
      <div class="acts">${acts}</div></div>`;
  }).join('');
  const sugSec=document.createElement('section');
  sugSec.className='panel';
  sugSec.setAttribute('aria-labelledby','blSugH');
  sugSec.innerHTML=`<div><h2 id="blSugH">Spotted recurring charges</h2><p class="sub">FinLens found these repeating. Confirm the real bills so they get due dates and reminders.</p></div>
    ${sugHtml?`<div>${sugHtml}</div>`:'<p class="empty-note">Nothing repeating found yet. Import a few months of history.</p>'}`;
  root.appendChild(sugSec);
  const refocus=(key,sel)=>{ const row=$(`#content .sug[data-sug-key="${CSS.escape(key)}"]`); const el=row&&(row.querySelector(sel)||row.querySelector('button,.done-chip')); if (el){ if (!el.matches('button')) el.tabIndex=-1; el.focus({preventScroll:true}); } };
  $$('[data-confirm]',sugSec).forEach(b=>b.onclick=()=>{ const r=recurring[+b.dataset.confirm]; confirmRecurring(r); refocus(r.key,'.done-chip'); });
  $$('[data-dismiss]',sugSec).forEach(b=>b.onclick=()=>{ const r=recurring[+b.dataset.dismiss]; dismissRecurring(r.key); refocus(r.key,'[data-undo]'); });
  $$('[data-undo]',sugSec).forEach(b=>b.onclick=()=>{ const r=recurring[+b.dataset.undo]; undoDismissRecurring(r.key); refocus(r.key,'[data-confirm]'); });

  /* ---- month calendar ---- */
  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  const mStart=new Date(y,m,1), mEnd=new Date(y,m+1,0,23,59,59);
  const byDay={};
  bills.forEach(b=>billDatesBetween(b,mStart,mEnd).forEach(d=>{ (byDay[d.getDate()]=byDay[d.getDate()]||[]).push(b.merchant); }));
  const lead=mStart.getDay(), days=mEnd.getDate();
  const cells=[];
  for (let i=0;i<lead;i++) cells.push('<div class="bcal-d blank" aria-hidden="true"></div>');
  for (let d=1;d<=days;d++) {
    const isToday=d===now.getDate();
    const names=byDay[d]||[];
    cells.push(`<div class="bcal-d${isToday?' today':''}"><span class="n">${d}${isToday?'<span class="sr-only"> (today)</span>':''}</span>${names.map(n=>`<span class="b" title="${escapeHtml(n)}">${escapeHtml(n)}</span>`).join('')}</div>`);
  }
  while (cells.length%7) cells.push('<div class="bcal-d blank" aria-hidden="true"></div>');
  const calSec=document.createElement('section');
  calSec.className='panel';
  calSec.setAttribute('aria-labelledby','blCalH');
  calSec.innerHTML=`<div class="panel-head" style="align-items:center"><h2 id="blCalH">${dayjs(mStart).format('MMMM YYYY')}</h2>
      <button type="button" class="btn ghost" id="billCalToggle" aria-expanded="${billsCalOpen}" aria-controls="billCal">${billsCalOpen?'Hide calendar':'Show calendar'}</button></div>
    <div class="table-scroll" id="billCal"${billsCalOpen?'':' hidden'}>
      <div class="bcal"><div class="bcal-h" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div>
      <div class="bcal-g">${cells.join('')}</div></div>
    </div>`;
  root.appendChild(calSec);
  $('#billCalToggle').onclick=(e)=>{
    billsCalOpen=!billsCalOpen;
    $('#billCal').hidden=!billsCalOpen;
    e.currentTarget.setAttribute('aria-expanded',String(billsCalOpen));
    e.currentTarget.textContent=billsCalOpen?'Hide calendar':'Show calendar';
  };

  /* ---- your bills ---- */
  const order=[...withDue].sort((a,b)=>a.due-b.due);
  const status=(x)=>{
    const d=daysTo(x.due);
    if (x.b.paid) return ['Paid','good'];
    if (d<0) return [`Overdue ${-d}d`,'bad'];
    if (d===0) return ['Due today','warn'];
    if (_justAddedBills.has(x.b)) return ['Just added','good'];
    if (d<=7) return ['This week','accent'];
    return ['Upcoming',''];
  };
  const listSec=document.createElement('section');
  listSec.className='panel';
  listSec.setAttribute('aria-labelledby','blListH');
  listSec.innerHTML=`<h2 id="blListH">Your bills</h2>
    ${order.length?`<div class="table-scroll"><table class="tbl flush mw-860">
      <thead><tr><th scope="col">Bill</th><th scope="col" class="r">Amount</th><th scope="col">Repeats</th><th scope="col">Next due</th><th scope="col">Pays from</th><th scope="col">Last paid</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Edit</span></th></tr></thead>
      <tbody>${order.map(x=>{ const [st,cls]=status(x); const lp=billLastPaid(x.b); return `<tr>
        <td><span style="font-weight:600">${escapeHtml(x.b.merchant)}</span>${billIsSubscription(x.b)?' <span class="flag" style="margin-left:6px">Subscription</span>':''}</td>
        <td class="r strong nowrap">${fmt(Number(x.b.amount)||0)}</td>
        <td class="dim nowrap">${billFreq(x.b).label}</td>
        <td class="nowrap">${dayjs(x.due).format('MMM D')}</td>
        <td class="dim">${x.b.account?escapeHtml(acctName(x.b.account)):'—'}</td>
        <td class="dim nowrap">${lp?dayjs(lp).format('MMM D'):'—'}</td>
        <td><span class="pill ${cls}">${st}</span></td>
        <td class="r"><button type="button" class="icon-btn sm" data-bill-edit="${x.i}" aria-label="Edit ${escapeHtml(x.b.merchant)}" title="Edit">${ICON.pencil}</button></td>
      </tr>`; }).join('')}</tbody></table></div>`
      :'<p class="empty-note">No bills yet. Confirm one FinLens spotted above, or use + Add bill.</p>'}`;
  root.appendChild(listSec);
  $$('[data-bill-edit]',listSec).forEach(b=>b.onclick=()=>showBillForm(+b.dataset.billEdit));
});

/* =================== TRANSFERS =================== */
let txFromFilter='all', txToFilter='all', txfShowAll=false;

registerView('transfers','Transfers',(root)=>{
  txPillFilter='transfers';
  wireLinks(root);
  pageActions(root,'Money moving between accounts · both sides of each transfer are matched automatically','');
  renderTxPills(root,'transfers');
  const all=filteredTx();
  const pairs=transferPairs(all);
  const kind=(id)=>id?State.accounts[id]?.kind:null;
  const kws=(State.transferKeywords&&State.transferKeywords.length)?State.transferKeywords:DEFAULT_TRANSFER_KEYWORDS;

  if (pairs.length) {
    const paired=pairs.filter(p=>p.paired), out=pairs.filter(p=>!p.paired&&p.from&&!p.to);
    const sum=a=>a.reduce((s,p)=>s+p.amount,0);
    const destWords=[...new Set(paired.map(p=>({bank_savings:'savings',credit_card:'card payments',bank_checking:'checking'})[kind(p.to)]||'other accounts'))];
    const outKw={};
    out.forEach(p=>{ const k=kws.find(w=>p.description.toLowerCase().includes(w.toLowerCase())); if (k) outKw[k]=(outKw[k]||0)+1; });
    const toSav=sum(paired.filter(p=>kind(p.to)==='bank_savings'))-sum(paired.filter(p=>kind(p.from)==='bank_savings'&&kind(p.to)!=='bank_savings'));
    const span=dataSpan(all);
    const hasSavings=orderedAccounts().some(a=>a.kind==='bank_savings');
    appendHtml(root,kpiTiles([
      {label:'Transfers',value:String(pairs.length),sub:`${paired.length} paired · ${pairs.length-paired.length} one-sided`},
      {label:'Between your accounts',value:fmt(sum(paired)),sub:paired.length?escapeHtml(cap(destWords.join(' and '))):'None paired'},
      {label:'Sent outside FinLens',value:fmt(sum(out)),sub:out.length?`${escapeHtml(Object.keys(outKw).map(cap).join(', ')||'Transfers')} · ${plural(out.length,'payment')}`:'None'},
      {label:'Saved to savings',value:fmt(toSav),cls:toSav>0?'c-good':'',sub:hasSavings?(toSav>0?`About ${fmt0(toSav/Math.max(1,span.months))} a month`:'Nothing moved in'):'No savings account loaded'},
    ]));

    /* ---- where money moved ---- */
    const groups={};
    pairs.forEach(p=>{
      const s=p.from||'__out', d=p.to||'__out';
      const g=groups[s]=groups[s]||{id:p.from,total:0,count:0,dests:{}};
      g.total+=p.amount; g.count++;
      const dd=g.dests[d]=g.dests[d]||{id:p.to,total:0,count:0,dates:[],descs:{},autopay:0};
      dd.total+=p.amount; dd.count++; dd.dates.push(p.date);
      dd.descs[p.description]=(dd.descs[p.description]||0)+1;
      if (/auto\s?pay/i.test(p.description)) dd.autopay++;
    });
    const srcs=Object.values(groups).sort((a,b)=>(a.id?0:1)-(b.id?0:1)||b.total-a.total);
    const pspan=dataSpan(pairs.map(p=>({date:p.date})));
    const flowHtml=srcs.map(g=>{
      const dests=Object.values(g.dests).sort((a,b)=>(a.id?0:1)-(b.id?0:1)||b.total-a.total);
      return `<div class="flow">
        <div class="flow-from${g.id?'':' k-out'}" style="grid-row:1/span ${dests.length}">
          <span class="eyebrow">From</span><span class="n">${escapeHtml(acctName(g.id))}</span>
          <span class="m">${fmt(g.total)} ${g.id?'out':'in'} · ${plural(g.count,'transfer')}</span>
        </div>
        ${dests.map(d=>{
          const k=kind(d.id);
          const cls=!d.id?'k-out':k==='bank_savings'?'k-good':k==='credit_card'?'k-card':'';
          const hue=!d.id?'neutral':k==='bank_savings'?'good':k==='credit_card'?'card':'accent';
          const noun=k==='credit_card'?'card payment':!d.id||!g.id?'payment':'transfer';
          const rh=rhythmOf(d.dates);
          const topDesc=Object.entries(d.descs).sort((a,b)=>b[1]-a[1])[0][0];
          const note=!d.id||!g.id?escapeHtml(topDesc)
            :k==='credit_card'?(d.autopay?`Autopay${rh.startsWith('Monthly')?', '+rh.slice(9):''}`:(rh||'Card payments'))
            :(rh?`${rh.startsWith('Monthly')?'Monthly transfer'+rh.slice(7):rh}`:plural(d.count,'transfer'));
          return `<div class="flow-arrow hue-${hue}${d.id&&g.id?'':' dashed'}"><span class="l">${fmt(d.total)} <span>· ${plural(d.count,noun)}</span></span><div class="line" aria-hidden="true"><i></i><b></b></div><span class="sr-only">to</span></div>
            <div class="flow-to ${cls}"><span class="n">${escapeHtml(acctName(d.id))}</span><span class="m">${note}</span></div>`;
        }).join('')}
      </div>`;
    }).join('');
    appendHtml(root,`<section class="panel" aria-labelledby="tfFlowH">
      <div><h2 id="tfFlowH">Where money moved</h2><p class="sub">${dayjs(pspan.first).format('MMM D')} – ${dayjs(pspan.last).format('MMM D, YYYY')}</p></div>
      <div class="table-scroll"><div class="flow-wrap">${flowHtml}</div></div>
    </section>`);
  } else {
    appendHtml(root,emptyPanel(`No transfers in ${escapeHtml(rangeText())}.`));
  }

  /* ---- list + keywords ---- */
  const row=document.createElement('div'); row.className='cols-3';
  const acctIds=[...new Set(pairs.flatMap(p=>[p.from,p.to]).filter(Boolean))];
  const opt=(sel,ids,withOut)=>`<option value="all">Any account</option>${ids.map(id=>`<option value="${escapeHtml(id)}" ${sel===id?'selected':''}>${escapeHtml(acctName(id))}</option>`).join('')}${withOut?`<option value="outside" ${sel==='outside'?'selected':''}>Outside FinLens</option>`:''}`;
  const froms=acctIds.filter(id=>pairs.some(p=>p.from===id)), tos=acctIds.filter(id=>pairs.some(p=>p.to===id));
  if (txFromFilter!=='all'&&txFromFilter!=='outside'&&!froms.includes(txFromFilter)) txFromFilter='all';
  if (txToFilter!=='all'&&txToFilter!=='outside'&&!tos.includes(txToFilter)) txToFilter='all';
  row.innerHTML=`
    <section class="panel span-2" aria-labelledby="tfListH">
      <div class="panel-head" style="align-items:flex-end"><h2 id="tfListH">Transfers</h2>
        <div class="form-row">
          <label class="inline-field">From<select class="select" id="txFrom">${opt(txFromFilter,froms,pairs.some(p=>!p.from))}</select></label>
          <label class="inline-field">To<select class="select" id="txTo">${opt(txToFilter,tos,pairs.some(p=>!p.to))}</select></label>
        </div></div>
      <div id="tfList"></div>
    </section>
    <section class="panel" aria-labelledby="tfKwH">
      <div><h2 id="tfKwH">Transfer keywords</h2><p class="sub" style="line-height:1.5">Unpaired transactions whose description contains one of these count as transfers, not spending.</p></div>
      <div class="kw-list" id="kwChips">${kws.map((k,i)=>`<span class="kw">${escapeHtml(k)}<button type="button" data-kw-del="${i}" aria-label="Remove keyword ${escapeHtml(k)}">×</button></span>`).join('')}</div>
      <div class="form-row"><label class="field" style="flex:1;font-weight:500">Add keyword<input class="input" id="newKw" placeholder="e.g. ath movil" autocomplete="off"></label><button type="button" class="btn ghost" id="kwAdd">Add</button></div>
      <p class="sub" style="margin:0;font-size:12px">Changes re-run transfer detection on all transactions.</p>
    </section>`;
  root.appendChild(row);

  const drawList=()=>{
    const rows=pairs.filter(p=>{
      if (txFromFilter==='outside'?p.from:txFromFilter!=='all'&&p.from!==txFromFilter) return false;
      if (txToFilter==='outside'?p.to:txToFilter!=='all'&&p.to!==txToFilter) return false;
      return true;
    });
    const shown=txfShowAll?rows:rows.slice(0,10);
    $('#tfList').innerHTML=`${shown.length?`<div class="table-scroll"><table class="tbl flush mw-560 fit-sm">
      <thead><tr><th scope="col" class="w-date">Date</th><th scope="col">From → To</th><th scope="col" class="hide-sm">Match</th><th scope="col" class="r w-amt">Amount</th></tr></thead>
      <tbody>${shown.map(p=>`<tr class="click" data-out="${escapeHtml(p.outId||'')}" data-in="${escapeHtml(p.inId||'')}">
        <td class="dim nowrap" style="width:64px">${dayjs(p.date).format('MMM D')}</td>
        <td><button type="button" class="link-btn" style="white-space:normal" aria-label="Transfer details: ${escapeHtml(acctName(p.from))} to ${escapeHtml(acctName(p.to))}, ${fmt(p.amount)}"><span>${escapeHtml(acctName(p.from))}</span> <span class="muted" aria-hidden="true">→</span> <span>${escapeHtml(acctName(p.to))}</span></button></td>
        <td class="hide-sm"><span class="pill ${p.paired?'good':''}">${p.paired?'Paired':'Keyword'}</span></td>
        <td class="r strong nowrap">${fmt(p.amount)}</td></tr>`).join('')}</tbody></table></div>`
      :`<p class="empty-note">${pairs.length?'No transfers between those accounts.':'Nothing to show.'}</p>`}
      ${rows.length?`<div class="list-foot" style="padding:4px 0 0"><span>Showing ${shown.length} of ${plural(rows.length,'transfer')}</span>${rows.length>10?`<button type="button" class="btn text" id="tfMore" aria-expanded="${txfShowAll}">${txfShowAll?'Show fewer':'Show all'}</button>`:''}</div>`:''}`;
    $$('#tfList tr.click').forEach(tr=>tr.onclick=()=>showTransferDrawer(tr.dataset.out,tr.dataset.in));
    const more=$('#tfMore'); if (more) more.onclick=()=>{ txfShowAll=!txfShowAll; drawList(); const m=$('#tfMore'); if (m) m.focus(); };
  };
  drawList();
  $('#txFrom').onchange=e=>{ txFromFilter=e.target.value; drawList(); };
  $('#txTo').onchange=e=>{ txToFilter=e.target.value; drawList(); };

  const addKw=()=>{
    const inp=$('#newKw');
    if (!inp.value.trim()){ inp.setAttribute('aria-invalid','true'); inp.focus(); return; }
    addTransferKeyword(inp.value);
    const again=$('#newKw'); if (again) again.focus({preventScroll:true});
  };
  $('#kwAdd').onclick=addKw;
  $('#newKw').onkeydown=e=>{ if (e.key==='Enter'){ e.preventDefault(); addKw(); } };
  $$('[data-kw-del]',row).forEach(b=>b.onclick=()=>{
    removeTransferKeyword(+b.dataset.kwDel);
    const next=$(`#kwChips [data-kw-del="${Math.max(0,+b.dataset.kwDel-1)}"]`)||$('#newKw');
    if (next) next.focus({preventScroll:true});
  });
});

function showTransferDrawer(outId, inId) {
  const txs=[outId,inId].filter(Boolean).map(id=>State.transactions.find(t=>t.id===id)).filter(Boolean);
  if (!txs.length) return;
  const p=txs[0];
  openDrawer(`<div class="dform">
    <div class="sum-box">
      <span class="amt">${fmt(Math.abs(p.amount))}</span>
      <span class="meta">${dayjs(p.date).format('dddd, MMM D, YYYY')}</span>
      <div class="flags" style="margin-top:6px">${txs.map(t=>`<span class="chip ${t.amount<0?'xfer-out':'xfer-in'}">${escapeHtml(acctName(t.account))} · ${t.amount<0?'out':'in'}</span>`).join('')}</div>
    </div>
    ${txs.map((t,i)=>`
      <div class="dform" style="gap:12px">
        <span class="eyebrow">${escapeHtml(acctName(t.account))} — ${t.amount<0?'outgoing':'incoming'}</span>
        <label class="field">Description<input class="input" id="tdDesc_${i}" value="${escapeHtml(t.description)}"></label>
        <label class="field">Notes<textarea class="textarea" id="tdNotes_${i}" rows="2">${escapeHtml(t.notes||'')}</textarea></label>
      </div>`).join('')}
    <p class="drawer-note">To change a leg's category or type, open it from the Transactions list.</p>
  </div>`,{ title:'Transfer detail',
    footer:`<span class="grow"></span><button type="button" class="btn ghost lg" onclick="closeDrawer()">Cancel</button><button type="button" class="btn lg" id="tdSave">Save changes</button>` });
  // Each leg's fields on opening: Save stores only what's changed (v1.16.16). Until
  // v1.16.15 it stored both legs' description and notes, so a leg you didn't touch became an edit.
  const fields=(i)=>({ description:$(`#tdDesc_${i}`).value, notes:$(`#tdNotes_${i}`).value });
  const opened=txs.map((t,i)=>fields(i));
  $('#tdSave').onclick=()=>{
    txs.forEach((t,i)=>{
      const ov=State.txOverrides[t.id]||{};
      storeChangedText(t,ov,opened[i],fields(i));
      if (Object.keys(ov).length) State.txOverrides[t.id]=ov; else delete State.txOverrides[t.id];
    });
    lsSet('txOverrides',State.txOverrides);
    closeDrawer(); renderActive();
  };
}

/* Transfer keywords: every change re-runs transfer detection (v1.14.0) */
function addTransferKeyword(val) {
  const kw=(val||'').trim().toLowerCase();
  if (!kw) return;
  if (!State.transferKeywords) State.transferKeywords=[...DEFAULT_TRANSFER_KEYWORDS];
  if (!State.transferKeywords.includes(kw)) {
    State.transferKeywords.push(kw);
    lsSet('transferKeywords',State.transferKeywords);
  }
  reapplyTransferKeywords();
}
function removeTransferKeyword(i) {
  if (!State.transferKeywords) State.transferKeywords=[...DEFAULT_TRANSFER_KEYWORDS];
  State.transferKeywords.splice(i,1);
  lsSet('transferKeywords',State.transferKeywords);
  reapplyTransferKeywords();
}
// Re-run transfer detection on every transaction (redetectTransfers(), core.js). Each transfer
// goes back first to what it was before detection, with its edit (undoTransferDetection()), so
// one that a removed keyword no longer matches is itself again: its CSV type and category, or
// the ones you set (without Transfer out / Transfer in, v1.16.26). A type you set to Transfer
// stays. Before v1.16.24 a transfer went back as a debit or credit by its sign, with Other or
// Income when it had no category besides Transfer out / in (the usual case): a card's Payment
// became Income / refund, its Travel or Shopping became Other, and a checking row lost the
// category its rules gave it.
function reapplyTransferKeywords() {
  redetectTransfers();
  renderActive();
}
