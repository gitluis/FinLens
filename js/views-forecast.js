/* ================================================================
   FINLENS — views-forecast.js
   Forecast (Clarity, v1.15.0): sub-tabs Savings and Investments.
   The Investments tab is drawn by _renderForecastInvest() in views-invest.js.
   Projections use growthByYear() in aggregation.js.
================================================================ */

let forecastTab='savings';   // 'savings' | 'investments'
// Savings inputs live in memory: they start from your accounts on every page load. Saved
// scenarios (State.scenarios) keep a copy of them.
let forecastInputs=null;
const SCENARIO_MAX=10;

function getForecastDefaults() {
  const bal=currentBalances(), accts=orderedAccounts();
  const sumKind=(k)=>accts.filter(a=>a.kind===k).reduce((s,a)=>s+(Number(bal[a.id])||0),0);
  // Today's debt: every debt on the Debt screen, plus card balances no debt there stands for.
  const linked=new Set((State.debts||[]).filter(debtLinked).map(d=>d.account));
  const cards=accts.filter(a=>a.kind==='credit_card'&&!linked.has(a.id)).reduce((s,a)=>s+Math.abs(Number(bal[a.id])||0),0);
  const debt=cards+(State.debts||[]).reduce((s,d)=>s+debtBalance(d),0);
  const pace=savingsPace();
  return { checking:Math.round(sumKind('bank_checking')), savings:Math.round(sumKind('bank_savings')), debt:Math.round(debt),
    monthly:pace&&pace.perMonth>0?Math.round(pace.perMonth/10)*10:0, rate:4, tax:22, years:10 };
}
// After-tax yearly rate: the APY less the tax on its interest.
const savingsAfterTax=(f)=>(Number(f.rate)||0)*(1-(Number(f.tax)||0)/100);
function savingsProjection(f) {
  return growthByYear((Number(f.checking)||0)+(Number(f.savings)||0), f.monthly, savingsAfterTax(f), f.years);
}
// A saved scenario's inputs. Scenarios saved before v1.15.0 held the old simulator's
// inputs (income, expenses, a transfer to savings, debt payments, a horizon in months):
// they become their monthly net (income − expenses − extra debt payment), no interest,
// and the horizon in whole years.
function scenarioInputs(s) {
  const i=s.inputs||{};
  if (i.checking!=null||s.kind==='savings') return { checking:+i.checking||0, savings:+i.savings||0, debt:+i.debt||0, monthly:+i.monthly||0, rate:+i.rate||0, tax:+i.tax||0, years:Math.min(30,Math.max(1,+i.years||1)) };
  return { checking:+i.checkingStart||0, savings:+i.savingsStart||0, debt:+i.debtStart||0,
    monthly:(+i.monthlyIncome||0)-(+i.monthlyExpense||0)-(+i.debtPaymentExtra||0), rate:0, tax:0,
    years:Math.min(30,Math.max(1,Math.round((+i.horizon||12)/12))), old:true };
}

registerView('forecast','Forecast',(root)=>{
  pageActions(root,'Projections from the numbers you choose. Returns are assumptions, not promises.','');
  const tabs=[['savings','Savings','fcTabSav'],['investments','Investments','fcTabInv']];
  appendHtml(root,`<div class="seg tabs-seg" role="tablist" aria-label="Forecast type">${tabs.map(([k,l,id])=>
    `<button type="button" role="tab" id="${id}" data-tab="${k}" aria-selected="${forecastTab===k}" aria-controls="fcPanel" tabindex="${forecastTab===k?0:-1}">${l}</button>`).join('')}</div>`);
  const pick=(k)=>{ forecastTab=k; renderActive(); const t=$(`[role="tab"][data-tab="${k}"]`); if (t) t.focus(); };
  $$('[role="tab"]',root).forEach((b,i,all)=>{
    b.onclick=()=>pick(b.dataset.tab);
    b.onkeydown=(e)=>{
      const n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:e.key==='Home'?0:e.key==='End'?all.length-1:null;
      if (n==null) return;
      e.preventDefault(); pick(all[(n+all.length)%all.length].dataset.tab);
    };
  });
  const panel=document.createElement('div');
  panel.id='fcPanel'; panel.setAttribute('role','tabpanel');
  panel.setAttribute('aria-labelledby',forecastTab==='savings'?'fcTabSav':'fcTabInv');
  root.appendChild(panel);
  if (forecastTab==='investments') _renderForecastInvest(panel);
  else _renderForecastSavings(panel);
});

function _renderForecastSavings(panel) {
  if (!forecastInputs) forecastInputs=getForecastDefaults();
  const f=forecastInputs;
  const inp=(k,label,step)=>`<label class="field">${label}<input class="input" type="number" step="${step}" inputmode="decimal" data-fc="${k}" value="${escapeHtml(String(f[k]))}"></label>`;
  panel.insertAdjacentHTML('beforeend',`<div class="cols-3">
    <section class="panel" aria-labelledby="sInH">
      <div class="panel-head center"><h2 id="sInH">Your numbers</h2><button type="button" class="btn text sm" id="fcReset" aria-label="Reset to your account balances" title="Reset to your account balances">Reset</button></div>
      <p class="sub" style="margin:0">Starting balances come from your accounts. Change any of them.</p>
      <div class="fc-form">
        ${inp('checking','Checking ($)',1)}${inp('savings','Savings ($)',1)}${inp('debt','Debt to subtract ($)',1)}${inp('monthly','Saved each month ($)',50)}
        <div class="field-row">${inp('rate','Interest (APY %)',0.1)}${inp('tax','Tax on interest (%)',1)}</div>
        <label class="slider sm"><span class="top"><span>Years</span><b id="fcYearsVal">${f.years}</b></span><input type="range" min="1" max="30" data-fc="years" value="${f.years}" aria-label="Years"></label>
      </div>
    </section>
    <div class="span-2 fc-out">
      <section class="panel" aria-labelledby="sOutH" id="fcOut"></section>
      <section class="panel" aria-labelledby="scH" id="fcScen"></section>
    </div></div>`);
  const draw=()=>{ $('#fcOut').innerHTML=savingsForecastHtml(f); };
  draw(); drawScenarios();
  $$('[data-fc]',panel).forEach(el=>el.addEventListener('input',()=>{
    const k=el.dataset.fc, v=parseFloat(el.value);
    f[k]=k==='years'?Math.min(30,Math.max(1,Math.round(v)||1)):(isFinite(v)?v:0);
    if (k==='years') $('#fcYearsVal').textContent=f.years;
    draw();
  }));
  $('#fcReset').onclick=()=>{ forecastInputs=getForecastDefaults(); renderActive(); const b=$('#fcReset'); if (b) b.focus(); };
}

