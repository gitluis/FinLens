/* ================================================================
   FINLENS — views-plan.js
   The Plan screens (Clarity, v1.15.0): Budget, Savings buckets and
   Debt tracker. Investing ideas is in views-invest.js, Forecast in
   views-forecast.js. Trends (below) is unchanged until its own redesign.
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
      {label:'Monthly',data:months.map(m=>m.expense),borderColor:chartColor('--chart-neutral'),borderDash:[4,4],pointRadius:0,tension:.3,fill:false},
      {label:'3-mo Rolling',data:rollingSpending.map(r=>r.avg),borderColor:chartColor('--chart-out'),backgroundColor:chartColor('--chart-out',.12),fill:true,tension:.35,borderWidth:2}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},scales:{y:{ticks:{callback:v=>'$'+v.toLocaleString()}}}}});
    new Chart($('#trSav'),{type:'line',data:{labels:savingsRates.map(r=>r.month),datasets:[{label:'Savings Rate',data:savingsRates.map(r=>r.rate*100),borderColor:chartColor('--chart-in'),backgroundColor:chartColor('--chart-in',.12),fill:true,tension:.35,borderWidth:2,pointRadius:3}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v.toFixed(0)+'%'}}}}});
    new Chart($('#trFreq'),{type:'bar',data:{labels:topFreq.map(t=>t[0].slice(0,28)),datasets:[{label:'Visits',data:topFreq.map(t=>t[1]),backgroundColor:chartColor('--violet'),borderRadius:4}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}}}});
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
