/* ================================================================
   FINLENS — views-plan.js
   The Plan screens (Clarity, v1.15.0): Budget, Savings buckets and
   Debt tracker. Investing ideas is in views-invest.js, Forecast in
   views-forecast.js. Trends (Clarity, v1.16.0) is at the end.
   Shared pieces (pageActions, kpiTiles, appendHtml, ICON, plural …) are
   in views-main.js; the forms and their helpers are in ui.js.
================================================================ */

/* =================== SHARED PLAN PIECES =================== */
const ICON_ALERT=_svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',18);
const ICON_CHECK=_svg('<path d="M5 12l5 5L20 7"/>');
const ICON_PREV=_svg('<path d="M15 18l-6-6 6-6"/>');
const ICON_NEXT=_svg('<path d="M9 18l6-6-6-6"/>');
// Money with a real minus sign and no plus: "$12.00", "−$40.00".
const fmtMinus=(n)=>n<-0.004?'−'+fmt(-n):fmt(Math.abs(n));
const fmtMinus0=(n)=>n<=-0.5?'−'+fmt0(-n):fmt0(Math.abs(n));
// A progress bar (role="progressbar"). pct may pass 100: the bar stops full, the value doesn't.
function meterHtml(pct, hue, label, valuetext, size='') {
  const p=Math.max(0,Math.round(pct));
  return `<div class="progress ${size} hue-${hue}" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.max(100,p)}" aria-valuenow="${p}" aria-label="${escapeHtml(label)}"${valuetext?` aria-valuetext="${escapeHtml(valuetext)}"`:''}><div style="width:${Math.min(100,Math.max(0,pct)).toFixed(1)}%"></div></div>`;
}
const callout=(cls, html, role='status')=>`<div class="callout ${cls}" role="${role}">${ICON_ALERT}<span>${html}</span></div>`;
// "2 years, 3 months"
function yearsMonths(m) {
  const y=Math.floor(m/12), r=m%12;
  return [y?plural(y,'year'):'', r?plural(r,'month'):''].filter(Boolean).join(', ')||'0 months';
}
// Month k of a plan: 1 = next calendar month.
const planMonth=(k)=>dayjs(startOfMonth(new Date())).add(k,'month').format('MMM YYYY');

/* =================== BUDGET =================== */
let budgetMonth=null;   // first day of the month shown; null → the latest month with data
let budgetEditing=-1;   // the budget whose amount is being edited in its row

