/* ================================================================
   FINLENS — views-main.js
   Overview, Transactions, Income, Bills, Spending, Transfers
================================================================ */

/* =================== OVERVIEW =================== */
registerView('overview','Overview',(root)=>{
  const txs=filteredTx();
  // Use period-aware balances so the cards reflect the selected date range
  const balances={};
  orderedAccounts().forEach(a=>{ balances[a.id]=periodEndBalance(a.id); });
  const cash=orderedAccounts().filter(a=>a.kind==='ally_checking'||a.kind==='ally_savings').reduce((s,a)=>s+(balances[a.id]||0),0);
  const debt=orderedAccounts().filter(a=>a.kind==='chase').reduce((s,a)=>{ const b=balances[a.id]; if(b==null) return s; return s+(b<0?Math.abs(b):b); },0);
  const net=cash-debt;
  const income=sumIncome(txs);
  const expense=sumExpense(txs);
  const cashflow=income-expense;
  const savingsRate=income>0?(income-expense)/income:0;

  if (!State.transactions.length) {
    root.innerHTML=`<div class="empty">
      <h4>Welcome to FinLens 👋</h4>
      <p>Load your CSV exports from Chase and Ally Bank to see your dashboard come alive.</p>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn" onclick="showView('import')">Go to Data Tab →</button>
      </div>
      <p style="margin-top:18px;font-size:12.5px;color:var(--text-3)">
        Supported format: <span class="kbd">.CSV only</span> — Chase credit card, Ally Checking, Ally Savings
      </p></div>`;
    return;
  }

  // Metric cards
  const metrics=document.createElement('div'); metrics.className='grid grid-4';
  metrics.innerHTML=`
    <div class="card"><h3>Total Cash</h3><div class="big num">${fmt(cash)}</div><div class="footnote">Ally Checking + Savings</div></div>
    <div class="card"><h3>Total Debt</h3><div class="big num">${fmt(debt)}</div><div class="footnote">Chase balances</div></div>
    <div class="card"><h3>Net Worth</h3><div class="big num">${fmt(net)}</div><div class="footnote">Cash − Debt</div></div>
    <div class="card"><h3>Cash Flow</h3><div class="big num ${cashflow>=0?'amt-pos':'amt-neg'}">${fmt(cashflow)}</div><div class="footnote">Savings rate ${pct(savingsRate)}</div></div>`;
  root.appendChild(metrics);

  // Account cards — rendered in user-defined order
  const accts=document.createElement('div'); accts.className='grid grid-3';
  orderedAccounts().forEach(a=>{
    const bal=balances[a.id];
    const limit=State.manualBalances[a.id+'_limit'];
    const util=(a.kind==='chase'&&limit)?(Math.abs(bal||0)/limit):null;
    const periodNet=filteredTx().filter(t=>t.account===a.id).reduce((s,t)=>s+t.amount,0);
    const netLabel=periodNet===0?'':`· Net ${periodNet>=0?'+':''}${fmt(periodNet)}`;
    const netSummary=periodNet===0?'No activity this period':`Net ${periodNet>=0?'+':''}${fmt(periodNet)}`;
    const sparkId='sp_'+a.id;
    const isCC=a.kind==='chase';
    const c=document.createElement('div'); c.className='card';
    c.innerHTML=`
      <h3 class="kpi-label" data-acct-id="${a.id}" title="Double-click to rename">${escapeHtml(State.accountLabels?.[a.id]||a.name)}</h3>
      <div class="big num">${isCC?fmt(Math.abs(bal||0)):fmt(bal)}</div>
      ${isCC
        ?`<div class="footnote">Limit ${fmt(limit||0)} · Util. ${util==null?'—':pct(util)} ${netLabel}</div>`
        :`<div class="footnote">${netSummary}</div>`}
      <div class="spark-wrap"><canvas id="${sparkId}"></canvas></div>`;
    accts.appendChild(c);
    setTimeout(()=>drawSpark(sparkId,a.id,isCC?{color:'#EF4444',bg:'rgba(239,68,68,.15)'}:{}),0);
  });
  root.appendChild(accts);

  // Cash flow chart + upcoming bills (next 5 table)
  const upcomingBills=(State.bills||[]).filter(b=>!b.paid).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,5);
  const today=new Date(); today.setHours(0,0,0,0);
  const billListHtml=upcomingBills.length?`
    <table class="tbl" style="margin-top:6px">
      <thead><tr><th>Date</th><th>Bill</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${upcomingBills.map(b=>{
        const dd=new Date(b.dueDate); dd.setHours(0,0,0,0);
        const days=Math.round((dd-today)/86400000);
        let badgeStyle;
        if (days<0) badgeStyle='color:var(--red);font-weight:600';
        else if (days<=7) badgeStyle='color:var(--amber);font-weight:600';
        else badgeStyle='color:var(--text-2)';
        const dateStr=days<0?`<span style="${badgeStyle}">Overdue ${Math.abs(days)}d</span>`:
          days===0?`<span style="${badgeStyle}">Today</span>`:
          `<span style="${badgeStyle}">${dayjs(b.dueDate).format('MMM D')}</span>`;
        return `<tr>
          <td class="num" style="white-space:nowrap">${dateStr}</td>
          <td>${escapeHtml(b.merchant)}<div class="muted" style="font-size:10.5px">${b.frequency||'Monthly'}</div></td>
          <td class="num amt-neg" style="text-align:right">${fmt(b.amount)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>`
    :`<p class="muted" style="margin-top:10px;font-size:12.5px">No upcoming bills. Add bills in the Bills tab.</p>`;

  const row1=document.createElement('div'); row1.className='grid grid-2';
  row1.innerHTML=`
    <div class="card">
      <h2 class="section-title">Cash Flow</h2>
      <div class="chart-wrap"><canvas id="cfChart"></canvas></div>
    </div>
    <div class="card">
      <h2 class="section-title">Upcoming Bills</h2>
      <div style="margin-top:6px">${billListHtml}</div>
    </div>`;
  root.appendChild(row1);

  // Credit Cards - Most Expensive Transactions
  const ccAccts=orderedAccounts().filter(a=>a.kind==='chase');
  const ccAcctIds=ccAccts.map(a=>a.id);
  const ccExpenses=txs.filter(t=>ccAcctIds.includes(t.account)&&t.amount<0&&t.type!=='transfer').sort((a,b)=>a.amount-b.amount).slice(0,5);
  if (ccAccts.length) {
    const chaseCard=document.createElement('div'); chaseCard.className='card';
    chaseCard.innerHTML=`<h2 class="section-title">Credit Cards — Most Expensive Transactions</h2>
      ${ccExpenses.length?`<table class="tbl" style="margin-top:8px">
        <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${ccExpenses.map(t=>`<tr>
          <td class="num">${dayjs(t.date).format('MMM D')}</td>
          <td>${escapeHtml(t.description)}</td>
          <td><span class="chip">${State.accounts[t.account]?.name||t.account}</span></td>
          <td>${t.category}</td>
          <td class="num amt-neg" style="text-align:right">${fmt(t.amount)}</td>
        </tr>`).join('')}</tbody>
      </table>`:`<p class="muted" style="margin-top:8px">No credit card transactions in selected period.</p>`}`;
    root.appendChild(chaseCard);
  }

  // Recent Transactions — top 5 across Ally Checking + Savings combined
  const allyAccts=orderedAccounts().filter(a=>a.kind==='ally_checking'||a.kind==='ally_savings');
  if (allyAccts.length) {
    const allyIds=new Set(allyAccts.map(a=>a.id));
    const recentAlly=filteredTx().filter(t=>allyIds.has(t.account)).slice(0,5);
    const recentCard=document.createElement('div'); recentCard.className='card';
    recentCard.innerHTML=`<h2 class="section-title">Recent Transactions</h2>
      ${recentAlly.length?`<table class="tbl" style="margin-top:8px">
        <thead><tr><th>Date</th><th>Description</th><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${recentAlly.map(t=>`<tr>
          <td class="num">${dayjs(t.date).format('MMM D')}</td>
          <td>${escapeHtml(t.description)}</td>
          <td><span class="chip">${escapeHtml(State.accountLabels?.[t.account]||State.accounts[t.account]?.name||t.account)}</span></td>
          <td class="num ${t.amount>=0?'amt-pos':'amt-neg'}" style="text-align:right">${fmt(t.amount)}</td>
        </tr>`).join('')}</tbody>
      </table>`:`<p class="muted" style="margin-top:8px">No transactions in selected period.</p>`}`;
    root.appendChild(recentCard);
  }

  // Quick stats
  const top=byCategory(txs,'expense')[0];
  const merchantMap={};
  txs.filter(t=>t.amount<0&&t.type!=='transfer').forEach(t=>{ const k=t.description.slice(0,40); merchantMap[k]=(merchantMap[k]||0)+1; });
  const topMerchant=Object.entries(merchantMap).sort((a,b)=>b[1]-a[1])[0];
  const incomeSrc=byCategory(txs,'income')[0];
  const stats=document.createElement('div'); stats.className='grid grid-3';
  stats.innerHTML=`
    <div class="card"><h3>Top Spending Category</h3><div class="big" style="font-size:18px">${top?top.category:'—'}</div><div class="footnote">${top?fmt(top.amount):''}</div></div>
    <div class="card"><h3>Most Frequent Merchant</h3><div class="big" style="font-size:16px">${topMerchant?topMerchant[0]:'—'}</div><div class="footnote">${topMerchant?topMerchant[1]+' transactions':''}</div></div>
    <div class="card"><h3>Top Income Source</h3><div class="big num">${incomeSrc?fmt(incomeSrc.amount):'—'}</div><div class="footnote">${incomeSrc?incomeSrc.category:''}</div></div>`;
  root.appendChild(stats);

  // Wire up editable KPI card labels (double-click to rename)
  setTimeout(()=>{
    $$('h3.kpi-label').forEach(h3=>{
      h3.style.cursor='text';
      h3.addEventListener('dblclick',()=>{
        const id=h3.dataset.acctId;
        const cur=h3.textContent.trim();
        const inp=document.createElement('input');
        inp.className='input'; inp.value=cur;
        inp.style.cssText='font-size:13px;font-weight:500;padding:3px 6px;height:28px;width:100%;margin:0';
        h3.replaceWith(inp); inp.focus(); inp.select();
        const save=()=>{
          const newName=inp.value.trim()||cur;
          if (!State.accountLabels) State.accountLabels={};
          State.accountLabels[id]=newName;
          if (State.accounts[id]) State.accounts[id].name=newName;
          lsSet('accountLabels',State.accountLabels);
          buildAccountFilter();
          renderActive();
        };
        inp.addEventListener('blur',save);
        inp.addEventListener('keydown',e=>{
          if (e.key==='Enter'){e.preventDefault();save();}
          if (e.key==='Escape'){inp.replaceWith(h3);}
        });
      });
    });
  },0);

  // Draw charts
  setTimeout(()=>{
    const ctx=$('#cfChart');
    if (ctx) {
      new Chart(ctx,{
        type:'bar',
        data:{labels:['Income','Spending','Transfers'],datasets:[{data:[income,expense,sumTransfers(txs)],backgroundColor:['#00C49A','#EF4444','#94A3B8'],borderRadius:6}]},
        options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{callback:v=>'$'+v.toLocaleString()}}}}
      });
    }
  },0);
});

/* =================== TRANSACTIONS =================== */
let txSort={key:'date',dir:'desc'};
let txPage=1;
let txSearch='';
let txCatFilter='all';
let txPillFilter='all'; // all | income | spending | bills | payments | transfers
let txAmtMode='';
let txAmtVal=null;
let txAmtVal2=null;
let selectedTxIds=new Set();

registerView('transactions','Transactions',(root)=>{
  const txs=filteredTx();
  const TRANSFER_CATS=['Transfer in','Transfer out'];
  const cats=['all','(Uncategorized)',...new Set(txs.flatMap(t=>t.categories||[t.category]).filter(c=>c&&!TRANSFER_CATS.includes(c)&&c!=='Other'))];

  // Filter pills
  const pillBar=document.createElement('div');
  pillBar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px';
  const PILLS=[['all','All'],['income','Income'],['spending','Spending'],['bills','Bills'],['payments','Payments'],['transfers','Transfers']];
  pillBar.innerHTML=PILLS.map(([k,l])=>`<button class="btn${txPillFilter===k?'':' ghost'} sm" data-pill="${k}" style="border-radius:20px">${l}</button>`).join('');
  root.appendChild(pillBar);
  pillBar.querySelectorAll('[data-pill]').forEach(btn=>btn.onclick=()=>{txPillFilter=btn.dataset.pill;txPage=1;renderActive();});

  const ctrl=document.createElement('div'); ctrl.className='card';
  ctrl.innerHTML=`
    <div class="row" style="align-items:flex-end;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:200px">
        <label class="lbl">Search</label>
        <div style="position:relative;display:flex;align-items:center">
          <input id="txSearch" class="input" placeholder="merchant, description, notes…" value="${escapeHtml(txSearch)}" style="padding-right:${txSearch?'28px':'10px'};width:100%">
          ${txSearch?`<button id="txSearchClear" title="Clear search" style="position:absolute;right:7px;background:none;border:none;cursor:pointer;font-size:15px;color:var(--text-3);padding:0;line-height:1;display:flex;align-items:center">✕</button>`:''}
        </div>
      </div>
      <div>
        <label class="lbl">Category</label>
        <select id="txCat" class="select">${cats.map(c=>`<option ${c===txCatFilter?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      <div>
        <label class="lbl">Amount</label>
        <div style="display:flex;gap:4px;align-items:center">
          <select id="txAmtMode" class="select" style="width:110px">
            <option value="" ${txAmtMode===''?'selected':''}>Any</option>
            <option value="eq" ${txAmtMode==='eq'?'selected':''}>= exact</option>
            <option value="lt" ${txAmtMode==='lt'?'selected':''}>&#60; less than</option>
            <option value="gt" ${txAmtMode==='gt'?'selected':''}>&#62; greater than</option>
            <option value="range" ${txAmtMode==='range'?'selected':''}>range</option>
          </select>
          <input id="txAmtVal" class="input" type="number" step="0.01" placeholder="$" value="${txAmtVal!==null?txAmtVal:''}" style="width:80px${!txAmtMode?';display:none':''}">
          <span id="txAmtSep" style="${txAmtMode==='range'?'':'display:none'}">–</span>
          <input id="txAmtVal2" class="input" type="number" step="0.01" placeholder="max" value="${txAmtVal2!==null?txAmtVal2:''}" style="width:80px${txAmtMode!=='range'?';display:none':''}">
        </div>
      </div>
      <button class="btn ghost sm" id="txExport">Export CSV</button>
    </div>`;
  root.appendChild(ctrl);

  const tableCard=document.createElement('div'); tableCard.className='card';
  tableCard.innerHTML=`
    <div id="bulkBar" style="display:none;align-items:center;gap:10px;padding:8px 10px;background:var(--teal-soft);border:1px solid var(--teal);border-radius:9px;margin-bottom:10px;flex-wrap:wrap">
      <span id="bulkCount" class="num" style="font-size:13px;font-weight:600"></span>
      <select class="select" id="bulkCatSel" style="width:160px;font-size:12px;padding:4px 8px">
        <option value="">— Apply category —</option>
        ${State.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
      </select>
      <button class="btn sm" id="bulkApplyCat">Apply</button>
      <select class="select" id="bulkTypeSel" style="width:140px;font-size:12px;padding:4px 8px">
        <option value="">— Set type —</option>
        <option value="debit">Expense</option>
        <option value="credit">Income</option>
        <option value="transfer">Transfer</option>
      </select>
      <button class="btn sm" id="bulkApplyType">Apply Type</button>
      <button class="btn ghost sm" id="bulkMarkBill">Mark as Bill</button>
      <button class="btn ghost sm" id="bulkMarkSub">Mark as Sub</button>
      <button class="btn ghost sm" id="bulkClear" style="margin-left:auto">✕ Clear</button>
    </div>
    <table class="tbl" id="txTable"></table>
    <div class="row" style="justify-content:space-between;margin-top:10px"><div class="muted" id="txCount"></div><div id="txPager"></div></div>`;
  root.appendChild(tableCard);

  const renderTable=()=>{
    let rows=txs.filter(t=>{
      if (txSearch){
        const q=txSearch.toLowerCase();
        const cats=(t.categories||[t.category]).join(' ');
        if (!(t.description+cats+(t.notes||'')).toLowerCase().includes(q)) return false;
      }
      if (txCatFilter==='(Uncategorized)') {
        const tCats=(t.categories||[t.category]);
        if (!(!tCats.length||tCats.every(c=>!c||c==='Other'))) return false;
      } else if (txCatFilter!=='all'&&!(t.categories||[t.category]).includes(txCatFilter)) return false;
      // Pill filter
      if (txPillFilter==='income'    && !(t.amount>0&&t.type!=='transfer'&&t.type!=='payment')) return false;
      if (txPillFilter==='spending'  && !(t.amount<0&&t.type!=='transfer')) return false;
      if (txPillFilter==='bills'     && !t.isBill) return false;
      if (txPillFilter==='payments'  && t.type!=='payment') return false;
      if (txPillFilter==='transfers' && t.type!=='transfer') return false;
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
    });
    rows.sort((a,b)=>{
      let av=a[txSort.key], bv=b[txSort.key];
      if (txSort.key==='amount'){av=Math.abs(a.amount);bv=Math.abs(b.amount);}
      if (av<bv) return txSort.dir==='asc'?-1:1;
      if (av>bv) return txSort.dir==='asc'?1:-1;
      return 0;
    });
    const pageSize=50;
    const pages=Math.max(1,Math.ceil(rows.length/pageSize));
    if (txPage>pages) txPage=pages;
    const slice=rows.slice((txPage-1)*pageSize,txPage*pageSize);
    const arr=(k)=>txSort.key===k?(txSort.dir==='asc'?'▲':'▼'):'';
    const accountName=(id)=>State.accountLabels?.[id]||State.accounts[id]?.name||id;
    const allPageIds=slice.map(t=>t.id);
    const allPageChecked=allPageIds.length&&allPageIds.every(id=>selectedTxIds.has(id));

    $('#txTable').innerHTML=`
      <thead><tr>
        <th style="width:32px"><input type="checkbox" id="txSelectAll" ${allPageChecked?'checked':''} title="Select all on page" style="accent-color:var(--teal)"></th>
        <th class="sortable" data-k="date">Date <span class="arr">${arr('date')}</span></th>
        <th>Account</th>
        <th class="sortable" data-k="description">Description <span class="arr">${arr('description')}</span></th>
        <th>Category</th>
        <th class="sortable" data-k="amount" style="text-align:right">Amount <span class="arr">${arr('amount')}</span></th>
        <th>Type</th>
      </tr></thead>
      <tbody>
        ${slice.map(t=>{
          const cats=(t.categories||[t.category]);
          let typeLabel, typeClass;
          if (t.type==='transfer') {
            const isOut=cats.includes('Transfer out'), isIn=cats.includes('Transfer in');
            typeLabel=isOut?'Transfer out':isIn?'Transfer in':'Transfer';
            typeClass=isOut?'chip xfer-out':isIn?'chip xfer-in':'chip';
          } else if (t.type==='credit'||t.amount>0) {
            typeLabel='Income'; typeClass='chip income';
          } else {
            typeLabel='Expense'; typeClass='chip debit';
          }
          const typeChip=`<span class="${typeClass}">${typeLabel}</span>`;
          const displayCats=cats.filter(c=>c!=='Transfer in'&&c!=='Transfer out');
          const subBadge=t.isSubscription?'<span class="chip sub" style="margin-left:4px">sub</span>':'';
          return `<tr class="click" data-id="${t.id}">
            <td onclick="event.stopPropagation()"><input type="checkbox" class="tx-chk" data-id="${t.id}" ${selectedTxIds.has(t.id)?'checked':''} style="accent-color:var(--teal)"></td>
            <td class="num">${dayjs(t.date).format('MMM D')}</td>
            <td><span class="chip">${escapeHtml(accountName(t.account))}</span></td>
            <td>${escapeHtml(t.description)}${subBadge}${t.notes?`<div class="muted" style="font-size:11px">${escapeHtml(t.notes)}</div>`:''}</td>
            <td><div class="cat-chips">${displayCats.map(c=>`<span class="chip">${escapeHtml(c)}</span>`).join('')}</div></td>
            <td class="num" style="text-align:right">${t.type==='transfer'?'<span class="amt-tx">'+fmt(t.amount)+'</span>':(t.amount>=0?'<span class="amt-pos">+'+fmt(t.amount).replace('-','')+'</span>':'<span class="amt-neg">'+fmt(t.amount)+'</span>')}</td>
            <td>${typeChip}</td>
          </tr>`;
        }).join('')}
      </tbody>`;
    $('#txCount').textContent=`${rows.length} transactions · page ${txPage} of ${pages}${selectedTxIds.size?` · ${selectedTxIds.size} selected`:''}`;
    $('#txPager').innerHTML=`
      <button class="btn ghost sm" ${txPage<=1?'disabled':''} onclick="txPage=Math.max(1,txPage-1);renderActive()">‹ Prev</button>
      <button class="btn ghost sm" ${txPage>=pages?'disabled':''} onclick="txPage=Math.min(${pages},txPage+1);renderActive()">Next ›</button>`;

    // Bulk bar visibility
    const bulkBar=$('#bulkBar');
    if (bulkBar) {
      bulkBar.style.display=selectedTxIds.size?'flex':'none';
      const bc=$('#bulkCount'); if (bc) bc.textContent=`${selectedTxIds.size} selected`;
    }

    // Wire sortable headers
    $$('#txTable th.sortable').forEach(th=>th.onclick=()=>{
      const k=th.dataset.k;
      if (txSort.key===k) txSort.dir=txSort.dir==='asc'?'desc':'asc';
      else { txSort.key=k; txSort.dir='desc'; }
      renderActive();
    });
    // Row click → drawer (not on checkbox cell)
    $$('#txTable tr.click').forEach(tr=>tr.onclick=()=>showTxDrawer(tr.dataset.id));
    // Individual checkboxes
    $$('.tx-chk').forEach(cb=>{
      cb.onchange=()=>{
        cb.checked?selectedTxIds.add(cb.dataset.id):selectedTxIds.delete(cb.dataset.id);
        const bc=$('#bulkCount'); if (bc) bc.textContent=`${selectedTxIds.size} selected`;
        const bar=$('#bulkBar'); if (bar) bar.style.display=selectedTxIds.size?'flex':'none';
        const cnt=$('#txCount'); if (cnt) cnt.textContent=`${rows.length} transactions · page ${txPage} of ${pages}${selectedTxIds.size?` · ${selectedTxIds.size} selected`:''}`;
        // Update select-all state
        const sa=$('#txSelectAll'); if (sa) sa.checked=allPageIds.every(id=>selectedTxIds.has(id));
      };
    });
    // Select-all checkbox
    const sa=$('#txSelectAll');
    if (sa) sa.onchange=()=>{
      allPageIds.forEach(id=>sa.checked?selectedTxIds.add(id):selectedTxIds.delete(id));
      renderTable();
    };
  };

  $('#txSearch').oninput=debounce((e)=>{txSearch=e.target.value;renderTable();},200);
  const txClearBtn=$('#txSearchClear');
  if (txClearBtn) txClearBtn.onclick=()=>{txSearch='';txPage=1;renderActive();};
  $('#txCat').onchange=(e)=>{txCatFilter=e.target.value;txPage=1;renderTable();};

  // Amount filter handlers
  $('#txAmtMode').onchange=(e)=>{
    txAmtMode=e.target.value; txAmtVal=null; txAmtVal2=null; txPage=1;
    const v=$('#txAmtVal'), sep=$('#txAmtSep'), v2=$('#txAmtVal2');
    if (v){ v.value=''; v.style.display=txAmtMode?'inline-block':'none'; }
    if (sep) sep.style.display=txAmtMode==='range'?'inline':'none';
    if (v2){ v2.value=''; v2.style.display=txAmtMode==='range'?'inline-block':'none'; }
    renderTable();
  };
  if ($('#txAmtVal')) $('#txAmtVal').oninput=debounce((e)=>{ txAmtVal=e.target.value?parseFloat(e.target.value):null; txPage=1; renderTable(); },300);
  if ($('#txAmtVal2')) $('#txAmtVal2').oninput=debounce((e)=>{ txAmtVal2=e.target.value?parseFloat(e.target.value):null; txPage=1; renderTable(); },300);

  // Bulk action handlers
  $('#bulkApplyCat').onclick=()=>{
    const cat=$('#bulkCatSel').value; if (!cat) return;
    let changed=0;
    selectedTxIds.forEach(id=>{
      const t=State.transactions.find(x=>x.id===id); if (!t) return;
      const ov=State.txOverrides[id]||{};
      ov.categories=[cat]; State.txOverrides[id]=ov; t.categories=[cat]; changed++;
    });
    if (changed) { lsSet('txOverrides',State.txOverrides); selectedTxIds.clear(); renderActive(); }
  };
  $('#bulkApplyType').onclick=()=>{
    const type=$('#bulkTypeSel').value; if (!type) return;
    let changed=0;
    selectedTxIds.forEach(id=>{
      const t=State.transactions.find(x=>x.id===id); if (!t) return;
      const ov=State.txOverrides[id]||{};
      ov.type=type;
      if (type==='transfer') {
        const existing=ov.categories||t.categories||[];
        const hasDir=existing.includes('Transfer in')||existing.includes('Transfer out');
        if (!hasDir){ ov.categories=[t.amount<0?'Transfer out':'Transfer in']; t.categories=ov.categories; }
      }
      State.txOverrides[id]=ov; t.type=type; changed++;
    });
    if (changed){ lsSet('txOverrides',State.txOverrides); selectedTxIds.clear(); renderActive(); }
  };
  $('#bulkMarkBill').onclick=()=>{
    selectedTxIds.forEach(id=>{
      const t=State.transactions.find(x=>x.id===id); if (!t) return;
      const ov=State.txOverrides[id]||{}; ov.isBill=true; State.txOverrides[id]=ov; t.isBill=true;
    });
    lsSet('txOverrides',State.txOverrides); selectedTxIds.clear(); renderActive();
  };
  $('#bulkMarkSub').onclick=()=>{
    selectedTxIds.forEach(id=>{
      const t=State.transactions.find(x=>x.id===id); if (!t) return;
      const ov=State.txOverrides[id]||{}; ov.isSubscription=true; State.txOverrides[id]=ov; t.isSubscription=true;
    });
    lsSet('txOverrides',State.txOverrides); selectedTxIds.clear(); renderActive();
  };
  $('#bulkClear').onclick=()=>{ selectedTxIds.clear(); renderActive(); };

  $('#txExport').onclick=()=>{
    const r=filteredTx();
    const csv=Papa.unparse(r.map(t=>({Date:dayjs(t.date).format('YYYY-MM-DD'),Account:State.accounts[t.account]?.name||t.account,Description:t.description,Categories:(t.categories||[t.category]).join(';'),Amount:t.amount,Type:t.type,Subscription:t.isSubscription?'Yes':'',Balance:t.balance,Notes:t.notes||''})));
    downloadFile('transactions.csv',csv,'text/csv');
  };
  renderTable();

  /* ---- Transaction Rules card ---- */
  const txRulesCard=document.createElement('div'); txRulesCard.className='card';
  txRulesCard.innerHTML=`
    <h2 class="section-title">Transaction Rules</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Automatically flag transactions as Bill, Subscription, or Recurring when their description contains a keyword.</p>
    <div class="row" style="margin-top:10px;align-items:flex-end;gap:8px;flex-wrap:wrap">
      <div style="flex:1;min-width:160px"><label class="lbl">Description contains</label><input class="input" id="txRuleContains" placeholder="e.g. NETFLIX, PLANET FITNESS"></div>
      <div><label class="lbl">Flag as</label>
        <select class="select" id="txRuleFlag">
          <option value="bill">Bill</option>
          <option value="subscription">Subscription</option>
          <option value="recurring">Recurring</option>
        </select>
      </div>
      <button class="btn sm" id="txRuleAdd">+ Add Rule</button>
    </div>
    <div class="hr"></div>
    <h3 style="margin-bottom:8px">Active Rules</h3>
    <div id="txRulesList">${(State.txRules||[]).map((r,i)=>`
      <div style="display:inline-flex;gap:6px;align-items:center;margin:3px 6px 3px 0;padding:4px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:99px;font-size:12px">
        <code>${escapeHtml(r.contains)}</code> → <strong>${r.flag}</strong>
        <button style="background:transparent;border:0;color:var(--red);cursor:pointer;font-size:14px;padding:0;line-height:1" data-tx-rule-del="${i}">×</button>
      </div>`).join('')||'<span class="muted">No rules yet.</span>'}</div>
    <div class="hr"></div>
    <button class="btn ghost sm" id="txRuleReapply">↻ Re-apply rules to all transactions</button>`;
  root.appendChild(txRulesCard);

  $('#txRuleAdd').onclick=()=>{
    const contains=$('#txRuleContains').value.trim();
    const flag=$('#txRuleFlag').value;
    if (!contains){ alert('Enter a keyword to match.'); return; }
    if ((State.txRules||[]).some(r=>r.contains.toLowerCase()===contains.toLowerCase()&&r.flag===flag)){
      alert('That rule already exists.'); return;
    }
    if (!State.txRules) State.txRules=[];
    State.txRules.push({contains,flag});
    lsSet('txRules',State.txRules);
    applyTxRulesToAll();
    renderActive();
  };
  $('#txRuleReapply').onclick=()=>{ applyTxRulesToAll(); renderActive(); };
  $$('[data-tx-rule-del]',txRulesCard).forEach(btn=>{
    btn.onclick=()=>{
      const i=parseInt(btn.dataset.txRuleDel);
      State.txRules.splice(i,1);
      lsSet('txRules',State.txRules);
      applyTxRulesToAll();
      renderActive();
    };
  });
});

function showTxDrawer(id) {
  const t=State.transactions.find(x=>x.id===id);
  if (!t) return;
  const cats=State.categories;
  const currentCats=t.categories||[t.category];
  const catsChecked=cats.map(c=>`
    <label class="check" style="margin:3px 10px 3px 0;display:inline-flex">
      <input type="checkbox" class="dCatCheck" value="${escapeHtml(c)}" ${currentCats.includes(c)?'checked':''}> ${escapeHtml(c)}
    </label>`).join('');

  openDrawer(`
    <div class="muted">${dayjs(t.date).format('dddd, MMM D, YYYY')}</div>
    <div style="font-size:18px;font-weight:600;margin:6px 0" class="${t.amount>=0?'amt-pos':'amt-neg'}">${fmt(t.amount)}</div>
    <div class="hr"></div>
    <label class="lbl">Description</label>
    <input class="input" id="dDesc" value="${escapeHtml(t.description)}">
    <label class="lbl" style="margin-top:10px">Account</label>
    <div><span class="chip">${State.accounts[t.account]?.name||t.account}</span></div>
    <label class="lbl" style="margin-top:10px">Categories (select one or more)</label>
    <div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:4px">${catsChecked}</div>
    <label class="lbl" style="margin-top:10px">Transaction Type</label>
    <select class="select" id="dType">
      <option value="debit" ${t.type==='debit'?'selected':''}>Expense</option>
      <option value="credit" ${t.type==='credit'?'selected':''}>Credit (income / payment)</option>
      <option value="transfer" ${t.type==='transfer'?'selected':''}>Transfer</option>
    </select>
    <label class="lbl" style="margin-top:10px">Notes</label>
    <textarea class="textarea" id="dNotes">${escapeHtml(t.notes||'')}</textarea>
    <div style="display:flex;gap:14px;margin-top:10px;flex-wrap:wrap">
      <label class="check"><input type="checkbox" id="dBill" ${t.isBill?'checked':''}> Bill</label>
      <label class="check"><input type="checkbox" id="dRec" ${t.isRecurring?'checked':''}> Recurring</label>
      <label class="check"><input type="checkbox" id="dSub" ${t.isSubscription?'checked':''}> Subscription</label>
    </div>
    <div class="hr"></div>
    <label class="lbl">Link to Budget / Bucket / Debt</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:4px">
      <select class="select" id="dLinkType" style="flex:0 0 120px">
        <option value="">None</option>
        ${State.budgets.length?`<option value="budget" ${(State.txOverrides[t.id]?.link?.type==='budget')?'selected':''}>Budget</option>`:''}
        ${State.buckets.length?`<option value="bucket" ${(State.txOverrides[t.id]?.link?.type==='bucket')?'selected':''}>Bucket</option>`:''}
        ${State.debts.length?`<option value="debt" ${(State.txOverrides[t.id]?.link?.type==='debt')?'selected':''}>Debt</option>`:''}
      </select>
      <select class="select" id="dLinkTarget" style="flex:1;display:${State.txOverrides[t.id]?.link?.type?'block':'none'}">
        ${(()=>{
          const lnk=State.txOverrides[t.id]?.link;
          if (!lnk||!lnk.type) return '';
          const items=lnk.type==='budget'?State.budgets:lnk.type==='bucket'?State.buckets:State.debts;
          return items.map((item,i)=>`<option value="${i}" ${lnk.idx===i?'selected':''}>${escapeHtml(item.name||item.merchant||item.category||'#'+i)}</option>`).join('');
        })()}
      </select>
    </div>
    <div class="hr"></div>
    <button class="btn" id="dSave">Save Changes</button>
    <button class="btn ghost" onclick="closeDrawer()" style="margin-left:8px">Cancel</button>
  `);
  // Wire link type → show/populate target dropdown
  $('#dLinkType').onchange=()=>{
    const type=$('#dLinkType').value;
    const tgt=$('#dLinkTarget');
    if (!type){ tgt.style.display='none'; tgt.innerHTML=''; return; }
    const items=type==='budget'?State.budgets:type==='bucket'?State.buckets:State.debts;
    tgt.innerHTML=items.map((item,i)=>`<option value="${i}">${escapeHtml(item.name||item.merchant||item.category||'#'+i)}</option>`).join('');
    tgt.style.display='block';
  };

  $('#dSave').onclick=()=>{
    const ov=State.txOverrides[t.id]||{};
    const selectedCats=[...$$(`.dCatCheck:checked`)].map(cb=>cb.value);
    ov.description=$('#dDesc').value.trim()||t._originalDesc;
    ov.categories=selectedCats.length?selectedCats:[t.category];
    ov.type=$('#dType').value;
    // Auto-assign transfer direction category so the Transfers tab picks it up
    if (ov.type==='transfer') {
      const hasDir=ov.categories.includes('Transfer in')||ov.categories.includes('Transfer out');
      if (!hasDir) ov.categories=[t.amount<0?'Transfer out':'Transfer in'];
    }
    ov.notes=$('#dNotes').value;
    ov.isBill=$('#dBill').checked;
    ov.isRecurring=$('#dRec').checked;
    ov.isSubscription=$('#dSub').checked;
    // Save link
    const linkType=$('#dLinkType').value;
    if (linkType) { ov.link={ type:linkType, idx:parseInt($('#dLinkTarget').value)||0 }; }
    else { delete ov.link; }
    State.txOverrides[t.id]=ov;
    lsSet('txOverrides',State.txOverrides);
    // Apply overrides to transaction object
    t.description=ov.description;
    t.categories=ov.categories;
    t.type=ov.type;
    t.notes=ov.notes;
    t.isBill=ov.isBill;
    t.isRecurring=ov.isRecurring;
    t.isSubscription=ov.isSubscription;
    closeDrawer(); renderActive();
  };
}

/* =================== INCOME =================== */
registerView('income','Income & Deposits',(root)=>{
  const allPos=filteredTx().filter(t=>t.amount>0&&t.type!=='transfer'&&!['Transfer','Transfer in','Transfer out'].includes(t.category));
  const txs=allPos.filter(t=>t.category!=='Returns');
  const returnsTxs=allPos.filter(t=>t.category==='Returns');
  const interestTxs=allPos.filter(t=>/interest/i.test(t.description)||t.category==='Interest');
  if (!allPos.length){ root.innerHTML=emptyCard('No income found in selected period.'); return; }
  const total=txs.reduce((s,t)=>s+t.amount,0);
  const interest=interestTxs.reduce((s,t)=>s+t.amount,0);
  const returns=returnsTxs.reduce((s,t)=>s+t.amount,0);
  const months=byMonth(filteredTx());
  const avgMonthly=months.length?months.reduce((s,m)=>s+m.income,0)/months.length:0;

  const range=State.range;
  let yoy=null;
  if (range.start&&range.end) {
    const days=(range.end-range.start)/86400000;
    const prevEnd=new Date(range.start); prevEnd.setDate(prevEnd.getDate()-1);
    const prevStart=new Date(prevEnd); prevStart.setDate(prevStart.getDate()-days);
    const prevIncome=State.transactions.filter(t=>t.amount>0&&t.type!=='transfer'&&t.date>=prevStart&&t.date<=prevEnd).reduce((s,t)=>s+t.amount,0);
    yoy=prevIncome>0?(total-prevIncome)/prevIncome:null;
  }

  const m=document.createElement('div'); m.className='grid grid-4';
  m.innerHTML=`
    <div class="card"><h3>Total Income</h3><div class="big num">${fmt(total)}</div><div class="footnote">${describeRange()}</div></div>
    <div class="card"><h3>Avg Monthly</h3><div class="big num">${fmt(avgMonthly)}</div><div class="footnote">Across ${months.length} months</div></div>
    <div class="card"><h3>Interest Earned</h3><div class="big num amt-pos">${fmt(interest)}</div><div class="footnote">${interestTxs.length} payment${interestTxs.length!==1?'s':''}</div></div>
    <div class="card"><h3>Returns / Refunds</h3><div class="big num">${fmt(returns)}</div><div class="footnote">${returnsTxs.length} transaction${returnsTxs.length!==1?'s':''}</div></div>`;
  root.appendChild(m);

  // By Source chart — fixed smaller size
  const charts=document.createElement('div'); charts.className='grid grid-2';
  charts.innerHTML=`
    <div class="card">
      <h2 class="section-title">By Source</h2>
      <div class="chart-wrap sm"><canvas id="incDonut"></canvas></div>
    </div>
    <div class="card">
      <h2 class="section-title">Monthly Income</h2>
      <div class="chart-wrap"><canvas id="incBar"></canvas></div>
    </div>`;
  root.appendChild(charts);

  const rec=detectRecurringDeposits(txs);
  if (rec.length) {
    const recCard=document.createElement('div'); recCard.className='card';
    recCard.innerHTML=`<h2 class="section-title">Recurring Deposits</h2>
      <table class="tbl"><thead><tr><th>Source</th><th>Avg Amount</th><th>Frequency</th><th>Last seen</th></tr></thead>
      <tbody>${rec.map(r=>`<tr><td>${escapeHtml(r.source)}</td><td class="num">${fmt(r.avg)}</td><td>${r.freq}</td><td>${dayjs(r.last).format('MMM D, YYYY')}</td></tr>`).join('')}</tbody></table>`;
    root.appendChild(recCard);
  }

  const tbl=document.createElement('div'); tbl.className='card';
  tbl.innerHTML=`<h2 class="section-title">Deposits</h2><table class="tbl">
    <thead><tr><th>Date</th><th>Source</th><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${txs.slice(0,200).map(t=>`<tr><td class="num">${dayjs(t.date).format('MMM D')}</td><td>${escapeHtml(t.description)}</td><td><span class="chip">${State.accounts[t.account]?.name||t.account}</span></td><td class="num amt-pos" style="text-align:right">+${fmt(t.amount).replace('-','')}</td></tr>`).join('')}</tbody></table>`;
  root.appendChild(tbl);

  setTimeout(()=>{
    const srcCats=byCategory(txs,'income');
    new Chart($('#incDonut'),{
      type:'doughnut',
      data:{labels:srcCats.map(c=>c.category),datasets:[{data:srcCats.map(c=>c.amount),backgroundColor:CHART_PALETTE}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:11}}}}}
    });
    new Chart($('#incBar'),{
      type:'bar',
      data:{labels:months.map(m=>m.month),datasets:[{label:'Income',data:months.map(m=>m.income),backgroundColor:'#00C49A',borderRadius:5}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'$'+v.toLocaleString()}}}}
    });
  },0);
});

