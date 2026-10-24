/* ================================================================
   FINLENS — aggregation.js
   Pure data aggregation helpers: sums, groupings, recurring detection.
   Depends on: core.js (State, monthKey).
   Loaded after core.js, before db.js.
================================================================ */

/* ---------- SIMPLE SUMS ---------- */
function sumIncome(txs) {
  return txs.filter(t=>t.amount>0&&t.type!=='transfer'&&t.type!=='payment'&&t.category!=='Transfer').reduce((s,t)=>s+t.amount,0);
}
function sumExpense(txs) {
  return txs.filter(t=>t.amount<0&&t.type!=='transfer'&&t.category!=='Transfer').reduce((s,t)=>s+Math.abs(t.amount),0);
}
function sumTransfers(txs) {
  return txs.filter(t=>t.type==='transfer'||t.category==='Transfer').reduce((s,t)=>s+Math.abs(t.amount),0)/2;
}

/* ---------- GROUPING ---------- */
function byCategory(txs, signFilter) {
  const m={};
  for (const t of txs) {
    if (t.type==='transfer'||['Transfer','Transfer in','Transfer out'].includes(t.category)) continue;
    if (signFilter==='expense'&&t.amount>=0) continue;
    if (signFilter==='income'&&t.amount<=0) continue;
    const cats = Array.isArray(t.categories)&&t.categories.length ? t.categories : [t.category||'Other'];
    const v = Math.abs(t.amount)/cats.length;
    cats.forEach(c=>{ m[c]=(m[c]||0)+v; });
  }
  return Object.entries(m).map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount);
}
function byMonth(txs) {
  const m={};
  for (const t of txs) {
    const k=monthKey(t.date);
    if (!m[k]) m[k]={month:k,income:0,expense:0,transfer:0};
    if (t.type==='transfer'||t.category==='Transfer') m[k].transfer+=Math.abs(t.amount)/2;
    else if (t.amount>0) m[k].income+=t.amount;
    else m[k].expense+=Math.abs(t.amount);
  }
  return Object.values(m).sort((a,b)=>a.month.localeCompare(b.month));
}

/* ---------- BALANCE COMPUTATION ---------- */
function currentBalances() {
  const out={};
  Object.values(State.accounts).forEach(a=>{
    if (State.manualBalances[a.id]!=null) { out[a.id]=Number(State.manualBalances[a.id]); return; }
    const withBal=State.transactions.filter(t=>t.account===a.id&&t.balance!=null).sort((x,y)=>y.date-x.date)[0];
    if (withBal) { out[a.id]=withBal.balance; return; }
    out[a.id]=State.transactions.filter(t=>t.account===a.id).reduce((s,t)=>s+t.amount,0);
  });
  return out;
}

/* Return the account balance as of the end of the current range.
   Uses running balance from CSV when available, otherwise sums
   transactions from initial balance up to the period end. */
function periodEndBalance(accountId) {
  const r=State.range;
  // For "all time" use the normal current-balance logic
  if (!r.start&&!r.end) return currentBalances()[accountId];
  const endDate=r.end||new Date();

  // Transactions with an explicit running balance (not currently populated — reserved for future bank formats)
  const txsWithBal=State.transactions.filter(t=>t.account===accountId&&t.balance!=null&&t.date<=endDate).sort((a,b)=>b.date-a.date);
  if (txsWithBal.length) return txsWithBal[0].balance;

  // Manual override: if period end is within last 7 days, the manual balance is the current balance
  if (State.manualBalances[accountId]!=null) {
    const daysDiff=(new Date()-endDate)/86400000;
    if (daysDiff<=7) return Number(State.manualBalances[accountId]);
    // For older periods: current manual balance minus transactions that occurred after period end
    const afterEnd=State.transactions.filter(t=>t.account===accountId&&t.date>endDate).reduce((s,t)=>s+t.amount,0);
    return Number(State.manualBalances[accountId])-afterEnd;
  }

  // Fallback: initial balance + sum of all transactions up to period end
  const initial=State.manualBalances[accountId+'_initial']!=null?Number(State.manualBalances[accountId+'_initial']):0;
  const sum=State.transactions.filter(t=>t.account===accountId&&t.date<=endDate).reduce((s,t)=>s+t.amount,0);
  return initial+sum;
}