registerView('budgets','Budget',(root)=>{
  const now=new Date(), curMonth=startOfMonth(now);
  const span=dataSpan(State.transactions);
  if (!budgetMonth) budgetMonth=startOfMonth(span&&span.last<now?span.last:now);
  const M=budgetMonth, mEnd=endOfMonth(M), mName=dayjs(M).format('MMMM');
  const lastDay=new Date(mEnd.getFullYear(),mEnd.getMonth(),mEnd.getDate());
  const isCur=M.getTime()===curMonth.getTime();
  const minMonth=span?startOfMonth(span.first):curMonth;
  const budgets=State.budgets||[];

  /* ---- month switcher + actions ---- */
  let dataNote='';
  if (!span) dataNote='No transactions imported yet';
  else if (span.last<M||span.first>mEnd) dataNote=isCur?'No transactions this month yet':`No transactions in ${mName}`;
  else if (span.last<lastDay) dataNote=`Data through ${dayjs(span.last).format('MMM D')}`;
  else if (span.first>M) dataNote=`Data from ${dayjs(span.first).format('MMM D')}`;
  const toAdd=starterBudgetsToAdd();
  appendHtml(root,`<div class="page-actions">
    <div class="month-nav">
      <button type="button" class="icon-btn" id="bmPrev" aria-label="Previous month" title="Previous month" ${M<=minMonth?'disabled':''}>${ICON_PREV}</button>
      <span class="m" id="bmLabel" aria-live="polite">${dayjs(M).format('MMMM YYYY')}</span>
      <button type="button" class="icon-btn" id="bmNext" aria-label="Next month" title="Next month" ${M>=curMonth?'disabled':''}>${ICON_NEXT}</button>
      ${dataNote?`<span class="note">${dataNote}</span>`:''}
    </div>
    <div class="acts">
      <button type="button" class="btn ghost lg" id="bgStarter" ${toAdd.length?'':'disabled'} title="${toAdd.length?`Adds ${plural(toAdd.length,'category','categories')} from your spending`:'Every category you spend on already has a budget'}">Use starter budget</button>
      <button type="button" class="btn lg" id="bgAdd">+ Add category</button>
    </div></div>`);
  const step=(d)=>{
    budgetMonth=new Date(M.getFullYear(),M.getMonth()+d,1); budgetEditing=-1; renderActive();
    const b=$(d<0?'#bmPrev':'#bmNext'), o=$(d<0?'#bmNext':'#bmPrev');
    (b&&!b.disabled?b:o).focus();
  };
  $('#bmPrev').onclick=()=>step(-1);
  $('#bmNext').onclick=()=>step(1);
  $('#bgStarter').onclick=()=>{ seedBudgets(); const b=$('#bgAdd'); if (b) b.focus(); };
  $('#bgAdd').onclick=()=>editBudget(-1);

  if (!budgets.length) {
    appendHtml(root,emptyPanel('No budget yet. <strong>Use starter budget</strong> fills one in from what you spend each month, or add a category yourself.'));
    return;
  }

  /* ---- rows ---- */
  const rows=budgets.map((b,i)=>{
    const lim=Math.max(0,Number(b.limit)||0), sp=budgetSpent(b,M,mEnd);
    const ratio=lim>0?sp/lim:0;
    const over=sp>lim+0.004, warn=!over&&lim>0&&ratio>=0.9&&sp<lim-0.004;
    return { b, i, lim, sp, ratio, over, warn };
  }).sort((a,b)=>b.sp-a.sp||a.i-b.i);
  const totLim=rows.reduce((s,r)=>s+r.lim,0), totSp=rows.reduce((s,r)=>s+r.sp,0);
  const overN=rows.filter(r=>r.over).length, warnN=rows.filter(r=>r.warn).length;
  const daysLeft=endOfMonth(now).getDate()-now.getDate();
  const daysTxt=daysLeft===0?'the last day of the month':plural(daysLeft,'day')+' to go';
  const pctOf=(r)=>r.lim>0?Math.round(r.ratio*100)+'%':r.sp>0?'—':'0%';

  /* ---- alerts ---- */
  const alerts=rows.filter(r=>r.over||r.warn).map(r=>{
    const n=escapeHtml(r.b.name);
    if (r.over) return callout('bad',`<strong>${n} is ${fmt(r.sp-r.lim)} over budget.</strong> You ${isCur?'have spent':'spent'} ${fmt(r.sp)} of ${fmt(r.lim)} ${isCur?'this month':'in '+mName}.`);
    return callout('warn',`<strong>${n} is at ${pctOf(r)}.</strong> ${isCur?`Only ${fmt(r.lim-r.sp)} left with ${daysTxt}.`:`${fmt(r.lim-r.sp)} was left in ${mName}.`}`);
  });
  if (alerts.length) appendHtml(root,`<div class="alerts">${alerts.join('')}</div>`);

  /* ---- KPIs ---- */
  appendHtml(root,kpiTiles([
    {label:'Budgeted',value:fmt(totLim),sub:plural(rows.length,'category','categories')},
    {label:'Spent',value:fmt(totSp),sub:totLim>0?`${Math.round(totSp/totLim*100)}% of budget`:'No amounts set yet'},
    {label:'Left to spend',value:fmtMinus(totLim-totSp),cls:totLim-totSp<-0.004?'c-bad':'c-good',sub:isCur?cap(daysTxt):`${mName} has ended`},
    {label:'Over budget',value:String(overN),cls:overN?'c-bad':'',sub:`${warnN} close to the limit`},
  ]));

  /* ---- budget by category ---- */
  const rowHtml=rows.map(r=>{
    const n=escapeHtml(r.b.name), ed=budgetEditing===r.i;
    const hue=r.over?'danger':r.warn?'warn':'accent';
    const pctCls=r.over?'c-bad':r.warn?'c-warn':'c-dim';
    const pv=r.lim>0?r.ratio*100:(r.sp>0?100:0);
    return `<tr>
      <td><button type="button" class="link-btn" data-bud-open="${r.i}" aria-label="${n}: edit name, categories or delete" title="Edit name, categories or delete">${n}</button>
        <div class="sm-line">${meterHtml(pv,hue,`${r.b.name} spent`,`${fmt(r.sp)} of ${fmt(r.lim)}`)}<span class="strong ${pctCls}">${pctOf(r)}</span><span>${fmt(r.sp)} spent</span></div></td>
      <td class="hide-sm"><div class="meter">${meterHtml(pv,hue,`${r.b.name} spent`,`${fmt(r.sp)} of ${fmt(r.lim)}`,'lg')}<span class="p ${pctCls}">${pctOf(r)}</span></div></td>
      <td class="r strong nowrap hide-sm">${fmt(r.sp)}</td>
      <td class="r nowrap">${ed?`<label class="inline-num"><span class="sr-only">Budget for ${n}</span>$<input class="input" type="number" min="0" step="10" inputmode="decimal" id="bgLimitIn" data-i="${r.i}" value="${escapeHtml(String(r.lim))}"></label>`:`<span class="c-dim">${fmt(r.lim)}</span>`}</td>
      <td class="r strong nowrap ${r.over?'c-bad':''}">${fmtMinus(r.lim-r.sp)}</td>
      <td class="r"><button type="button" class="icon-btn sm${ed?' on':''}" data-bud-edit="${r.i}" aria-label="${ed?'Done editing '+n:'Edit budget for '+n}" title="${ed?'Done':'Edit amount'}">${ed?ICON_CHECK:ICON.pencil}</button></td>
    </tr>`;
  }).join('');
  appendHtml(root,`<section class="panel tight" aria-labelledby="bgH">
    <h2 id="bgH" class="sr-only">Budget by category, ${dayjs(M).format('MMMM YYYY')}</h2>
    <div class="table-scroll"><table class="tbl flush bud-tbl mw-760 fit-sm">
      <thead><tr><th scope="col">Category</th><th scope="col" class="hide-sm">Progress</th><th scope="col" class="r hide-sm">Spent</th><th scope="col" class="r">Budget</th><th scope="col" class="r">Left</th><th scope="col"><span class="sr-only">Edit</span></th></tr></thead>
      <tbody>${rowHtml}</tbody></table></div>
  </section>`);
  $$('[data-bud-open]',root).forEach(b=>b.onclick=()=>editBudget(+b.dataset.budOpen));
  const limIn=$('#bgLimitIn');
  const finish=(save)=>{
    const i=budgetEditing;
    if (save&&limIn) setBudgetLimit(i,limIn.value);
    budgetEditing=-1; renderActive();
    const b=$(`[data-bud-edit="${i}"]`); if (b) b.focus();
  };
  $$('[data-bud-edit]',root).forEach(b=>b.onclick=()=>{
    const i=+b.dataset.budEdit;
    if (budgetEditing===i) return finish(true);
    if (limIn) setBudgetLimit(budgetEditing,limIn.value);
    budgetEditing=i; renderActive();
    const inp=$('#bgLimitIn'); if (inp) { inp.focus(); inp.select(); }
  });
  if (limIn) {
    limIn.addEventListener('change',()=>{ if (budgetEditing===+limIn.dataset.i) setBudgetLimit(budgetEditing,limIn.value); });
    limIn.addEventListener('keydown',e=>{ if (e.key==='Enter'){ e.preventDefault(); finish(true); } else if (e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); } });
  }

  /* ---- budget vs. actual, month by month ---- */
  const hist=[];
  for (let k=5;k>=0;k--) {
    const s=new Date(M.getFullYear(),M.getMonth()-k,1), e=endOfMonth(s);
    const has=!!span&&span.first<=e&&span.last>=s;
    const sp=has?budgets.reduce((t,b)=>t+budgetSpent(b,s,e),0):null;
    const partial=has&&(s.getTime()===curMonth.getTime()||span.last<new Date(e.getFullYear(),e.getMonth(),e.getDate()));
    hist.push({ s, sp, has, partial, over:has&&sp>totLim+0.004 });
  }
  const peak=Math.max(totLim,...hist.map(h=>h.sp||0));
  const scaleMax=peak>0?Math.ceil(peak/niceStep(peak/4))*niceStep(peak/4):1;
  const overMonths=hist.filter(h=>h.over);
  const hLabel=(h)=>`${dayjs(h.s).format('MMM')}${h.partial?' · so far':''}`;
  const aria=`Spending in budgeted categories against a ${fmt0(totLim)} monthly budget, ${dayjs(hist[0].s).format('MMMM')} to ${dayjs(hist[5].s).format('MMMM YYYY')}: ${overMonths.length?overMonths.map(h=>`${dayjs(h.s).format('MMMM')} at ${fmt0(h.sp)}`).join(', ')+' went over':'no month went over'}`;
  appendHtml(root,`<section class="panel" aria-labelledby="histH">
    <div class="panel-head"><h2 id="histH">Budget vs. actual, month by month</h2>
      <div class="legend"><span><i class="sw hue-accent"></i>Within budget</span><span><i class="sw hue-danger"></i>Over budget</span><span><i class="sw dash"></i>${fmt(totLim)} budget</span></div></div>
    <div class="bud-hist" role="img" aria-label="${escapeHtml(aria)}">
      <div class="ref" style="bottom:${(totLim/scaleMax*100).toFixed(1)}%"></div>
      <div class="bars">${hist.map(h=>`<div class="col"><span class="bar hue-${h.over?'danger':h.partial?'dim':'accent'}" style="height:${h.has?(h.sp/scaleMax*100).toFixed(1):0}%" title="${hLabel(h)}: ${h.has?fmt(h.sp):'no data'}"></span></div>`).join('')}</div>
    </div>
    <div class="bars-x bud-x" aria-hidden="true">${hist.map(h=>`<div>${hLabel(h)}<div class="v${h.over?' c-bad':''}">${h.has?fmt0(h.sp):'—'}</div></div>`).join('')}</div>
  </section>`);
});