/* =================== BILLS =================== */
registerView('bills','Bills',(root)=>{
  const recurring=detectRecurring();
  const bills=State.bills||[];

  // Summary
  const monthlySubs=recurring.filter(r=>r.isSubscription&&r.freq==='Monthly').reduce((s,r)=>s+r.avg,0)
    +recurring.filter(r=>r.isSubscription&&r.freq==='Annual').reduce((s,r)=>s+r.avg/12,0)
    +recurring.filter(r=>r.isSubscription&&r.freq==='Bi-weekly').reduce((s,r)=>s+r.avg*2.17,0);
  const monthlyBills=recurring.filter(r=>!r.isSubscription&&r.freq==='Monthly').reduce((s,r)=>s+r.avg,0);
  const upcoming=bills.filter(b=>!b.paid).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const overdue=upcoming.filter(b=>new Date(b.dueDate)<new Date()).length;

  const m=document.createElement('div'); m.className='grid grid-4';
  m.innerHTML=`
    <div class="card"><h3>Manual Bills</h3><div class="big num">${bills.length}</div><div class="footnote">${overdue} overdue</div></div>
    <div class="card"><h3>Auto-Detected Recurring</h3><div class="big num">${recurring.length}</div><div class="footnote">From transactions</div></div>
    <div class="card"><h3>Est. Monthly Bills</h3><div class="big num">${fmt(monthlyBills)}</div><div class="footnote">Utilities + recurring</div></div>
    <div class="card"><h3>Est. Monthly Subs</h3><div class="big num">${fmt(monthlySubs)}</div><div class="footnote">Subscriptions only</div></div>`;
  root.appendChild(m);

  // Bills, Utilities & Subscriptions from ALL transactions (not date-filtered)
  // Broad keyword match against description — no word-boundary tricks that miss common names
  const BILL_KW=/electric|water|gas(?:\s|&|$)|internet|comcast|xfinity|verizon|t-mobile|at&t|at &t|spectrum|cox\b|rent\b|mortgage|hoa\b|insurance|phone|utility|utilities|spotify|netflix|hulu|disney|apple\.com|icloud|prime\s|chatgpt|openai|adobe|dropbox|microsoft|github|youtube|sirius|cable|wireless|telecom|sewage|trash|garbage|subscription|membership|billing|dues\b|gym\b|planet fitness|audible|patreon|substack/i;
  // Match against category field too — Chase exports category names like "Phone & Communications"
  const BILL_CAT_KW=/bill|utilit|cable|internet|phone|telecom|subscri|rent|mortgage|insur|electric|gas\b|water|housing|membership/i;
  const billTxs=State.transactions.filter(t=>
    t.amount<0 && t.type!=='transfer' &&
    (
      (t.categories||[t.category]).some(c=>BILL_CAT_KW.test(c))
      || t.isBill || t.isSubscription || BILL_KW.test(t.description)
    )
  ).sort((a,b)=>b.date-a.date);

  const btCard=document.createElement('div'); btCard.className='card';
  btCard.innerHTML=`<h2 class="section-title">Bills, Utilities & Subscriptions (All Time)</h2>
    ${billTxs.length?`<table class="tbl" style="margin-top:8px">
      <thead><tr><th>Date</th><th>Description</th><th>Account</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${billTxs.slice(0,200).map(t=>`<tr>
        <td class="num">${dayjs(t.date).format('MMM D, YYYY')}</td>
        <td>${escapeHtml(t.description)}${t.isBill?'<span class="chip" style="margin-left:6px">bill</span>':''}${t.isSubscription?'<span class="chip sub" style="margin-left:4px">sub</span>':''}</td>
        <td><span class="chip">${State.accounts[t.account]?.name||t.account}</span></td>
        <td>${(t.categories||[t.category]).join(', ')}</td>
        <td class="num amt-neg" style="text-align:right">${fmt(t.amount)}</td>
      </tr>`).join('')}</tbody>
    </table>`:`<div class="insight" style="margin-top:10px">ℹ️ No bills, utilities, or subscriptions found. Load more CSV history or manually flag transactions as bills.</div>`}`;
  root.appendChild(btCard);

  // Auto-detected recurring
  const recCard=document.createElement('div'); recCard.className='card';
  recCard.innerHTML=`<h2 class="section-title">Auto-Detected Recurring Charges</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Confirm to add to bills calendar. Subscriptions are marked automatically.</p>
    <table class="tbl" style="margin-top:8px"><thead><tr><th>Merchant</th><th>Category</th><th style="text-align:right">Avg</th><th>Frequency</th><th>Next Due</th><th>Confidence</th><th></th></tr></thead>
    <tbody>${recurring.length?recurring.map(r=>{
      const status=State.recurringConfirmed[r.key]||'pending';
      return `<tr>
        <td><strong>${escapeHtml(r.merchant)}</strong>${r.isSubscription?' <span class="chip sub">sub</span>':''}</td>
        <td>${r.category}</td>
        <td class="num" style="text-align:right">${fmt(r.avg)}</td>
        <td>${r.freq}</td>
        <td>${dayjs(r.nextDue).format('MMM D')}</td>
        <td><span class="pill ${r.confidence>0.85?'good':'warn'}">${Math.round(r.confidence*100)}%</span></td>
        <td>${status==='confirmed'?'<span class="pill good">Confirmed</span>':status==='dismissed'?'<span class="pill bad">Dismissed</span>':`<button class="btn sm" onclick="confirmRecurring('${r.key}','${escapeAttr(r.merchant)}',${r.avg},'${r.freq}','${dayjs(r.nextDue).format('YYYY-MM-DD')}','${r.category}')">Add as Bill</button> <button class="btn ghost sm" onclick="dismissRecurring('${r.key}')">Dismiss</button>`}</td>
      </tr>`;
    }).join(''):'<tr><td colspan="7" class="muted">No recurring charges detected — load more history.</td></tr>'}</tbody></table>`;
  root.appendChild(recCard);

  // Manual bills
  const billsCard=document.createElement('div'); billsCard.className='card';
  billsCard.innerHTML=`<h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">Manual Bills <button class="btn sm" id="addBillBtn">+ Add Bill</button></h2>
    <table class="tbl" style="margin-top:8px"><thead><tr><th>Merchant</th><th>Category</th><th style="text-align:right">Amount</th><th>Frequency</th><th>Next Due</th><th>Status</th><th></th></tr></thead>
    <tbody id="billsTbody"></tbody></table>`;
  root.appendChild(billsCard);

  const renderBills=()=>{
    const today=new Date();
    $('#billsTbody').innerHTML=bills.length?bills.map((b,i)=>{
      const dd=new Date(b.dueDate);
      const days=Math.ceil((dd-today)/86400000);
      let sh;
      if (b.paid) sh='<span class="pill good">Paid</span>';
      else if (days<0) sh=`<span class="pill bad">Overdue ${Math.abs(days)}d</span>`;
      else if (days<=7) sh=`<span class="pill warn">Due in ${days}d</span>`;
      else sh=`<span class="pill">In ${days}d</span>`;
      return `<tr>
        <td>${escapeHtml(b.merchant)}</td>
        <td>${b.category||'—'}</td>
        <td class="num" style="text-align:right">${fmt(b.amount)}</td>
        <td>${b.frequency||'Monthly'}</td>
        <td>${dayjs(b.dueDate).format('MMM D, YYYY')}</td>
        <td>${sh}</td>
        <td><label class="check"><input type="checkbox" ${b.paid?'checked':''} onchange="toggleBillPaid(${i})"> Paid</label> <button class="btn ghost sm" onclick="deleteBill(${i})">×</button></td>
      </tr>`;
    }).join(''):'<tr><td colspan="7" class="muted">No bills yet. Confirm an auto-detected charge above or add one manually.</td></tr>';
  };
  renderBills();
  $('#addBillBtn').onclick=()=>showBillForm();

  // Collapsible bills calendar
  const calCard=document.createElement('div'); calCard.className='card';
  calCard.innerHTML=`
    <div class="cal-toggle" id="billsCalToggle" style="margin-bottom:0">
      <h2 class="section-title" style="margin:0;display:flex;align-items:center;gap:8px">
        Bills Calendar
        <span style="display:flex;gap:6px;font-size:11px;color:var(--text-3)">
          <span><span class="dot red"></span> overdue</span>
          <span><span class="dot amber"></span> due ≤7d</span>
          <span><span class="dot"></span> upcoming</span>
          <span><span class="dot gray"></span> paid</span>
        </span>
      </h2>
      <span class="arr">▼</span>
    </div>
    <div class="cal-body" id="billsCalBody"></div>`;
  root.appendChild(calCard);
  setTimeout(()=>{
    const calBody=$('#billsCalBody'), calToggle=$('#billsCalToggle');
    if (calBody) renderUpcomingCal(calBody);
    if (calToggle) calToggle.addEventListener('click',()=>{ calToggle.classList.toggle('open'); calBody.classList.toggle('open'); });
  },0);
});

