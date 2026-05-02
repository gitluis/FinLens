/* ================================================================
   FINLENS — views-plan.js
   Budgeting, Savings Buckets, Debt Tracker, Trends & Insights
================================================================ */

/* =================== BUDGETING =================== */
registerView('budgets','Budgeting',(root)=>{
  if (!State.budgets||!State.budgets.length) {
    const intro=document.createElement('div'); intro.className='card';
    intro.innerHTML=`<h2 class="section-title">Set Up Your Budget</h2>
      <p class="muted" style="margin-top:6px">Start with a suggested set or add custom categories.</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="seedBudgets()">Use suggested starter budget</button>
        <button class="btn ghost" onclick="addBudget()">+ Add custom budget</button>
      </div>`;
    root.appendChild(intro); return;
  }

  const monthStart=startOfMonth(new Date()), monthEnd=endOfMonth(new Date());
  const monthTxs=State.transactions.filter(t=>t.date>=monthStart&&t.date<=monthEnd&&t.amount<0&&t.type!=='transfer');
  const spent=(b)=>monthTxs.filter(t=>b.categories.some(c=>(t.categories||[t.category]).includes(c))).reduce((s,t)=>s+Math.abs(t.amount),0);

  const totalLimit=State.budgets.reduce((s,b)=>s+b.limit,0);
  const totalSpent=State.budgets.reduce((s,b)=>s+spent(b),0);
  const overBudget=State.budgets.filter(b=>spent(b)>b.limit);
  const warning=State.budgets.filter(b=>spent(b)/b.limit>=0.80&&spent(b)<=b.limit);

  if (overBudget.length||warning.length) {
    const banner=document.createElement('div');
    banner.className='insight '+(overBudget.length?'bad':'warn');
    banner.innerHTML=`<strong>${overBudget.length?overBudget.length+' over budget':warning.length+' approaching limit'}:</strong> ${(overBudget.length?overBudget:warning).map(b=>b.name).join(', ')}`;
    root.appendChild(banner);
  }

  const sum=document.createElement('div'); sum.className='grid grid-3';
  sum.innerHTML=`
    <div class="card"><h3>Total Budget</h3><div class="big num">${fmt(totalLimit)}</div><div class="footnote">${State.budgets.length} categories</div></div>
    <div class="card"><h3>Spent (This Month)</h3><div class="big num">${fmt(totalSpent)}</div><div class="footnote">${pct(totalSpent/Math.max(1,totalLimit),0)} of budget</div></div>
    <div class="card"><h3>Remaining</h3><div class="big num ${totalLimit-totalSpent>=0?'amt-pos':'amt-neg'}">${fmt(totalLimit-totalSpent)}</div><div class="footnote">${overBudget.length} over · ${warning.length} warning</div></div>`;
  root.appendChild(sum);

  const card=document.createElement('div'); card.className='card';
  card.innerHTML=`<h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">Budget vs Actual — ${dayjs(monthStart).format('MMMM YYYY')} <button class="btn sm" onclick="addBudget()">+ Add Budget</button></h2>
    <div style="margin-top:14px">${State.budgets.map((b,i)=>{
      const s=spent(b); const r=s/b.limit;
      const cls=r>1?'bad':r>=0.8?'warn':'';
      const remaining=b.limit-s;
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <div><strong style="color:${b.color||'var(--text)'}">${b.name}</strong> <span class="muted">· ${b.categories.join(', ')}</span></div>
          <div class="num">${fmt(s)} / ${fmt(b.limit)} <span class="muted">(${(r*100).toFixed(0)}%)</span> <button class="btn ghost sm" onclick="editBudget(${i})">edit</button> <button class="btn ghost sm" onclick="deleteBudget(${i})">×</button></div>
        </div>
        <div class="progress ${cls}"><div style="width:${Math.min(100,r*100)}%;background:${b.color||''}"></div></div>
        <div style="font-size:11.5px;margin-top:3px;color:${remaining<0?'var(--red)':'var(--text-3)'}">${remaining>=0?fmt(remaining)+' remaining':fmt(Math.abs(remaining))+' over'}</div>
      </div>`;
    }).join('')}</div>`;
  root.appendChild(card);

  const historyCard=document.createElement('div'); historyCard.className='card';
  historyCard.innerHTML=`<h2 class="section-title">Monthly History</h2><div class="chart-wrap"><canvas id="budgetHist"></canvas></div>`;
  root.appendChild(historyCard);

  setTimeout(()=>{
    const mos=[];
    for (let i=5;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); mos.push({key:monthKey(d),label:dayjs(d).format('MMM'),start:startOfMonth(d),end:endOfMonth(d)}); }
    const datasets=State.budgets.map(b=>({
      label:b.name,backgroundColor:b.color||'#94A3B8',borderRadius:4,
      data:mos.map(m=>{ const txs=State.transactions.filter(t=>t.date>=m.start&&t.date<=m.end&&t.amount<0&&t.type!=='transfer'&&b.categories.some(c=>(t.categories||[t.category]).includes(c))); return txs.reduce((s,t)=>s+Math.abs(t.amount),0); })
    }));
    new Chart($('#budgetHist'),{type:'bar',data:{labels:mos.map(m=>m.label),datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},scales:{x:{stacked:true},y:{stacked:true,ticks:{callback:v=>'$'+v.toLocaleString()}}}}});
  },0);
});

/* =================== SAVINGS BUCKETS =================== */
registerView('buckets','Savings Buckets',(root)=>{
  const balances=currentBalances();
  const totalSavings=Object.values(State.accounts).filter(a=>a.kind==='ally_savings').reduce((s,a)=>s+(balances[a.id]||0),0);
  const allocated=(State.buckets||[]).reduce((s,b)=>s+(b.current||0),0);
  const unalloc=totalSavings-allocated;
  const totalGoal=(State.buckets||[]).reduce((s,b)=>s+(b.goal||0),0);

  const m=document.createElement('div'); m.className='grid grid-4';
  m.innerHTML=`
    <div class="card"><h3>Total Savings</h3><div class="big num">${fmt(totalSavings)}</div><div class="footnote">Ally Savings balance</div></div>
    <div class="card"><h3>Allocated</h3><div class="big num">${fmt(allocated)}</div><div class="footnote">Across ${State.buckets.length} buckets</div></div>
    <div class="card"><h3>Unallocated</h3><div class="big num ${unalloc>=0?'amt-pos':'amt-neg'}">${fmt(unalloc)}</div><div class="footnote">${unalloc<0?'Over-allocated':'Available to assign'}</div></div>
    <div class="card"><h3>Total Goals</h3><div class="big num">${fmt(totalGoal)}</div><div class="footnote">${pct(allocated/Math.max(1,totalGoal),0)} of total goals</div></div>`;
  root.appendChild(m);

  const ctrl=document.createElement('div'); ctrl.className='card';
  ctrl.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><h2 class="section-title">Your Buckets</h2><button class="btn sm" onclick="editBucket(-1)">+ Add Bucket</button></div>`;
  root.appendChild(ctrl);

  if (!State.buckets.length) {
    const empty=document.createElement('div'); empty.className='empty';
    empty.innerHTML=`<h4>No buckets yet</h4><p>Split your savings into named goals like Emergency Fund, Vacation, Car Repair.</p>`;
    root.appendChild(empty); return;
  }

  const grid=document.createElement('div'); grid.className='grid grid-2';
  State.buckets.forEach((b,i)=>{
    const hasGoal=!!(b.goal&&b.goal>0);
    const r=hasGoal?(b.current||0)/b.goal:0;
    const daysLeft=b.targetDate?Math.ceil((new Date(b.targetDate)-new Date())/86400000):null;
    const card=document.createElement('div'); card.className='card'; card.style.cursor='pointer';
    card.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div><div style="font-size:18px;font-weight:600">${b.icon||'💰'} ${escapeHtml(b.name)}</div>
          ${b.targetDate?`<div class="muted" style="font-size:12px">Target ${dayjs(b.targetDate).format('MMM D, YYYY')} · ${daysLeft!==null?(daysLeft>=0?daysLeft+' days left':'overdue'):''}  </div>`:''}</div>
        <div style="display:flex;gap:6px;align-items:center">
          <button class="btn ghost sm" data-bkt-edit="${i}">edit</button>
          <button class="btn ghost sm" data-bkt-del="${i}">×</button>
        </div>
      </div>
      <div style="font-size:24px;font-weight:600;margin:10px 0 2px" class="num">${fmt(b.current||0)}${hasGoal?` <span class="muted" style="font-size:13px;font-weight:400">of ${fmt(b.goal)}</span>`:''}</div>
      ${hasGoal?`
        <div class="progress" style="margin:8px 0 4px"><div style="width:${Math.min(100,r*100).toFixed(1)}%;background:${b.color||'var(--teal)'}"></div></div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--text-3)">
          <span>${(r*100).toFixed(0)}% complete</span>
          <span>${fmt(Math.max(0,b.goal-(b.current||0)))} to go</span>
        </div>`:
        '<div style="font-size:11.5px;color:var(--text-3);margin-top:6px">No goal set</div>'
      }`;
    // Drill-down: click card body (not buttons) opens drawer
    card.addEventListener('click', e=>{
      if (e.target.closest('[data-bkt-edit],[data-bkt-del]')) return;
      showBucketDrawer(i);
    });
    card.querySelector('[data-bkt-edit]').onclick=(e)=>{ e.stopPropagation(); editBucket(i); };
    card.querySelector('[data-bkt-del]').onclick=(e)=>{ e.stopPropagation(); deleteBucket(i); };
    grid.appendChild(card);
  });
  root.appendChild(grid);
});

/* =================== BUCKET DRAWER =================== */
function showBucketDrawer(i) {
  const b=State.buckets[i];
  if (!b) return;

  const hasGoal=!!(b.goal&&b.goal>0);
  const r=hasGoal?(b.current||0)/b.goal:0;
  const daysLeft=b.targetDate?Math.ceil((new Date(b.targetDate)-new Date())/86400000):null;
  const pctComplete=hasGoal?(r*100).toFixed(0):null;

  // Transactions linked to this bucket via txOverrides
  const linked=State.transactions.filter(t=>{
    const lnk=State.txOverrides[t.id]?.link;
    return lnk&&lnk.type==='bucket'&&lnk.idx===i;
  }).sort((a,b)=>b.date-a.date);

  // Savings account deposits in the date range that could relate (any positive transfer into savings)
  const savingsDeposits=State.transactions.filter(t=>
    (t.account==='ally_savings'||State.accounts[t.account]?.kind==='ally_savings')&&
    t.amount>0&&t.type!=='transfer'
  ).slice(0,10);

  openDrawer(`
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <span style="font-size:32px;line-height:1">${b.icon||'💰'}</span>
      <div>
        <div style="font-size:20px;font-weight:700;color:var(--text)">${escapeHtml(b.name)}</div>
        ${b.targetDate?`<div class="muted" style="font-size:12px;margin-top:2px">
          Target: ${dayjs(b.targetDate).format('MMM D, YYYY')}
          ${daysLeft!==null?(daysLeft>=0?` · <span style="color:${daysLeft<=7?'var(--amber)':'var(--text-3)'}">${daysLeft} days left</span>`:' · <span style="color:var(--red)">Overdue</span>'):''}
        </div>`:''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr${hasGoal?' 1fr':''};gap:10px;margin-bottom:14px">
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
        <div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Current</div>
        <div class="num" style="font-size:22px;font-weight:700;color:var(--teal)">${fmt(b.current||0)}</div>
      </div>
      ${hasGoal?`<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:12px">
        <div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Goal</div>
        <div class="num" style="font-size:22px;font-weight:700">${fmt(b.goal)}</div>
      </div>`:''}
    </div>

    ${hasGoal?`
    <div class="progress" style="margin-bottom:6px"><div style="width:${Math.min(100,r*100).toFixed(1)}%;background:${b.color||'var(--teal)'}"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2);margin-bottom:14px">
      <span><strong>${pctComplete}%</strong> complete</span>
      <span><strong>${fmt(Math.max(0,b.goal-(b.current||0)))}</strong> remaining</span>
    </div>`:''}

    <div class="hr"></div>

    <div style="font-weight:600;font-size:13px;margin-bottom:8px">
      Linked Transactions
      <span class="muted" style="font-size:11.5px;font-weight:400"> — ${linked.length} linked</span>
    </div>
    ${linked.length?`
      <table class="tbl" style="margin-bottom:10px">
        <thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${linked.map(t=>`<tr>
          <td class="num" style="white-space:nowrap">${dayjs(t.date).format('MMM D, YYYY')}</td>
          <td style="font-size:12px">${escapeHtml(t.description)}</td>
          <td class="num ${t.amount<0?'amt-neg':'amt-pos'}" style="text-align:right">${fmt(t.amount)}</td>
        </tr>`).join('')}</tbody>
      </table>`
    :`<p class="muted" style="font-size:12.5px;margin-bottom:10px">
        No transactions linked yet. Open any transaction, click its row to edit, and use <strong>Link to → Bucket → ${escapeHtml(b.name)}</strong>.
      </p>`}

    <div class="hr"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn sm" id="bktDrawerEdit">✎ Edit Bucket</button>
      <button class="btn ghost sm" id="bktDrawerDel" style="color:var(--red)">Delete</button>
      <button class="btn ghost sm" onclick="closeDrawer()" style="margin-left:auto">Close</button>
    </div>
  `);

  $('#bktDrawerEdit').onclick=()=>{ closeDrawer(); editBucket(i); };
  $('#bktDrawerDel').onclick=()=>{ if(confirm(`Delete "${b.name}"?`)){ deleteBucket(i); closeDrawer(); } };
}

/* =================== DEBT TRACKER =================== */
registerView('debt','Debt Tracker',(root)=>{
  const debts=State.debts||[];
  const totalDebt=debts.reduce((s,d)=>s+(d.balance||0),0);
  const totalLimit=debts.filter(d=>d.type==='Credit Card').reduce((s,d)=>s+(d.limit||0),0);
  const totalMin=debts.reduce((s,d)=>s+(d.minPayment||0),0);
  const wAPR=totalDebt>0?debts.reduce((s,d)=>s+(d.balance||0)*(d.apr||0)/100,0)/totalDebt:0;
  const utilization=totalLimit>0?totalDebt/totalLimit:null;

  const m=document.createElement('div'); m.className='grid grid-4';
  m.innerHTML=`
    <div class="card"><h3>Total Debt</h3><div class="big num">${fmt(totalDebt)}</div><div class="footnote">${debts.length} accounts</div></div>
    <div class="card"><h3>Weighted APR</h3><div class="big num">${(wAPR).toFixed(2)}%</div></div>
    <div class="card"><h3>Min Payments / mo</h3><div class="big num">${fmt(totalMin)}</div></div>
    <div class="card"><h3>Credit Utilization</h3><div class="big num ${utilization>0.3?'amt-neg':'amt-pos'}">${utilization==null?'—':(utilization*100).toFixed(0)+'%'}</div></div>`;
  root.appendChild(m);

  const ctrl=document.createElement('div'); ctrl.className='card';
  ctrl.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><h2 class="section-title">Debt Accounts</h2><button class="btn sm" onclick="editDebt(-1)">+ Add Debt</button></div>
    ${debts.length?`<table class="tbl" style="margin-top:8px"><thead><tr><th>Name</th><th>Type</th><th style="text-align:right">Balance</th><th style="text-align:right">APR</th><th style="text-align:right">Min Pmt</th><th>Due</th><th></th></tr></thead>
    <tbody>${debts.map((d,i)=>`<tr>
      <td><strong>${escapeHtml(d.name)}</strong></td>
      <td>${d.type}</td>
      <td class="num" style="text-align:right">${fmt(d.balance)}</td>
      <td class="num" style="text-align:right">${(d.apr||0).toFixed(2)}%</td>
      <td class="num" style="text-align:right">${fmt(d.minPayment||0)}</td>
      <td>${d.dueDay?'Day '+d.dueDay:'—'}</td>
      <td><button class="btn ghost sm" onclick="editDebt(${i})">edit</button> <button class="btn ghost sm" onclick="deleteDebt(${i})">×</button></td>
    </tr>`).join('')}</tbody></table>`:'<p class="muted" style="margin-top:8px">No debts tracked yet.</p>'}`;
  root.appendChild(ctrl);

  if (!debts.length) return;

  const stratCard=document.createElement('div'); stratCard.className='card';
  stratCard.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><h2 class="section-title">Payoff Strategy</h2>
    <div class="range-btns">
      <button class="${(State.payoffStrategy||'avalanche')==='avalanche'?'active':''}" onclick="setPayoffStrategy('avalanche')">Avalanche (highest APR)</button>
      <button class="${State.payoffStrategy==='snowball'?'active':''}" onclick="setPayoffStrategy('snowball')">Snowball (lowest balance)</button>
    </div></div>
    <div style="margin-bottom:10px"><label class="lbl">Extra monthly payment ($)</label><input class="input" id="extraPay" type="number" step="10" style="max-width:200px" value="${State.extraPayment||0}" oninput="State.extraPayment=parseFloat(this.value)||0;renderActive()"></div>
    <div id="payoffPlan"></div>`;
  root.appendChild(stratCard);

  const strategy=State.payoffStrategy||'avalanche';
  const extra=State.extraPayment||0;
  const sortedDebts=[...debts].sort((a,b)=>strategy==='avalanche'?(b.apr||0)-(a.apr||0):(a.balance||0)-(b.balance||0));
  const schedule=simulatePayoff(sortedDebts,extra);
  setTimeout(()=>{
    if (!$('#payoffPlan')) return;
    $('#payoffPlan').innerHTML=`
      <div class="grid grid-3" style="margin-bottom:10px">
        <div class="card"><h3>Months to Debt-Free</h3><div class="big num">${schedule.months}</div><div class="footnote">${(schedule.months/12).toFixed(1)} years</div></div>
        <div class="card"><h3>Total Interest</h3><div class="big num">${fmt(schedule.totalInterest)}</div></div>
        <div class="card"><h3>Focus Order</h3><div style="font-size:13px;line-height:1.6">${sortedDebts.map((d,i)=>`<div>${i+1}. ${escapeHtml(d.name)}</div>`).join('')}</div></div>
      </div>
      <h3 style="margin-bottom:6px">Month-by-Month (first 24 mos)</h3>
      <div style="max-height:280px;overflow-y:auto"><table class="tbl"><thead><tr><th>Month</th><th>Balance</th><th>Interest</th><th>Payment</th></tr></thead>
      <tbody>${schedule.rows.slice(0,24).map(r=>`<tr><td>${r.month}</td><td class="num">${fmt(r.balance)}</td><td class="num">${fmt(r.interest)}</td><td class="num">${fmt(r.payment)}</td></tr>`).join('')}</tbody></table></div>`;
  },0);
});

/* =================== TRENDS & INSIGHTS =================== */
registerView('trends','Trends & Insights',(root)=>{
  if (!State.transactions.length){ root.innerHTML=emptyCard('Load data to see trends.'); return; }
  const months=byMonth(State.transactions);
  const now=new Date();
  const thisMonthStart=startOfMonth(now), thisMonthEnd=endOfMonth(now);
  const lastMonthStart=startOfMonth(new Date(now.getFullYear(),now.getMonth()-1,1));
  const lastMonthEnd=endOfMonth(lastMonthStart);
  const catThis=byCategory(State.transactions.filter(t=>t.date>=thisMonthStart&&t.date<=thisMonthEnd),'expense');
  const catLast=byCategory(State.transactions.filter(t=>t.date>=lastMonthStart&&t.date<=lastMonthEnd),'expense');
  const catLastMap=Object.fromEntries(catLast.map(c=>[c.category,c.amount]));
  const catChanges=catThis.map(c=>({category:c.category,this:c.amount,last:catLastMap[c.category]||0,pctChange:catLastMap[c.category]?(c.amount-catLastMap[c.category])/catLastMap[c.category]:null})).sort((a,b)=>(b.this-b.last)-(a.this-a.last));

  const incomeThisMo=months.find(m=>m.month===monthKey(now))?.income||0;
  const incomeLastMo=months.find(m=>m.month===monthKey(lastMonthStart))?.income||0;
  const incomeChange=incomeLastMo>0?(incomeThisMo-incomeLastMo)/incomeLastMo:null;
  const incomes=months.map(m=>m.income).filter(x=>x>0);
  const meanInc=incomes.reduce((s,x)=>s+x,0)/Math.max(1,incomes.length);
  const stdInc=Math.sqrt(incomes.reduce((s,x)=>s+(x-meanInc)**2,0)/Math.max(1,incomes.length));
  const cov=meanInc>0?stdInc/meanInc:0;
  const stability=cov<0.1?'Very stable':cov<0.25?'Stable':cov<0.5?'Variable':'Highly variable';
  const savingsRates=months.map(m=>({month:m.month,rate:m.income>0?(m.income-m.expense)/m.income:0}));
  const rollingSpending=months.map((m,i)=>{ const slice=months.slice(Math.max(0,i-2),i+1); return {month:m.month,avg:slice.reduce((s,x)=>s+x.expense,0)/slice.length}; });
  const merchantFreq={};
  State.transactions.filter(t=>t.amount<0&&t.type!=='transfer').forEach(t=>{ const k=(t.description||'').replace(/\d+/g,'').trim().slice(0,30); merchantFreq[k]=(merchantFreq[k]||0)+1; });
  const topFreq=Object.entries(merchantFreq).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const m=document.createElement('div'); m.className='grid grid-3';
  m.innerHTML=`
    <div class="card"><h3>Income MoM</h3><div class="big num ${incomeChange>=0?'amt-pos':'amt-neg'}">${incomeChange==null?'—':pct(incomeChange)}</div><div class="footnote">${fmt(incomeThisMo)} vs ${fmt(incomeLastMo)}</div></div>
    <div class="card"><h3>Income Stability</h3><div class="big" style="font-size:18px">${stability}</div><div class="footnote">CoV ${(cov*100).toFixed(0)}%</div></div>
    <div class="card"><h3>Savings Rate (curr mo)</h3><div class="big num">${pct(savingsRates[savingsRates.length-1]?.rate||0)}</div></div>`;
  root.appendChild(m);

  const catCard=document.createElement('div'); catCard.className='card';
  catCard.innerHTML=`<h2 class="section-title">Category Spending: This Month vs Last</h2>
    <table class="tbl" style="margin-top:8px"><thead><tr><th>Category</th><th style="text-align:right">This Month</th><th style="text-align:right">Last Month</th><th style="text-align:right">Δ</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${catChanges.map(c=>{ const delta=c.this-c.last; const cls=delta>0?'amt-neg':'amt-pos'; return `<tr><td>${c.category}</td><td class="num" style="text-align:right">${fmt(c.this)}</td><td class="num" style="text-align:right">${fmt(c.last)}</td><td class="num ${cls}" style="text-align:right">${delta>0?'▲':'▼'} ${fmt(Math.abs(delta))}</td><td class="num ${cls}" style="text-align:right">${c.pctChange==null?'—':pct(c.pctChange,0)}</td></tr>`; }).join('')}</tbody></table>`;
  root.appendChild(catCard);

  const chartsRow=document.createElement('div'); chartsRow.className='grid grid-2';
  chartsRow.innerHTML=`
    <div class="card"><h2 class="section-title">3-Month Rolling Avg Spending</h2><div class="chart-wrap"><canvas id="trRoll"></canvas></div></div>
    <div class="card"><h2 class="section-title">Savings Rate Trend</h2><div class="chart-wrap"><canvas id="trSav"></canvas></div></div>`;
  root.appendChild(chartsRow);

  const freqCard=document.createElement('div'); freqCard.className='card';
  freqCard.innerHTML=`<h2 class="section-title">Most Visited Merchants</h2><div class="chart-wrap"><canvas id="trFreq"></canvas></div>`;
  root.appendChild(freqCard);

  const insights=generateInsights(catChanges,incomeChange,savingsRates,State.transactions);
  const insightCard=document.createElement('div'); insightCard.className='card';
  insightCard.innerHTML=`<h2 class="section-title">Auto-Generated Insights</h2>
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">${insights.map(ins=>`<div class="insight ${ins.tone||''}">${ins.text}</div>`).join('')}</div>`;
  root.appendChild(insightCard);

  setTimeout(()=>{
    new Chart($('#trRoll'),{type:'line',data:{labels:rollingSpending.map(r=>r.month),datasets:[
      {label:'Monthly',data:months.map(m=>m.expense),borderColor:'#94A3B8',borderDash:[4,4],pointRadius:0,tension:.3,fill:false},
      {label:'3-mo Rolling',data:rollingSpending.map(r=>r.avg),borderColor:'#EF4444',backgroundColor:'rgba(239,68,68,.12)',fill:true,tension:.35,borderWidth:2}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},scales:{y:{ticks:{callback:v=>'$'+v.toLocaleString()}}}}});
    new Chart($('#trSav'),{type:'line',data:{labels:savingsRates.map(r=>r.month),datasets:[{label:'Savings Rate',data:savingsRates.map(r=>r.rate*100),borderColor:'#00C49A',backgroundColor:'rgba(0,196,154,.15)',fill:true,tension:.35,borderWidth:2,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v.toFixed(0)+'%'}}}}});
    new Chart($('#trFreq'),{type:'bar',data:{labels:topFreq.map(t=>t[0].slice(0,28)),datasets:[{label:'Visits',data:topFreq.map(t=>t[1]),backgroundColor:'#8B5CF6',borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}}}});
  },0);
});