/* =================== SAVINGS BUCKETS =================== */
let bucketFormOpen=false;

registerView('buckets','Savings buckets',(root)=>{
  const buckets=State.buckets||[];
  const bal=currentBalances();
  const savAccts=orderedAccounts().filter(a=>a.kind==='bank_savings');
  const savTotal=savAccts.reduce((s,a)=>s+(Number(bal[a.id])||0),0);
  const savName=savAccts.length===1?acctName(savAccts[0].id):'your savings';
  pageActions(root,`Split ${escapeHtml(savName)} into goals, each with a target and a date`,
    `<button type="button" class="btn lg" id="bkNew" aria-expanded="${bucketFormOpen}" aria-controls="bkForm">+ New bucket</button>`);
  $('#bkNew').onclick=()=>{ bucketFormOpen=!bucketFormOpen; renderActive(); const f=bucketFormOpen?$('#nbkName'):$('#bkNew'); if (f) f.focus(); };

  const plans=buckets.map((b,i)=>({ b, i, p:bucketPlan(b), hue:bucketHue(b,i), icon:bucketIconKey(b) }));
  const totSaved=plans.reduce((s,x)=>s+x.p.saved,0), totGoal=plans.reduce((s,x)=>s+x.p.goal,0);
  const totMonthly=plans.reduce((s,x)=>s+(x.p.months>0&&x.p.left>0?x.p.monthly:0),0);

  /* ---- KPIs + pace ---- */
  if (buckets.length) {
    appendHtml(root,kpiTiles([
      {label:'Saved in buckets',value:fmt(totSaved),sub:plural(buckets.length,'bucket')},
      {label:'Total of targets',value:fmt(totGoal),sub:totGoal>0?`${Math.round(totSaved/totGoal*100)}% of the way there`:'No targets set'},
      {label:'Needed each month',value:fmt(totMonthly),sub:'To hit every target date'},
      {label:'Unassigned savings',value:savAccts.length?fmtMinus(savTotal-totSaved):'—',cls:savAccts.length&&savTotal-totSaved<-0.004?'c-bad':'',
        sub:savAccts.length?`${escapeHtml(savAccts.length===1?savName:plural(savAccts.length,'savings account'))} · ${fmt(savTotal)}`:'No savings account imported'},
    ]));
    if (totMonthly>0.005) {
      const pace=savingsPace();
      const msg=`These goals need <strong>${fmt(totMonthly)}</strong> a month.`;
      let html;
      if (pace&&pace.perMonth>=0.5) {
        const since=dayjs(pace.since).format(pace.since.getFullYear()===new Date().getFullYear()?'MMMM':'MMMM YYYY');
        const moved=`You've moved about <strong>${fmt0(pace.perMonth)} a month</strong> into savings since ${since}.`;
        html=pace.perMonth+0.5<totMonthly?`${moved} ${msg} Raising the monthly transfer, or moving a date back, would close the gap.`:`${moved} ${msg.slice(0,-1)}, so you're on pace.`;
      } else html=`${msg} FinLens hasn't seen transfers into savings yet.`;
      appendHtml(root,callout('',html));
    }
  }

  /* ---- new bucket form ---- */
  if (bucketFormOpen) {
    appendHtml(root,`<section class="panel form-panel" id="bkForm" aria-labelledby="bkFormH">
      <h2 id="bkFormH">New bucket</h2>
      <div class="bk-grid">
        <label class="field span-2">Name<input class="input" id="nbkName" placeholder="e.g. Holiday gifts" autocomplete="off"></label>
        <label class="field">Target ($)<input class="input" id="nbkTarget" type="number" min="0" step="50" inputmode="decimal" value="1000"></label>
        <label class="field">Saved so far ($)<input class="input" id="nbkSaved" type="number" min="0" step="50" inputmode="decimal" value="0"></label>
        <label class="field">Months to goal<input class="input" id="nbkMonths" type="number" min="1" max="120" value="6"></label>
      </div>
      <div class="form-foot"><span class="preview" aria-live="polite">That's <strong id="nbkPreview"></strong> a month.</span>
        <div class="acts"><button type="button" class="btn ghost lg" id="nbkCancel">Cancel</button><button type="button" class="btn lg" id="nbkSave">Create bucket</button></div></div>
    </section>`);
    const vals=()=>{ const t=Math.max(0,parseFloat($('#nbkTarget').value)||0), s=Math.max(0,parseFloat($('#nbkSaved').value)||0), m=Math.min(120,Math.max(1,parseInt($('#nbkMonths').value,10)||1)); return {t,s,m}; };
    const preview=()=>{ const v=vals(); $('#nbkPreview').textContent=fmt(Math.max(0,v.t-v.s)/v.m); };
    ['#nbkTarget','#nbkSaved','#nbkMonths'].forEach(s=>$(s).addEventListener('input',preview));
    preview();
    $('#nbkCancel').onclick=()=>{ bucketFormOpen=false; renderActive(); const b=$('#bkNew'); if (b) b.focus(); };
    $('#nbkSave').onclick=()=>{
      const name=$('#nbkName').value.trim();
      if (!name) { $('#nbkName').setAttribute('aria-invalid','true'); $('#nbkName').focus(); return; }
      const v=vals();
      addBucket({ name, goal:v.t, current:v.s, targetDate:dayjs(today()).add(v.m,'month').format('YYYY-MM-DD'),
        icon:guessBucketIcon(name), hue:BUCKET_HUES[buckets.length%BUCKET_HUES.length] });
      bucketFormOpen=false; renderActive();
      const b=$(`[data-bk-edit="${State.buckets.length-1}"]`)||$('#bkNew'); if (b) b.focus();
    };
  }

  if (!buckets.length) {
    if (!bucketFormOpen) appendHtml(root,emptyPanel('No buckets yet. Use <strong>+ New bucket</strong> to split your savings into goals, like an emergency fund or a trip.'));
    return;
  }

  /* ---- bucket cards ---- */
  appendHtml(root,`<div class="bucket-grid">${plans.map(({b,i,p,hue,icon})=>{
    const n=escapeHtml(b.name);
    const pct=p.goal>0?Math.min(100,Math.round(p.saved/p.goal*100)):0;
    const when=p.due?`By ${dayjs(p.due).format('MMM YYYY')} · ${p.months===0?'date passed':plural(p.months,'month')+' left'}`:'No target date';
    const need=p.goal>0&&p.left<=0.005?'<strong>Goal reached</strong>'
      :!p.due?'Add a target date to see a monthly amount'
      :p.months===0?`Date passed · <strong>${fmt(p.left)}</strong> still to save`
      :`Needs <strong>${fmt(p.monthly)}</strong> a month`;
    return `<article class="bucket hue-${hue}" aria-labelledby="bkT${i}">
      <div class="bucket-top"><span class="tile">${bucketIconSvg(icon)}</span>
        <div class="who"><h2 id="bkT${i}">${n}</h2><span class="when">${when}</span></div>
        <button type="button" class="icon-btn sm" data-bk-edit="${i}" aria-label="Edit ${n}" title="Edit">${ICON.pencil}</button></div>
      <div class="amt"><b>${fmt(p.saved)}</b>${p.goal>0?`<span>of ${fmt(p.goal)}</span>`:''}</div>
      ${p.goal>0?`<div class="prog">${meterHtml(pct,hue,`${b.name} saved`,`${pct}% saved, ${fmt(p.left)} to go`,'lg')}
        <div class="meta"><span>${pct}% saved</span><span>${fmt(p.left)} to go</span></div></div>`:'<div class="meta"><span>No target set</span></div>'}
      <div class="need">${need}</div>
    </article>`;
  }).join('')}</div>`);
  $$('[data-bk-edit]',root).forEach(b=>b.onclick=()=>editBucket(+b.dataset.bkEdit));
});