/* =================== SPENDING =================== */
let spendingDrillCategory=null;
registerView('spending','Spending & Expenses',(root)=>{
  const txs=filteredTx().filter(t=>t.amount<0&&t.type!=='transfer'&&t.category!=='Transfer');
  if (!txs.length){ root.innerHTML=emptyCard('No expenses found in selected period.'); return; }
  const total=txs.reduce((s,t)=>s+Math.abs(t.amount),0);
  // Filter "Other" and blank categories from chart data — they're noise, not signal
  const cats=byCategory(filteredTx(),'expense').filter(c=>c.category&&c.category!=='Other');
  const months=byMonth(filteredTx());
  const avgDaily=total/Math.max(1,(State.range.start&&State.range.end?(State.range.end-State.range.start)/86400000:30));

  const m=document.createElement('div'); m.className='grid grid-4';
  m.innerHTML=`
    <div class="card"><h3>Total Spent</h3><div class="big num">${fmt(total)}</div><div class="footnote">${describeRange()}</div></div>
    <div class="card"><h3>Avg Daily</h3><div class="big num">${fmt(avgDaily)}</div><div class="footnote">In selected range</div></div>
    <div class="card"><h3>Top Category</h3><div class="big" style="font-size:18px">${cats[0]?cats[0].category:'—'}</div><div class="footnote">${cats[0]?fmt(cats[0].amount):''}</div></div>
    <div class="card"><h3>Transactions</h3><div class="big num">${txs.length}</div><div class="footnote">expense entries</div></div>`;
  root.appendChild(m);

  const row1=document.createElement('div'); row1.className='grid grid-2';
  row1.innerHTML=`
    <div class="card"><h2 class="section-title">By Category</h2><div class="chart-wrap tall"><canvas id="spBar"></canvas></div></div>
    <div class="card"><h2 class="section-title">Category Ranking</h2><div class="chart-wrap tall"><canvas id="spRanking"></canvas></div></div>`;
  root.appendChild(row1);

  const row2=document.createElement('div'); row2.className='grid grid-2';
  row2.innerHTML=`
    <div class="card"><h2 class="section-title">Monthly Spending Trend</h2><div class="chart-wrap"><canvas id="spTrend"></canvas></div></div>
    <div class="card"><h2 class="section-title">Daily Spending Heatmap (last 365d)</h2><div id="spHeat" style="margin-top:8px"></div></div>`;
  root.appendChild(row2);

  const merchantMap={};
  txs.forEach(t=>{ const k=(t.description||'').replace(/\d+/g,'').trim().slice(0,40)||t.description; if (!merchantMap[k]) merchantMap[k]={amount:0,count:0}; merchantMap[k].amount+=Math.abs(t.amount); merchantMap[k].count++; });
  const top=Object.entries(merchantMap).map(([k,v])=>({merchant:k,...v,avg:v.amount/v.count})).sort((a,b)=>b.amount-a.amount).slice(0,15);
  const merchCard=document.createElement('div'); merchCard.className='card';
  merchCard.innerHTML=`<h2 class="section-title">Top Merchants</h2>
    <table class="tbl" style="margin-top:8px"><thead><tr><th>Merchant</th><th style="text-align:right">Total</th><th style="text-align:right">Frequency</th><th style="text-align:right">Avg</th></tr></thead>
    <tbody>${top.map(t=>`<tr><td>${escapeHtml(t.merchant)}</td><td class="num" style="text-align:right">${fmt(t.amount)}</td><td class="num" style="text-align:right">${t.count}×</td><td class="num" style="text-align:right">${fmt(t.avg)}</td></tr>`).join('')}</tbody></table>`;
  root.appendChild(merchCard);

  if (spendingDrillCategory) {
    const drill=txs.filter(t=>(t.categories||[t.category]).includes(spendingDrillCategory)).sort((a,b)=>b.date-a.date);
    const dCard=document.createElement('div'); dCard.className='card';
    dCard.innerHTML=`<h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        ${escapeHtml(spendingDrillCategory)} — Transactions
        <button class="btn ghost sm" onclick="spendingDrillCategory=null;renderActive()">Clear ×</button>
      </h2>
      <p class="muted" style="font-size:12px;margin-top:4px">Click any row to edit.</p>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Date</th><th>Merchant</th><th>Account</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${drill.slice(0,200).map(t=>`<tr class="click" data-id="${t.id}" style="cursor:pointer">
        <td class="num">${dayjs(t.date).format('MMM D, YYYY')}</td>
        <td>${escapeHtml(t.description)}</td>
        <td><span class="chip">${State.accounts[t.account]?.name||t.account}</span></td>
        <td class="num amt-neg" style="text-align:right">${fmt(t.amount)}</td>
      </tr>`).join('')}</tbody></table>`;
    root.appendChild(dCard);
    // Wire up row clicks to the standard transaction edit drawer
    $$('tr.click', dCard).forEach(tr=>tr.onclick=()=>showTxDrawer(tr.dataset.id));
  }

  const mgmtCard=document.createElement('div'); mgmtCard.className='card';
  mgmtCard.innerHTML=`<h2 class="section-title">Category Rules</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">When a description contains "X", assign category "Y".</p>
    <div class="row" style="margin-top:10px;align-items:flex-end">
      <div style="flex:1"><label class="lbl">Contains</label><input class="input" id="ruleContains" placeholder="e.g. STARBUCKS"></div>
      <div style="flex:1"><label class="lbl">Category</label><select class="select" id="ruleCat">${State.categories.map(c=>`<option>${c}</option>`).join('')}</select></div>
      <button class="btn sm" onclick="addCatRule()">+ Add Rule</button>
    </div>
    <div class="hr"></div>
    <h3 style="margin-bottom:8px">Active Rules</h3>
    <div>${(State.categoryRules||[]).map((r,i)=>`<div style="display:inline-flex;gap:6px;align-items:center;margin:3px 6px 3px 0;padding:4px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:99px;font-size:12px">
      <code>${escapeHtml(r.contains)}</code> → <strong>${r.category}</strong> <button style="background:transparent;border:0;color:var(--red);cursor:pointer" onclick="delCatRule(${i})">×</button>
    </div>`).join('')||'<span class="muted">No custom rules.</span>'}</div>
    <div class="hr"></div>
    <button class="btn ghost sm" onclick="recategorizeAll()">↻ Re-apply rules to all transactions</button>`;
  root.appendChild(mgmtCard);

  setTimeout(()=>{
    // By Category — vertical bar
    if ($('#spBar')) new Chart($('#spBar'),{
      type:'bar',
      data:{labels:cats.map(c=>c.category),datasets:[{data:cats.map(c=>c.amount),backgroundColor:CHART_PALETTE,borderRadius:5}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.raw)}}},
        scales:{x:{ticks:{font:{size:10},maxRotation:35}},y:{ticks:{callback:v=>'$'+v.toLocaleString()}}},
        onClick:(e,el)=>{ if(el[0]){spendingDrillCategory=cats[el[0].index].category;renderActive();} }}
    });
    // Category Ranking — horizontal bar
    if ($('#spRanking')) new Chart($('#spRanking'),{
      type:'bar',
      data:{labels:cats.map(c=>c.category),datasets:[{data:cats.map(c=>c.amount),backgroundColor:CHART_PALETTE,borderRadius:4}]},
      options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>' '+fmt(ctx.raw)+' ('+((ctx.raw/total)*100).toFixed(0)+'%)'}}},
        scales:{x:{ticks:{callback:v=>'$'+v.toLocaleString()}},y:{ticks:{font:{size:11}}}},
        onClick:(e,el)=>{ if(el[0]){spendingDrillCategory=cats[el[0].index].category;renderActive();} }}
    });
    new Chart($('#spTrend'),{type:'line',data:{labels:months.map(m=>m.month),datasets:[{label:'Spending',data:months.map(m=>m.expense),borderColor:'#EF4444',backgroundColor:'rgba(239,68,68,.12)',fill:true,tension:.35,borderWidth:2,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'$'+v.toLocaleString()}}}}});
    renderHeatmap($('#spHeat'),txs);
  },0);
});