function generateInsights(catChanges, incomeChange, savingsRates, allTxs) {
  const out=[];
  const big=catChanges.find(c=>c.pctChange!=null&&Math.abs(c.pctChange)>0.3&&c.this>50);
  if (big) {
    if (big.pctChange>0) out.push({tone:'warn',text:`<strong>${big.category} up ${(big.pctChange*100).toFixed(0)}%</strong> vs last month — ${fmt(big.this-big.last)} more than usual.`});
    else out.push({tone:'',text:`<strong>${big.category} down ${(Math.abs(big.pctChange)*100).toFixed(0)}%</strong> vs last month — saved ${fmt(big.last-big.this)}.`});
  }
  const biggest=allTxs.filter(t=>t.amount<0&&t.type!=='transfer').sort((a,b)=>a.amount-b.amount)[0];
  if (biggest) out.push({tone:'',text:`Largest single expense: <strong>${fmt(Math.abs(biggest.amount))}</strong> at ${escapeHtml(biggest.description)} on ${dayjs(biggest.date).format('MMM D')}.`});
  const recent=savingsRates.slice(-3).map(r=>r.rate);
  if (recent.length===3&&recent.every(r=>r>0.2)) out.push({tone:'',text:`<strong>Strong savings discipline</strong> — savings rate above 20% for the last 3 months.`});
  if (recent.length&&recent[recent.length-1]<0) out.push({tone:'bad',text:`<strong>Negative cash flow</strong> in the most recent month — spending exceeded income.`});
  if (incomeChange!=null&&Math.abs(incomeChange)>0.1) out.push({tone:incomeChange>0?'':'warn',text:`Income ${incomeChange>0?'increased':'decreased'} <strong>${pct(Math.abs(incomeChange))}</strong> vs last month.`});
  const recurring=detectRecurring().filter(r=>r.isSubscription);
  if (recurring.length>5) out.push({tone:'warn',text:`You have <strong>${recurring.length} active subscriptions</strong> — consider auditing for unused services.`});
  if (!out.length) out.push({tone:'',text:'Not enough data yet for personalized insights — check back after a few more weeks of transactions.'});
  return out;
}