/* =================== DEBT TRACKER =================== */
const PAYOFF_PLANS=[['avalanche','Avalanche','Highest interest rate first'],['snowball','Snowball','Smallest balance first'],['minimum','Minimums only','No extra payment, for comparison']];

registerView('debt','Debt tracker',(root)=>{
  const debts=State.debts||[];
  pageActions(root,'Balances you enter, plus a payoff plan you can test',`<button type="button" class="btn lg" id="dtAdd">+ Add debt</button>`);
  $('#dtAdd').onclick=()=>editDebt(-1);

  if (!debts.length) {
    const cards=debtCardChoices('');
    appendHtml(root,`<section class="panel" aria-labelledby="dlH"><h2 id="dlH">Your debts</h2>
      <p class="empty-note">No debts yet. Add a loan or a card with <strong>+ Add debt</strong>${cards.length?', or start from a credit card in your CSVs':''}.</p>
      ${cards.length?`<div class="form-row" style="justify-content:center">${cards.map(a=>`<button type="button" class="btn ghost" data-dt-card="${escapeHtml(a.id)}">Add ${escapeHtml(acctName(a.id))}</button>`).join('')}</div>`:''}
    </section>`);
    $$('[data-dt-card]',root).forEach(b=>b.onclick=()=>editDebt(-1,b.dataset.dtCard));
    return;
  }

  /* ---- KPIs ---- */
  const rows=debts.map((d,i)=>{ const card=debtIsCard(d); return { d, i, bal:debtBalance(d), apr:Math.max(0,Number(d.apr)||0), min:Math.max(0,Number(d.minPayment)||0), card, lim:card?debtLimit(d):0, linked:debtLinked(d) }; });
  const total=rows.reduce((s,r)=>s+r.bal,0), mins=rows.reduce((s,r)=>s+r.min,0);
  const wAPR=total>0?rows.reduce((s,r)=>s+r.bal*r.apr,0)/total:0;
  const withLim=rows.filter(r=>r.card&&r.lim>0);
  const cBal=withLim.reduce((s,r)=>s+r.bal,0), cLim=withLim.reduce((s,r)=>s+r.lim,0);
  const span=dataSpan(State.transactions);
  const pay=span?sumIncome(State.transactions)/Math.max(1,span.months):0;
  appendHtml(root,kpiTiles([
    {label:'Total debt',value:fmt(total),sub:plural(debts.length,'debt')},
    {label:'Minimum payments',value:`${fmt(mins)}<small>/mo</small>`,sub:pay>0&&mins>0?`${Math.round(mins/pay*100)}% of take-home pay`:'Every minimum, added up'},
    {label:'Average APR',value:`${wAPR.toFixed(2)}%`,sub:'Weighted by balance'},
    {label:'Card utilization',value:cLim>0?`${Math.round(cBal/cLim*100)}%`:'—',sub:cLim>0?`${fmt(cBal)} of ${fmt0(cLim)}`:'No credit limit set'},
  ]));

  /* ---- your debts ---- */
  appendHtml(root,`<section class="panel" aria-labelledby="dlH"><h2 id="dlH">Your debts</h2>
    <div class="table-scroll"><table class="tbl flush debt-tbl mw-720 fit-sm">
      <thead><tr><th scope="col">Debt</th><th scope="col" class="r">Balance</th><th scope="col" class="r hide-sm">APR</th><th scope="col" class="r hide-sm">Minimum</th><th scope="col" class="hide-sm">Credit limit</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map(r=>{
        const n=escapeHtml(r.d.name), u=r.lim>0?r.bal/r.lim*100:0;
        return `<tr>
          <td><div class="strong">${n}</div><div class="s2">${r.linked?'Credit card · from your CSV':'Entered manually'}</div>
            <div class="sm-line"><span${r.apr>=20?' class="strong c-bad"':''}>${r.apr.toFixed(2)}% APR</span><span>${fmt(r.min)} min</span>${r.lim>0?`<span>${Math.round(u)}% of ${fmt0(r.lim)}</span>`:''}</div></td>
          <td class="r strong nowrap">${fmt(r.bal)}</td>
          <td class="r nowrap hide-sm">${r.apr>=20?`<span class="strong c-bad">${r.apr.toFixed(2)}%</span>`:r.apr.toFixed(2)+'%'}</td>
          <td class="r nowrap hide-sm">${fmt(r.min)}</td>
          <td class="hide-sm">${r.lim>0?`<div class="lim-cell">${meterHtml(u,'card',`${r.d.name} credit used`,`${Math.round(u)}% of ${fmt0(r.lim)} used`,'xs')}<span class="c-dim">${fmt0(r.lim)}</span></div>`:'<span class="muted">—</span>'}</td>
          <td class="r"><button type="button" class="icon-btn sm" data-dt-edit="${r.i}" aria-label="Edit ${n}" title="Edit">${ICON.pencil}</button></td>
        </tr>`; }).join('')}</tbody></table></div>
  </section>`);
  $$('[data-dt-edit]',root).forEach(b=>b.onclick=()=>editDebt(+b.dataset.dtEdit));

  /* ---- payoff plan ---- */
  if (total<=0.005) { appendHtml(root,emptyPanel('Every debt here has a $0 balance, so there is nothing to plan.')); return; }
  const plan=State.debtPlan||{};
  let extra=Math.max(0,Number(plan.extra)||0);
  const max=Math.max(1500,Math.ceil(extra/25)*25);
  appendHtml(root,`<section class="panel" aria-labelledby="simH">
    <div class="plan-head">
      <div><h2 id="simH">Payoff plan</h2><p class="sub">Pay every minimum, then put the extra toward one debt at a time</p></div>
      <label class="slider"><span class="top"><span>Extra each month</span><b id="dtExtraVal">${fmt0(extra)}</b></span>
        <input type="range" id="dtExtra" min="0" max="${max}" step="25" value="${extra}" aria-label="Extra each month" aria-valuetext="${fmt0(extra)} a month">
        <span class="ends" aria-hidden="true"><span>$0</span><span>${fmt0(max)}</span></span></label>
    </div>
    <div class="plan-out" id="planOut"></div>
  </section>`);
  const input=rows.map(r=>({ name:r.d.name, balance:r.bal, apr:r.apr, minPayment:r.min }));
  const draw=()=>{
    const sel=PAYOFF_PLANS.some(p=>p[0]===(State.debtPlan||{}).strategy)?State.debtPlan.strategy:'avalanche';
    $('#planOut').innerHTML=payoffPlanHtml(input,extra,sel,total);
    $$('#planOut [data-plan]').forEach(b=>b.onclick=()=>{ setPayoffStrategy(b.dataset.plan); draw(); const f=$(`#planOut [data-plan="${b.dataset.plan}"]`); if (f) f.focus(); });
  };
  draw();
  const sl=$('#dtExtra');
  sl.addEventListener('input',()=>{ extra=+sl.value; $('#dtExtraVal').textContent=fmt0(extra); sl.setAttribute('aria-valuetext',`${fmt0(extra)} a month`); draw(); });
  sl.addEventListener('change',()=>setPayoffExtra(sl.value));
});