/* ---------- RECURRING DETECTION ---------- */
const SUBS_KEYWORDS = ['NETFLIX','SPOTIFY','HULU','DISNEY+','APPLE.COM','ICLOUD','GOOGLE STORAGE','PRIME VIDEO','HBO','PARAMOUNT','PEACOCK','YOUTUBE','ADOBE','DROPBOX','MICROSOFT 365','LINKEDIN','NYTIMES','WSJ','AUDIBLE','PATREON','SUBSTACK','CHATGPT','ANTHROPIC','OPENAI','MIDJOURNEY','CANVA','NORDVPN','EXPRESSVPN','GITHUB'];

function detectRecurring() {
  const txs=State.transactions.filter(t=>t.amount<0&&t.type!=='transfer'&&t.category!=='Transfer');
  const groups={};
  for (const t of txs) {
    const key=t._originalDesc||t.description;
    const k=key.toUpperCase().replace(/[^A-Z ]/g,'').replace(/\s+/g,' ').trim().slice(0,30);
    if (!k) continue;
    if (!groups[k]) groups[k]={items:[]};
    groups[k].items.push(t);
  }
  const out=[];
  for (const k in groups) {
    const items=groups[k].items.sort((a,b)=>a.date-b.date);
    if (items.length<2) continue;
    const avg=items.reduce((s,t)=>s+Math.abs(t.amount),0)/items.length;
    const within=items.every(t=>Math.abs(Math.abs(t.amount)-avg)/avg<0.10);
    if (!within) continue;
    const gaps=[];
    for (let i=1;i<items.length;i++) gaps.push((items[i].date-items[i-1].date)/86400000);
    const avgGap=gaps.reduce((s,g)=>s+g,0)/gaps.length;
    let freq='Irregular', confidence=0.5;
    if (avgGap>=27&&avgGap<=33){freq='Monthly';confidence=0.95;}
    else if (avgGap>=12&&avgGap<=16){freq='Bi-weekly';confidence=0.9;}
    else if (avgGap>=6&&avgGap<=8){freq='Weekly';confidence=0.85;}
    else if (avgGap>=85&&avgGap<=100){freq='Quarterly';confidence=0.8;}
    else if (avgGap>=350&&avgGap<=380){freq='Annual';confidence=0.85;}
    else continue;
    const last=items[items.length-1].date;
    const next=new Date(last);
    if (freq==='Monthly') next.setMonth(next.getMonth()+1);
    else if (freq==='Bi-weekly') next.setDate(next.getDate()+14);
    else if (freq==='Weekly') next.setDate(next.getDate()+7);
    else if (freq==='Quarterly') next.setMonth(next.getMonth()+3);
    else if (freq==='Annual') next.setFullYear(next.getFullYear()+1);
    const isSubscription=SUBS_KEYWORDS.some(s=>k.includes(s))||items.some(t=>t.isSubscription);
    out.push({key:k,merchant:items[0].description,avg,freq,confidence,lastSeen:last,nextDue:next,count:items.length,category:items[0].category,isSubscription,account:items[0].account});
  }
  return out.sort((a,b)=>b.confidence-a.confidence||b.avg-a.avg);
}

function detectRecurringDeposits(txs) {
  const groups={};
  for (const t of txs) {
    const key=t.description.replace(/\d/g,'').trim().slice(0,30);
    if (!groups[key]) groups[key]=[];
    groups[key].push(t);
  }
  const out=[];
  for (const k in groups) {
    const arr=groups[k];
    if (arr.length<2) continue;
    const avg=arr.reduce((s,t)=>s+t.amount,0)/arr.length;
    const within=arr.every(t=>Math.abs(t.amount-avg)/avg<0.1);
    if (!within) continue;
    arr.sort((a,b)=>a.date-b.date);
    const gaps=[];
    for (let i=1;i<arr.length;i++) gaps.push((arr[i].date-arr[i-1].date)/86400000);
    const avgGap=gaps.reduce((s,g)=>s+g,0)/gaps.length;
    let freq='Irregular';
    if (avgGap>=27&&avgGap<=33) freq='Monthly';
    else if (avgGap>=12&&avgGap<=16) freq='Bi-weekly';
    else if (avgGap>=6&&avgGap<=8) freq='Weekly';
    out.push({source:k,avg,freq,last:arr[arr.length-1].date});
  }
  return out.sort((a,b)=>b.avg-a.avg);
}

/* ---------- ACCOUNT DATE RANGE ---------- */
function accountDateRange(accountId) {
  const txs = State.transactions.filter(t => t.account === accountId);
  if (!txs.length) return { min: null, max: null };
  const dates = txs.map(t => t.date).sort((a, b) => a - b);
  return { min: dates[0], max: dates[dates.length - 1] };
}