/* =================== TRANSFERS =================== */
let txFromFilter='all', txToFilter='all', txfSort={key:'date',dir:'desc'};

registerView('transfers','Transfers',(root)=>{
  const allTransfers=filteredTx().filter(t=>t.type==='transfer'||['Transfer','Transfer in','Transfer out'].includes(t.category));
  if (!allTransfers.length){ root.innerHTML=emptyCard('No transfers detected in selected period.'); return; }

  // Build paired list — each outgoing tx is matched with its incoming counterpart
  const pairs=[];
  const usedInPair=new Set();
  const outgoing=allTransfers.filter(t=>t.amount<0||t.categories?.includes('Transfer out'));
  const incoming=allTransfers.filter(t=>t.amount>0||t.categories?.includes('Transfer in'));

  for (const out of outgoing) {
    if (usedInPair.has(out.id)) continue;
    const match=incoming.find(inn=>
      !usedInPair.has(inn.id) &&
      inn.account!==out.account &&
      Math.abs(Math.abs(out.amount)-Math.abs(inn.amount))<1 &&
      Math.abs((out.date-inn.date)/86400000)<=2
    );
    if (match) {
      pairs.push({date:out.date,from:out.account,to:match.account,amount:Math.abs(out.amount),description:out.description,outId:out.id,inId:match.id});
      usedInPair.add(out.id); usedInPair.add(match.id);
    } else {
      pairs.push({date:out.date,from:out.account,to:'?',amount:Math.abs(out.amount),description:out.description,unmatched:true,outId:out.id});
      usedInPair.add(out.id);
    }
  }
  // Add any unmatched incoming
  for (const inn of incoming) {
    if (usedInPair.has(inn.id)) continue;
    pairs.push({date:inn.date,from:'?',to:inn.account,amount:Math.abs(inn.amount),description:inn.description,unmatched:true,inId:inn.id});
  }
  pairs.sort((a,b)=>b.date-a.date);

  const paths={};
  pairs.filter(p=>!p.unmatched).forEach(p=>{ const k=`${p.from}→${p.to}`; paths[k]=(paths[k]||0)+1; });
  const topPath=Object.entries(paths).sort((a,b)=>b[1]-a[1])[0];
  const total=pairs.reduce((s,p)=>s+p.amount,0);

  const m=document.createElement('div'); m.className='grid grid-3';
  m.innerHTML=`
    <div class="card"><h3>Total Transferred</h3><div class="big num">${fmt(total)}</div><div class="footnote">${pairs.length} transfers</div></div>
    <div class="card"><h3>Most Frequent Path</h3><div class="big" style="font-size:14px">${topPath?topPath[0].split('→').map(id=>State.accounts[id]?.name||id).join(' → '):'—'}</div><div class="footnote">${topPath?topPath[1]+' transfers':''}</div></div>
    <div class="card"><h3>Avg per Transfer</h3><div class="big num">${fmt(total/Math.max(1,pairs.length))}</div></div>`;
  root.appendChild(m);

  const flowCard=document.createElement('div'); flowCard.className='card';
  flowCard.innerHTML=`<h2 class="section-title">Account Flow</h2><div id="flowSvg" style="margin-top:12px;display:flex;justify-content:center"></div>`;
  root.appendChild(flowCard);

  // FROM / TO filter dropdowns
  const acctOptions=(sel)=>`<option value="all">All</option>`+
    Object.values(State.accounts).map(a=>`<option value="${a.id}" ${sel===a.id?'selected':''}>${escapeHtml(a.name)}</option>`).join('');

  const filterCard=document.createElement('div'); filterCard.className='card';
  filterCard.innerHTML=`
    <h2 class="section-title">Transfer History</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Click any row to view or edit transfer details.</p>
    <div class="row" style="margin-top:10px;align-items:flex-end;gap:12px">
      <div><label class="lbl">From Account</label><select class="select" id="txFrom" style="width:180px">${acctOptions(txFromFilter)}</select></div>
      <div><label class="lbl">To Account</label><select class="select" id="txTo" style="width:180px">${acctOptions(txToFilter)}</select></div>
    </div>
    <div style="margin-top:12px;overflow-x:auto">
    <table class="tbl" id="txfTable"><thead><tr>
      <th class="sortable" data-tfk="date" style="cursor:pointer">Date</th>
      <th>From</th><th>To</th><th>Description</th>
      <th class="sortable" data-tfk="amount" style="cursor:pointer;text-align:right">Amount</th>
    </tr></thead><tbody id="txfBody"></tbody></table>
    </div>`;
  root.appendChild(filterCard);

  const renderTxfTable=()=>{
    let rows=pairs.filter(p=>{
      if (txFromFilter!=='all'&&p.from!==txFromFilter) return false;
      if (txToFilter!=='all'&&p.to!==txToFilter) return false;
      return true;
    });
    rows.sort((a,b)=>{
      const av=txfSort.key==='amount'?a.amount:a.date;
      const bv=txfSort.key==='amount'?b.amount:b.date;
      if (av<bv) return txfSort.dir==='asc'?-1:1;
      if (av>bv) return txfSort.dir==='asc'?1:-1;
      return 0;
    });
    const arr=(k)=>txfSort.key===k?(txfSort.dir==='asc'?'▲':'▼'):'';
    // Update header arrows
    $$('#txfTable th.sortable').forEach(th=>{
      th.textContent=th.dataset.tfk==='date'?'Date '+arr('date'):'Amount '+arr('amount');
      th.style.textAlign=th.dataset.tfk==='amount'?'right':'';
    });
    $('#txfBody').innerHTML=rows.map(p=>`<tr class="click" style="cursor:pointer" data-out="${p.outId||''}" data-in="${p.inId||''}">
      <td class="num">${dayjs(p.date).format('MMM D')}</td>
      <td><span class="chip">${State.accounts[p.from]?.name||p.from}</span></td>
      <td><span class="chip">${p.to==='?'?'Unknown':State.accounts[p.to]?.name||p.to}</span></td>
      <td>${escapeHtml(p.description)}${p.unmatched?' <span class="pill warn">unmatched</span>':''}</td>
      <td class="num" style="text-align:right">${fmt(p.amount)}</td>
    </tr>`).join('');
    $$('#txfBody tr.click').forEach(tr=>tr.onclick=()=>showTransferDrawer(tr.dataset.out,tr.dataset.in));
    $$('#txfTable th.sortable').forEach(th=>th.onclick=()=>{
      const k=th.dataset.tfk;
      if (txfSort.key===k) txfSort.dir=txfSort.dir==='asc'?'desc':'asc';
      else { txfSort.key=k; txfSort.dir='desc'; }
      renderTxfTable();
    });
  };

  renderTxfTable();
  $('#txFrom').onchange=e=>{ txFromFilter=e.target.value; renderTxfTable(); };
  $('#txTo').onchange=e=>{ txToFilter=e.target.value; renderTxfTable(); };

  setTimeout(()=>renderTransferFlow($('#flowSvg'),paths),0);

  /* ---- Transfer Keywords Editor ---- */
  const kwCard=document.createElement('div'); kwCard.className='card';
  kwCard.innerHTML=`
    <h2 class="section-title">Transfer Keywords</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">
      Transactions whose description contains any of these keywords are automatically classified as transfers.
      Edit this list when you add a new bank that uses different terminology.
    </p>
    <div style="margin-top:10px" id="kwChips"></div>
    <div class="row" style="margin-top:10px;align-items:flex-end;max-width:400px">
      <div style="flex:1"><label class="lbl">New keyword</label><input class="input" id="newKw" placeholder="e.g. wire transfer"></div>
      <button class="btn sm" onclick="addTransferKeywordTransfers()">+ Add</button>
    </div>
    <div style="margin-top:10px">
      <button class="btn ghost sm" onclick="reapplyTransferKeywords()">↻ Re-apply to All Transactions</button>
    </div>`;
  root.appendChild(kwCard);
  renderKwChipsTransfers();
});