// The payoff plan's results: the three plan cards, a summary, the selected plan's balance
// bars, payoff order and first 6 months. Uses payoffPlan() (aggregation.js).
function payoffPlanHtml(debts, extra, sel, total) {
  const res={ avalanche:payoffPlan(debts,extra,'avalanche'), snowball:payoffPlan(debts,extra,'snowball'), minimum:payoffPlan(debts,0,'minimum') };
  const fin=(r)=>r.paidOff?planMonth(r.months):'Not within 50 years';
  const av=res.avalanche, sn=res.snowball;
  const best=av.paidOff&&(!sn.paidOff||av.interest<=sn.interest+0.005)?'avalanche':sn.paidOff?'snowball':null;
  const cards=PAYOFF_PLANS.map(([k,name,desc])=>{ const r=res[k]; return `<button type="button" class="plan-card" data-plan="${k}" aria-pressed="${k===sel}">
    <span class="top"><span class="n">${name}</span>${k===best?'<span class="pill good">Least interest</span>':''}</span>
    <span class="d">${desc}</span>
    <span class="stats"><span><span class="l">Debt-free</span><b>${fin(r)}</b></span><span><span class="l">Interest paid</span><b>${fmt0(r.interest)}</b></span></span>
    <span class="dur">${r.paidOff?yearsMonths(r.months):'Payments don\'t keep up with interest'}</span></button>`; }).join('');

  let summary, tone='good';
  if (!(extra>0)) summary='Move the slider to see how an extra payment changes your payoff date and interest.';
  else if (!best) { tone='warn'; summary=`Even with an extra ${fmt0(extra)} a month, these debts aren't paid off within 50 years. Raise the extra amount or the minimums.`; }
  else {
    const B=res[best], other=best==='avalanche'?'snowball':'avalanche', O=res[other], Mn=res.minimum;
    summary=`An extra ${fmt0(extra)} a month with ${best} makes you debt-free `+(Mn.paidOff
      ?(Mn.months>B.months?`${yearsMonths(Mn.months-B.months)} sooner than paying only the minimums`:'as soon as paying only the minimums')+`, and saves ${fmt0(Mn.interest-B.interest)} in interest.`
      :`by ${planMonth(B.months)}. Paying only the minimums wouldn't clear them within 50 years.`);
    if (O.paidOff) summary+=O.interest-B.interest>=0.5?` ${cap(best)} saves ${fmt0(O.interest-B.interest)} more than ${other}.`:' Avalanche and snowball cost the same here.';
  }

  const r=res[sel], selName=PAYOFF_PLANS.find(p=>p[0]===sel)[1];
  const stepN=Math.max(1,Math.ceil(r.rows.length/30));
  const bars=[];
  for (let i=0;i<r.rows.length;i+=stepN) { const m=r.rows[i]; bars.push(`<span style="height:${Math.max(1,m.remaining/total*100).toFixed(1)}%" title="${planMonth(i+1)}: ${fmt0(m.remaining)} left"></span>`); }
  const last=r.rows[r.rows.length-1];
  const aria=r.paidOff?`Total debt balance falling from ${fmt0(total)} to zero by ${planMonth(r.months)}`:`Total debt balance: ${fmt0(total)} now, still ${fmt0(last?last.remaining:total)} after 50 years`;
  const order=r.order.map((o,i)=>`<li><span class="num-badge">${i+1}</span><span class="t">${escapeHtml(o.name)}</span><span class="d">${planMonth(o.month)}</span></li>`)
    .concat(r.left.map((n,i)=>`<li><span class="num-badge">${r.order.length+i+1}</span><span class="t">${escapeHtml(n)}</span><span class="d">Not paid off</span></li>`)).join('');
  return `<div class="plan-cards">${cards}</div>
    ${callout(tone,summary)}
    <div class="cols-3 plan-detail">
      <div class="span-2"><h3>Total balance · ${selName}</h3>
        <div class="mini-bars hue-accent" role="img" aria-label="${escapeHtml(aria)}">${bars.join('')}</div>
        <div class="axis-ends"><span>${planMonth(1)}</span><span>${r.paidOff?planMonth(r.months):planMonth(r.months)+' and still owing'}</span></div></div>
      <div><h3>Payoff order</h3><ol class="order-list">${order}</ol></div>
    </div>
    <div><h3>First 6 months</h3>
      <div class="table-scroll"><table class="tbl flush mw-560 fit-sm compact-sm"><thead><tr><th scope="col">Month</th><th scope="col" class="r">Paid</th><th scope="col" class="r">Interest</th><th scope="col" class="r">Remaining</th></tr></thead>
      <tbody>${r.rows.slice(0,6).map((m,i)=>`<tr><td class="dim">${planMonth(i+1)}</td><td class="r strong">${fmt(m.paid)}</td><td class="r">${fmt(m.interest)}</td><td class="r">${fmt(m.remaining)}</td></tr>`).join('')}</tbody></table></div>
      <p class="trend-note" style="margin-top:10px">Interest is added monthly at APR ÷ 12 and minimums stay as entered. Once a debt is paid off, its minimum goes to the next one (not in Minimums only).</p>
    </div>`;
}