function savingsForecastHtml(f) {
  const rows=savingsProjection(f), last=rows[rows.length-1];
  const max=Math.max(1,...rows.map(r=>Math.max(r.balance,r.putIn)));
  const at=savingsAfterTax(f);
  return `<h2 id="sOutH">In ${plural(f.years,'year')}</h2>
    <div class="big-stats"><div><span class="l">Projected savings</span><span class="v">${fmtMinus0(last.balance)}</span></div>
      <div><span class="l">After today's debt</span><span class="v">${fmtMinus0(last.balance-(Number(f.debt)||0))}</span></div>
      <div><span class="l">Interest earned</span><span class="v c-teal">${fmtMinus0(last.balance-last.putIn)}</span></div></div>
    <div class="legend"><span><i class="sw hue-accent"></i>What you put in</span><span><i class="sw hue-teal"></i>Interest after tax</span></div>
    <div class="ybars" role="img" aria-label="${escapeHtml(`Savings grow to ${fmtMinus0(last.balance)} in ${plural(f.years,'year')}`)}">${rows.map(r=>{
      const c=Math.max(0,Math.min(r.putIn,r.balance)), g=Math.max(0,r.balance-r.putIn);
      return `<span class="yb" title="Year ${r.year}: ${fmtMinus0(r.balance)}"><i class="g" style="height:${(g/max*100).toFixed(1)}%"></i><i class="c" style="height:${(c/max*100).toFixed(1)}%"></i></span>`; }).join('')}</div>
    <div class="axis-ends"><span>Year 1</span><span>Year ${f.years}</span></div>
    <p class="trend-note">Interest compounds monthly from the APY after tax (${pctNum(Number(f.rate)||0)}% less ${pctNum(Number(f.tax)||0)}% tax is ${at.toFixed(2)}% a year). What you save each month is added at the end of the month.</p>`;
}

function drawScenarios() {
  const box=$('#fcScen'); if (!box) return;
  const list=State.scenarios||[];
  box.innerHTML=`<div class="panel-head center"><h2 id="scH">Saved scenarios <span class="n-of">· ${list.length} of ${SCENARIO_MAX}</span></h2>
      <button type="button" class="btn ghost" id="fcSave" ${list.length>=SCENARIO_MAX?'disabled title="Delete one to save another"':''}>Save this scenario</button></div>
    ${list.length?`<div class="rows">${list.map((s,i)=>{
      const x=scenarioInputs(s), rows=savingsProjection(x), fin=rows[rows.length-1].balance;
      const detail=`${fmt0(x.monthly)}/mo · ${x.years} yrs · ${(Number(x.rate)||0).toFixed(1)}%${x.old?' · from an earlier version':''}`;
      const n=escapeHtml(s.name||`Scenario ${i+1}`);
      return `<div class="r scen"><span class="t"><button type="button" class="link-btn" data-sc-load="${i}" aria-label="Load scenario ${n}" title="Load into the form">${n}</button></span>
        <span class="d">${detail}</span><span class="amt">${fmtMinus0(fin)}</span>
        <button type="button" class="icon-x" data-sc-del="${i}" aria-label="Delete scenario ${n}" title="Delete">×</button></div>`; }).join('')}</div>`
      :'<p class="empty-note">No saved scenarios yet. Save this one to compare it with others later.</p>'}`;
  $('#fcSave').onclick=()=>{
    const list=State.scenarios=State.scenarios||[];
    if (list.length>=SCENARIO_MAX) return;
    const names=new Set(list.map(s=>s.name));
    let n=list.length+1; while (names.has(`Scenario ${n}`)) n++;
    list.push({ name:`Scenario ${n}`, kind:'savings', inputs:{ ...forecastInputs } });
    lsSet('scenarios',list);
    drawScenarios(); const b=$('#fcSave'); if (b&&!b.disabled) b.focus(); else { const ls=$$('[data-sc-load]'); if (ls.length) ls[ls.length-1].focus(); }
  };
  $$('[data-sc-load]',box).forEach(b=>b.onclick=()=>{ const x=scenarioInputs(State.scenarios[+b.dataset.scLoad]); delete x.old; forecastInputs=x; renderActive(); const f=$('[data-fc="checking"]'); if (f) f.focus(); });
  $$('[data-sc-del]',box).forEach(b=>b.onclick=()=>{ State.scenarios.splice(+b.dataset.scDel,1); lsSet('scenarios',State.scenarios); drawScenarios(); const s=$('#fcSave'); if (s) s.focus(); });
}