function showTransferDrawer(outId, inId) {
  const ids=[outId,inId].filter(Boolean);
  const txs=ids.map(id=>State.transactions.find(t=>t.id===id)).filter(Boolean);
  if (!txs.length) return;
  const primary=txs[0];
  openDrawer(`
    <div class="muted">${dayjs(primary.date).format('dddd, MMM D, YYYY')}</div>
    <div style="font-size:16px;font-weight:600;margin:6px 0">${fmt(Math.abs(primary.amount))}</div>
    <div style="margin-bottom:10px">${txs.map(t=>`<div style="display:flex;gap:8px;align-items:center;margin:4px 0">
      <span class="chip">${State.accounts[t.account]?.name||t.account}</span>
      <span class="chip ${t.amount<0?'xfer-out':'xfer-in'}">${t.amount<0?'Transfer out':'Transfer in'}</span>
    </div>`).join('')}</div>
    <div class="hr"></div>
    ${txs.map((t,i)=>`
      <div style="font-weight:500;font-size:12.5px;margin:10px 0 6px;color:var(--text-2)">${State.accounts[t.account]?.name||t.account} — ${t.amount<0?'Outgoing':'Incoming'}</div>
      <label class="lbl">Description</label>
      <input class="input" id="tdDesc_${i}" value="${escapeHtml(t.description)}">
      <label class="lbl" style="margin-top:8px">Notes</label>
      <textarea class="textarea" id="tdNotes_${i}" style="min-height:60px">${escapeHtml(t.notes||'')}</textarea>
    `).join('<div class="hr"></div>')}
    <div class="hr"></div>
    <button class="btn" id="tdSave">Save Changes</button>
    <button class="btn ghost" onclick="closeDrawer()" style="margin-left:8px">Cancel</button>
  `);
  $('#tdSave').onclick=()=>{
    txs.forEach((t,i)=>{
      const ov=State.txOverrides[t.id]||{};
      ov.description=$(`#tdDesc_${i}`).value.trim()||t._originalDesc;
      ov.notes=$(`#tdNotes_${i}`).value;
      State.txOverrides[t.id]=ov;
      t.description=ov.description;
      t.notes=ov.notes;
    });
    lsSet('txOverrides',State.txOverrides);
    closeDrawer(); renderActive();
  };
}