/* =================== TRENDS (Clarity, v1.16.0) =================== */
// Always the latest six months with transactions, across every account: Trends ignores the
// date range (the shell hides its label) and the accounts filter.
registerView('trends','Trends',(root)=>{
  wireLinks(root);
  const all=State.transactions;
  if (!all.length) {
    pageActions(root,'How your money has moved, month by month','');
    appendHtml(root,`<section class="panel"><p class="empty-note">No transactions imported yet. <a href="#settings" data-goto="settings" data-tab="import">Import your CSV files</a> to see your trends.</p></section>`);
    return;
  }
  const span=dataSpan(all);
  const months=monthlyFlow(all).slice(-6).map(m=>({ ...m, saved:m.income-m.expense, rate:m.income>0?(m.income-m.expense)/m.income:null }));
  const last=months[months.length-1];
  // The latest month is unfinished when the data stops before its last day.
  const partial=span.last.getDate()!==endOfMonth(span.last).getDate();
  const mShort=(m)=>dayjs(m.date).format('MMM'), mLong=(m)=>dayjs(m.date).format('MMMM');
  const sameYear=dayjs(months[0].date).year()===dayjs(last.date).year();
  const period=`${dayjs(months[0].date).format(sameYear?'MMMM':'MMMM YYYY')} – ${dayjs(last.date).format('MMMM YYYY')}`;
  pageActions(root,`How your money has moved, month by month · ${months.length>1?period:dayjs(last.date).format('MMMM YYYY')}`,'');

  /* ---- KPIs ---- */
  const avgSaved=months.reduce((s,m)=>s+m.saved,0)/months.length;
  const rated=months.filter(m=>m.rate!=null);
  const avgRate=rated.length?rated.reduce((s,m)=>s+m.rate,0)/rated.length:null;
  // Fastest-growing: the category up the most (%) in the latest month on the one before,
  // among categories with at least $25 in that month (so a $2 → $20 change doesn't win).
  let growth=null;
  if (months.length>1) {
    const prev=Object.fromEntries(byCategory(months[months.length-2].txs,'expense').map(c=>[c.category,c.amount]));
    byCategory(last.txs,'expense').forEach(c=>{
      const p=prev[c.category];
      if (!(p>=25)||c.amount<=p) return;
      const g=(c.amount-p)/p;
      if (!growth||g>growth.g) growth={ cat:c.category, g };
    });
  }
  // Steadiest: the month with the lowest spending, leaving out an unfinished latest month.
  const whole=months.length>1&&partial?months.slice(0,-1):months;
  const low=whole.reduce((a,m)=>m.expense<a.expense?m:a,whole[0]);
  appendHtml(root,kpiTiles([
    {label:'Average saved',value:`${fmtMinus0(avgSaved)}<small>/mo</small>`,sub:'Income minus spending'},
    {label:'Savings rate',value:avgRate==null?'—':pctStr(avgRate),sub:rated.length>1?`${rated.length}-month average`:'Income minus spending, as a share of income'},
    {label:'Fastest-growing category',value:growth?escapeHtml(growth.cat):'—',sub:growth?`${mLong(last)} up ${Math.round(growth.g*100)}% on ${mLong(months[months.length-2])}`:months.length>1?`No category grew in ${mLong(last)}`:'Needs two months of data'},
    {label:'Steadiest month',value:mLong(low),sub:`Lowest spending, ${fmt0(low.expense)}`},
  ]));

  /* ---- income, spending and savings ---- */
  const max=Math.max(1,...months.map(m=>Math.max(m.income,m.expense)));
  const h=(v)=>(Math.max(0,v)/max*100).toFixed(1);
  const best=months.reduce((a,m)=>m.saved>a.saved?m:a,months[0]), worst=months.reduce((a,m)=>m.saved<a.saved?m:a,months[0]);
  const note=(m)=>m===last&&partial?` (through ${dayjs(span.last).format('MMM D')})`:'';
  appendHtml(root,`<section class="panel" aria-labelledby="ieH">
    <div class="panel-head"><h2 id="ieH">Income, spending and savings</h2>
      <div class="legend"><span><i class="sw hue-accent"></i>Income</span><span><i class="sw hue-warn"></i>Spending</span><span><i class="sw hue-teal-text"></i>Saved</span></div></div>
    <div class="bars tall wide-gap" role="img" aria-label="Monthly income, spending and savings, ${mLong(months[0])} to ${mLong(last)}${note(last)}. You saved the most in ${mLong(best)} (${fmt0(best.saved)}) and the least in ${mLong(worst)} (${fmtMinus0(worst.saved)}).">
      ${months.map(m=>`<div class="grp" title="${dayjs(m.date).format('MMM YYYY')}${note(m)}: in ${fmt(m.income)}, out ${fmt(m.expense)}, saved ${fmtMinus(m.saved)}">
        <div class="bar hue-accent" style="height:${h(m.income)}%"></div><div class="bar hue-warn" style="height:${h(m.expense)}%"></div><div class="bar hue-teal-text" style="height:${h(m.saved)}%"></div></div>`).join('')}
    </div>
    <div class="bars-x wide-gap">${months.map(m=>`<div><div>${mShort(m)}</div><div class="v ${m.saved<0?'c-bad':'c-teal'}"><span class="full">${fmtSigned0(m.saved)}</span><span class="short" aria-hidden="true">${m.saved<0?'−':'+'}${fmtShort(Math.abs(m.saved))}</span></div></div>`).join('')}</div>
  </section>`);

  /* ---- savings rate + account balances ---- */
  const row=document.createElement('div'); row.className='cols-2';
  row.innerHTML=`<section class="panel" aria-labelledby="srH">
      <div class="panel-head"><h2 id="srH">Savings rate</h2>
        <div class="legend"><span><i class="sw hue-accent line"></i>Monthly</span><span><i class="sw dash"></i>3-month average</span></div></div>
      <div id="trRate"></div>
      <p class="trend-note">${escapeHtml(rateStory(months, partial))}</p>
    </section>
    <section class="panel" aria-labelledby="abH"><h2 id="abH">Account balances</h2>
      <div class="bal-rows">${trendAccountRows(months[0].date, span.last)}</div>
    </section>`;
  root.appendChild(row);
  const holder=$('#trRate');
  holder.innerHTML=rateChartSvg(months, Math.max(300,Math.min(640,Math.round(holder.clientWidth||560))));

  /* ---- top categories over time ---- */
  const totals={};
  months.forEach(m=>byCategory(m.txs,'expense').forEach(c=>{ totals[c.category]=(totals[c.category]||0)+c.amount; }));
  const top=Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([c])=>c);
  if (top.length) {
    const cell=months.map(m=>Object.fromEntries(byCategory(m.txs,'expense').map(c=>[c.category,c.amount])));
    appendHtml(root,`<section class="panel" aria-labelledby="ctH">
      <div class="panel-head"><h2 id="ctH">Top categories over time</h2><span class="aside">Darker cells are that category's most expensive months</span></div>
      <div class="table-scroll"><table class="heat-tbl">
        <thead><tr><th scope="col">Category</th>${months.map(m=>`<th scope="col">${mShort(m)}</th>`).join('')}<th scope="col" class="r">${months.length}-mo total</th></tr></thead>
        <tbody>${top.map(c=>{
          const vals=cell.map(x=>x[c]||0), lo=Math.min(...vals), hi=Math.max(...vals);
          return `<tr><th scope="row">${escapeHtml(c)}</th>${vals.map((v,i)=>{
            const lvl=hi===lo?2:Math.round((v-lo)/(hi-lo)*5);
            return `<td><span class="ht l${lvl}" title="${escapeHtml(c)}, ${dayjs(months[i].date).format('MMMM')}${note(months[i])}: ${fmt(v)}">${fmt0(v)}</span></td>`;
          }).join('')}<td class="r strong">${fmt0(totals[c])}</td></tr>`;
        }).join('')}</tbody></table></div>
    </section>`);
  }
});

