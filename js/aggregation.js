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

// Groups charges from the same merchant: letters and spaces only, upper case, 30 chars.
// detectRecurring() keys on it; bills confirmed from a detected charge store it (bill.recurringKey).
function recurringKey(desc) {
  return (desc||'').toUpperCase().replace(/[^A-Z ]/g,'').replace(/\s+/g,' ').trim().slice(0,30);
}

function detectRecurring() {
  const txs=State.transactions.filter(t=>t.amount<0&&t.type!=='transfer'&&t.category!=='Transfer');
  const groups={};
  for (const t of txs) {
    const k=recurringKey(t._originalDesc||t.description);
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

// Groups deposits from the same source: digits removed, 30 chars.
function depositKey(desc) {
  return (desc||'').replace(/\d/g,'').trim().slice(0,30);
}

function detectRecurringDeposits(txs) {
  const groups={};
  for (const t of txs) {
    const key=depositKey(t.description);
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

/* ---------- BALANCE AT A DATE (v1.14.0) ---------- */
// An account's balance at the end of `date`. With a manual (current) balance: that balance
// minus everything after `date`. Otherwise: starting balance plus everything up to `date`.
// Used for the Overview net-worth chart and account sparklines.
function balanceAt(accountId, date) {
  const txs=State.transactions.filter(t=>t.account===accountId);
  if (State.manualBalances[accountId]!=null) {
    return Number(State.manualBalances[accountId])-txs.filter(t=>t.date>date).reduce((s,t)=>s+t.amount,0);
  }
  const initial=State.manualBalances[accountId+'_initial']!=null?Number(State.manualBalances[accountId+'_initial']):0;
  return initial+txs.filter(t=>t.date<=date).reduce((s,t)=>s+t.amount,0);
}

/* ---------- SPANS AND MONTHS (v1.14.0) ---------- */
// First and last transaction dates, the days between them (inclusive) and that in months
// (days ÷ 30.44, the same count the AI summary states). null when there are none.
function dataSpan(txs) {
  if (!txs.length) return null;
  let min=Infinity, max=-Infinity;
  for (const t of txs) { const v=t.date.getTime(); if (v<min) min=v; if (v>max) max=v; }
  const first=new Date(min), last=new Date(max);
  const days=Math.round((last-first)/86400000)+1;
  return { first, last, days, months:days/30.44 };
}
// Money in and out per calendar month, with the same rules as sumIncome() / sumExpense()
// (byMonth() counts card payments as income; this doesn't). Oldest first.
function monthlyFlow(txs) {
  const m={};
  for (const t of txs) { const k=monthKey(t.date); (m[k]=m[k]||[]).push(t); }
  return Object.keys(m).sort().map(k=>{
    const a=m[k], income=sumIncome(a), expense=sumExpense(a);
    return { key:k, date:new Date(+k.slice(0,4), +k.slice(5,7)-1, 1), income, expense, net:income-expense, txs:a };
  });
}

/* ---------- TRANSFERS AND CARD PAYMENTS (v1.14.0) ---------- */
// A payment toward a credit card: its own "Payment" row, or the card side of a transfer
// that detectTransfers() paired with the bank's autopay.
function isCardPayment(t) {
  const a=State.accounts[t.account];
  return t.amount>0 && (t.type==='payment' || (t.type==='transfer' && !!a && a.kind==='credit_card'));
}
// Pairs each outgoing transfer leg with its incoming leg in another account (equal amount
// within $1, at most 2 days apart). Legs with no partner stay one-sided: `to` (or `from`)
// is null, meaning money left (or came from) outside FinLens. Newest first.
//   → [{ date, from, to, amount, description, outId, inId, paired }]
function transferPairs(txs) {
  const all=txs.filter(t=>t.type==='transfer'||['Transfer','Transfer in','Transfer out'].includes(t.category));
  const outgoing=all.filter(t=>t.amount<0||t.categories?.includes('Transfer out'));
  const incoming=all.filter(t=>t.amount>0||t.categories?.includes('Transfer in'));
  const used=new Set(), pairs=[];
  for (const out of outgoing) {
    if (used.has(out.id)) continue;
    const match=incoming.find(inn=>!used.has(inn.id)&&inn.account!==out.account&&
      Math.abs(Math.abs(out.amount)-Math.abs(inn.amount))<1&&Math.abs((out.date-inn.date)/86400000)<=2);
    used.add(out.id);
    if (match) {
      used.add(match.id);
      pairs.push({ date:out.date, from:out.account, to:match.account, amount:Math.abs(out.amount), description:out.description, outId:out.id, inId:match.id, paired:true });
    } else {
      pairs.push({ date:out.date, from:out.account, to:null, amount:Math.abs(out.amount), description:out.description, outId:out.id, inId:null, paired:false });
    }
  }
  for (const inn of incoming) {
    if (used.has(inn.id)) continue;
    pairs.push({ date:inn.date, from:null, to:inn.account, amount:Math.abs(inn.amount), description:inn.description, outId:null, inId:inn.id, paired:false });
  }
  return pairs.sort((a,b)=>b.date-a.date);
}

/* ---------- RECURRING DEPOSITS, IN DETAIL (v1.14.0) ---------- */
// detectRecurringDeposits() plus what the Income screen shows: how many deposits, the
// account they land in, the next expected date and a confidence (High: a regular rhythm
// seen 4+ times; Medium: a regular rhythm seen 2–3 times; Low: no regular rhythm).
function recurringDepositsDetail(txs) {
  const groups={};
  for (const t of txs) { const k=depositKey(t.description); (groups[k]=groups[k]||[]).push(t); }
  return detectRecurringDeposits(txs).map(r=>{
    const arr=groups[r.source]||[];
    let next=null;
    if (r.freq==='Monthly') { next=new Date(r.last); next.setMonth(next.getMonth()+1); }
    else if (r.freq==='Bi-weekly') { next=new Date(r.last); next.setDate(next.getDate()+14); }
    else if (r.freq==='Weekly') { next=new Date(r.last); next.setDate(next.getDate()+7); }
    const maxDev=arr.length?Math.max(...arr.map(t=>Math.abs(t.amount-r.avg)/r.avg)):0;
    const accts={}; arr.forEach(t=>{ accts[t.account]=(accts[t.account]||0)+1; });
    const account=(Object.entries(accts).sort((a,b)=>b[1]-a[1])[0]||[null])[0];
    const confidence=r.freq==='Irregular'?'Low':arr.length>=4?'High':'Medium';
    return { ...r, count:arr.length, next, account, confidence, steady:maxDev<=0.005 };
  });
}

/* ---------- BILLS (v1.14.0) ---------- */
// Bill frequencies as stored (bill.frequency) → label, monthly cost factor, and step.
const BILL_FREQS={
  'Monthly':  { label:'Monthly',       perMonth:1,     months:1  },
  'Bi-weekly':{ label:'Every 2 weeks', perMonth:26/12, days:14   },
  'Weekly':   { label:'Weekly',        perMonth:52/12, days:7    },
  'Quarterly':{ label:'Quarterly',     perMonth:1/3,   months:3  },
  'Annual':   { label:'Yearly',        perMonth:1/12,  months:12 },
  'One-time': { label:'One-time',      perMonth:0               },
};
function billFreq(b) { return BILL_FREQS[b.frequency]||BILL_FREQS.Monthly; }
// The k-th repeat of a bill's stored due date (k may be negative). Months keep the day
// of the month, clamped to short months, so a bill due on the 31st never drifts.
function billOccurrence(b, k) {
  const a=parseDate(b.dueDate,'YYYY-MM-DD')||new Date();
  const f=billFreq(b);
  if (f.days) return new Date(a.getFullYear(), a.getMonth(), a.getDate()+k*f.days);
  if (!f.months) return a;
  const y=a.getFullYear(), m=a.getMonth()+k*f.months;
  const last=new Date(y, m+1, 0).getDate();
  return new Date(y, m, Math.min(a.getDate(), last));
}
// Transactions that pay a bill: the merchant key it was confirmed from, or else its name
// inside the description. Newest first.
function billPayments(b) {
  const name=(b.merchant||'').trim().toUpperCase();
  if (!b.recurringKey && !name) return [];
  return State.transactions.filter(t=>t.amount<0 && (b.recurringKey
    ? recurringKey(t._originalDesc||t.description)===b.recurringKey
    : (t._originalDesc||t.description||'').toUpperCase().includes(name))).sort((x,y)=>y.date-x.date);
}
function billLastPaid(b) { const p=billPayments(b); return p.length?p[0].date:null; }
// The next due date: the stored date, moved on one repeat for every repeat a payment
// already covers (a payment up to 7 days early counts). One-time bills don't move.
function billNextDue(b) {
  const f=billFreq(b);
  let k=0, d=billOccurrence(b,0);
  if (!f.days && !f.months) return d;
  const lp=billLastPaid(b);
  while (lp && lp.getTime()>=d.getTime()-7*86400000 && k<520) { k++; d=billOccurrence(b,k); }
  return d;
}
// Every due date of a bill between two dates (inclusive), e.g. for a month calendar.
function billDatesBetween(b, from, to) {
  const f=billFreq(b), out=[];
  if (!f.days && !f.months) { const d=billOccurrence(b,0); return d>=from&&d<=to?[d]:[]; }
  let k=0;
  while (billOccurrence(b,k)>from && k>-520) k--;
  for (let d=billOccurrence(b,k); d<=to && k<520; d=billOccurrence(b,++k)) if (d>=from) out.push(d);
  return out;
}