/* Transfer keywords helpers */
function renderKwChipsTransfers() {
  const el=$('#kwChips'); if (!el) return;
  const kws = State.transferKeywords || DEFAULT_TRANSFER_KEYWORDS;
  el.innerHTML=kws.map((k,i)=>`
    <span style="display:inline-flex;gap:6px;align-items:center;margin:3px 6px 3px 0;padding:4px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:99px;font-size:12px">
      ${escapeHtml(k)}
      <button style="background:transparent;border:0;color:var(--red);cursor:pointer" onclick="deleteTransferKeywordFromTransfers(${i})">×</button>
    </span>`).join('');
}

function addTransferKeywordTransfers() {
  const val=($('#newKw')||{}).value;
  if (!val||!val.trim()) return;
  const kw=val.trim().toLowerCase();
  if (!State.transferKeywords) State.transferKeywords=[...DEFAULT_TRANSFER_KEYWORDS];
  if (!State.transferKeywords.includes(kw)) {
    State.transferKeywords.push(kw);
    lsSet('transferKeywords', State.transferKeywords);
  }
  renderKwChipsTransfers();
  $('#newKw').value='';
}

function deleteTransferKeywordFromTransfers(i) {
  if (!State.transferKeywords) State.transferKeywords=[...DEFAULT_TRANSFER_KEYWORDS];
  State.transferKeywords.splice(i,1);
  lsSet('transferKeywords', State.transferKeywords);
  renderKwChipsTransfers();
}

function reapplyTransferKeywords() {
  // Re-run transfer detection against all loaded transactions
  // First reset type on all non-override transactions
  for (const t of State.transactions) {
    const ov=State.txOverrides[t.id]||{};
    if (!ov.type) {
      // Reset to amount-based default so detectTransfers() can re-classify
      if (t.type==='transfer') {
        t.type = t.amount < 0 ? 'debit' : 'credit';
        const dCats = t.categories.filter(c=>c!=='Transfer out'&&c!=='Transfer in');
        t.categories = dCats.length ? dCats : [t.amount<0?'Other':'Income'];
      }
    }
  }
  detectTransfers();
  renderActive();
  alert('Transfer detection re-applied to all transactions.');
}