// The savings-rate chart: each month's rate and a 3-month average (dashed), as inline SVG
// colored by CSS classes (.lc-*). `w` is the width it's drawn at, so 11px labels stay 11px.
function rateChartSvg(months, w) {
  const pts=months.map((m,i)=>{
    const win=months.slice(Math.max(0,i-2),i+1).filter(x=>x.rate!=null);
    return { m, r:m.rate, avg:win.length?win.reduce((s,x)=>s+x.rate,0)/win.length:null };
  });
  const vals=pts.flatMap(p=>[p.r,p.avg]).filter(v=>v!=null).map(v=>Math.max(-1,Math.min(1,v)));
  if (!vals.length) return '<p class="empty-note">No income in these months, so there is no savings rate.</p>';
  const step=niceStep(((Math.max(0,...vals)-Math.min(0,...vals))*100)/2||20);
  const lo=Math.floor(Math.min(0,...vals)*100/step)*step, hi=Math.max(step,Math.ceil(Math.max(...vals)*100/step-1e-9)*step);
  const h=210, L=44, R=16, T=22, B=28, pw=w-L-R, ph=h-T-B;
  const X=i=>L+(pts.length<2?pw/2:i*pw/(pts.length-1)), Y=v=>T+(hi-v*100)/(hi-lo)*ph;
  const o=[`<svg class="linechart hue-accent" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${escapeHtml('Savings rate by month: '+pts.map(p=>`${dayjs(p.m.date).format('MMMM')} ${p.r==null?'no income':pctStr(p.r)}`).join(', '))}">`];
  for (let v=lo; v<=hi+1e-9; v+=step) {
    const y=Y(v/100).toFixed(1);
    o.push(`<line class="${Math.abs(v)<1e-9?'lc-axis':'lc-grid'}" x1="${L}" y1="${y}" x2="${w-R}" y2="${y}"/><text class="lc-label" x="0" y="${(+y+4).toFixed(1)}">${v}%</text>`);
  }
  const line=(key,cls)=>{ const seg=pts.map((p,i)=>p[key]==null?null:`${X(i).toFixed(1)},${Y(Math.max(-1,Math.min(1,p[key]))).toFixed(1)}`).filter(Boolean); return seg.length>1?`<polyline class="${cls}" points="${seg.join(' ')}"/>`:''; };
  o.push(line('avg','lc-line avg'), line('r','lc-line'));
  const withRate=pts.map((p,i)=>({p,i})).filter(x=>x.p.r!=null);
  withRate.forEach(({p,i})=>o.push(`<circle class="lc-pt" cx="${X(i).toFixed(1)}" cy="${Y(Math.max(-1,Math.min(1,p.r))).toFixed(1)}" r="4"><title>${dayjs(p.m.date).format('MMMM')}: ${pctStr(p.r)} (3-month average ${pctStr(p.avg)})</title></circle>`));
  // value labels on the first, the lowest and the last month
  const lowest=withRate.reduce((a,x)=>x.p.r<a.p.r?x:a,withRate[0]);
  const marks=[...new Set([withRate[0], lowest, withRate[withRate.length-1]])];
  marks.forEach(({p,i})=>{ const y=Y(Math.max(-1,Math.min(1,p.r))); const below=p===lowest.p&&p!==withRate[0].p&&p!==withRate[withRate.length-1].p;
    o.push(`<text class="lc-value" x="${X(i).toFixed(1)}" y="${(below?y+19:y-10).toFixed(1)}" text-anchor="${i===0&&pts.length>1?'start':i===pts.length-1&&pts.length>1?'end':'middle'}">${pctStr(p.r)}</text>`); });
  pts.forEach((p,i)=>o.push(`<text class="lc-label" x="${X(i).toFixed(1)}" y="${h-6}" text-anchor="${i===0&&pts.length>1?'start':i===pts.length-1&&pts.length>1?'end':'middle'}">${dayjs(p.m.date).format('MMM')}</text>`));
  o.push('</svg>');
  return o.join('');
}

// A sentence under the savings-rate chart, from the numbers: the best and worst months,
// what pulled the worst one down, and where the latest month stands.
function rateStory(months, partial) {
  const r=months.filter(m=>m.rate!=null);
  if (r.length<2) return r.length?`${dayjs(r[0].date).format('MMMM')}'s savings rate is ${pctStr(r[0].rate)}.`:'No income in these months yet.';
  const name=m=>dayjs(m.date).format('MMMM');
  const hi=r.reduce((a,m)=>m.rate>a.rate?m:a,r[0]), lo=r.reduce((a,m)=>m.rate<a.rate?m:a,r[0]), last=r[r.length-1];
  const avg=r.reduce((s,m)=>s+m.rate,0)/r.length;
  if (pctStr(hi.rate)===pctStr(lo.rate)) return `Your savings rate was ${pctStr(hi.rate)} every month.`;
  const out=[`${name(hi)} had the highest rate (${pctStr(hi.rate)}) and ${name(lo)} the lowest (${pctStr(lo.rate)}).`];
  // the category furthest above its usual level in the lowest month
  const others=r.filter(m=>m!==lo);
  let push=null;
  byCategory(lo.txs,'expense').forEach(c=>{
    const usual=others.reduce((s,m)=>s+(byCategory(m.txs,'expense').find(x=>x.category===c.category)?.amount||0),0)/others.length;
    const over=c.amount-usual;
    if (over>=50&&(!push||over>push.over)) push={ cat:c.category, amt:c.amount, usual, over };
  });
  if (push) out.push(`${push.cat} spending in ${name(lo)} (${fmt0(push.amt)}, against about ${fmt0(push.usual)} in other months) pulled it down.`);
  if (last!==hi&&last!==lo) out.push(`${name(last)}${partial&&last===months[months.length-1]?' so far':''} is at ${pctStr(last.rate)}, ${pctStr(last.rate)===pctStr(avg)?'the same as':last.rate>avg?'above':'below'} the ${r.length}-month average of ${pctStr(avg)}.`);
  return out.join(' ');
}

// Trends → Account balances: one row per account with a sparkline from `from` to `to`,
// a line about how it moved, and its balance at `to` (balanceAt(), as the Overview cards).
function trendAccountRows(from, to) {
  const accts=orderedAccounts();
  if (!accts.length) return '<p class="empty-note">No accounts yet.</p>';
  const end=new Date(to.getFullYear(),to.getMonth(),to.getDate(),23,59,59);
  return accts.map(a=>{
    const own=State.transactions.filter(t=>t.account===a.id);
    const card=a.kind==='credit_card';
    const first=own.length?Math.max(from.getTime(),dataSpan(own).first.getTime()):from.getTime();
    const vals=[];
    for (let i=0;i<24;i++) { const v=balanceAt(a.id,new Date(first+(end.getTime()-first)*i/23)); vals.push(card?debtOf(v):v); }
    const now=vals[vals.length-1], start=vals[0];
    const lo=Math.min(...vals), hiV=Math.max(...vals), months=Math.max(1,(end.getTime()-first)/(30.44*DAY));
    let story;
    if (card) {
      const pays=own.filter(isCardPayment).map(t=>t.date);
      const rh=rhythmOf(pays);
      story=rh?`Paid down ${rh.charAt(0).toLowerCase()+rh.slice(1)}`.replace('Paid down monthly, around','Paid down around'):pays.length?`Last paid ${dayjs(pays.sort((x,y)=>y-x)[0]).format('MMM D')}`:'No payments yet';
    } else {
      const per=(now-start)/months;
      story=(hiV-lo)>2*Math.abs(now-start)&&(hiV-lo)>=200?`Swings between ${fmt0(lo)} and ${fmt0(hiV)}`
        :Math.abs(per)<25?'About level':`${per>0?'Up':'Down'} about ${fmt0(Math.abs(per))} a month`;
    }
    const hue=card?'card':a.kind==='bank_savings'?'teal-text':'accent';
    const name=acctName(a.id);
    return `<div class="bal-row">
      <div class="who"><div class="n">${escapeHtml(name)}</div><div class="d">${escapeHtml(story)}</div></div>
      ${sparkSvg(vals,hue,`${name} ${card?'amount owed':'balance'}, ${dayjs(first).format('MMM D')} to ${dayjs(end).format('MMM D')}: from ${fmt0(start)} to ${fmt0(now)}`)||'<span></span>'}
      <span class="v">${card?`${fmt(now)} <small>owed</small>`:fmt(now)}</span>
    </div>`;
  }).join('');
}
