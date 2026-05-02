/* ================================================================
   FINLENS — views-forecast.js
   Forecast Savings (renamed from Forecast Simulator)
================================================================ */

let forecastInputs=null;
let forecastTab='savings'; // 'savings' | 'investments'

function getForecastDefaults() {
  const balances=currentBalances();
  const months=byMonth(State.transactions);
  const recent3=months.slice(-3);
  const avgIncome=recent3.length?recent3.reduce((s,m)=>s+m.income,0)/recent3.length:3000;
  const avgExpense=recent3.length?recent3.reduce((s,m)=>s+m.expense,0)/recent3.length:2000;
  const checking=Object.values(State.accounts).find(a=>a.kind==='ally_checking');
  const savings=Object.values(State.accounts).find(a=>a.kind==='ally_savings');
  const debt=Object.values(State.accounts).filter(a=>a.kind==='chase').reduce((s,a)=>s+Math.abs(balances[a.id]||0),0);
  return {
    checkingStart: checking?(balances[checking.id]||0):1000,
    savingsStart:  savings?(balances[savings.id]||0):0,
    debtStart:     debt,
    monthlyIncome: avgIncome,
    monthlyExpense: avgExpense,
    transferToSavings: 0,
    debtPaymentExtra: 0,
    debtAPR: 22,
    horizon: 12,
    events: [],
  };
}

function _renderForecastSavings(root){
  if (!forecastInputs) forecastInputs=getForecastDefaults();
  const f=forecastInputs;

  const inputCard=document.createElement('div'); inputCard.className='card';
  inputCard.innerHTML=`
    <h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      Inputs
      <button class="btn ghost sm" onclick="forecastInputs=getForecastDefaults();renderActive()">↻ Reset to defaults</button>
    </h2>
    <div class="grid grid-3" style="margin-top:10px">
      <div>
        <label class="lbl">Checking Start Balance ($)</label>
        <input class="input" type="number" id="fcChecking" value="${f.checkingStart.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Savings Start Balance ($)</label>
        <input class="input" type="number" id="fcSavings" value="${f.savingsStart.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Debt Current Balance ($)</label>
        <input class="input" type="number" id="fcDebt" value="${f.debtStart.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Monthly Income ($)</label>
        <input class="input" type="number" id="fcInc" value="${f.monthlyIncome.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Monthly Expenses ($)</label>
        <input class="input" type="number" id="fcExp" value="${f.monthlyExpense.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Transfer → Savings / mo ($)</label>
        <input class="input" type="number" id="fcTransfer" value="${f.transferToSavings.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Extra Debt Payment / mo ($)</label>
        <input class="input" type="number" id="fcDebtExtra" value="${f.debtPaymentExtra.toFixed(0)}">
      </div>
      <div>
        <label class="lbl">Debt APR (%)</label>
        <input class="input" type="number" step="0.01" id="fcApr" value="${f.debtAPR}">
      </div>
      <div>
        <label class="lbl">Horizon (months): <span id="fcHorVal">${f.horizon}</span></label>
        <input type="range" min="3" max="36" value="${f.horizon}" id="fcHor" style="width:100%;margin-top:4px">
      </div>
    </div>
    <h3 style="margin:12px 0 6px">One-Off Events</h3>
    <div id="fcEvents"></div>
    <button class="btn ghost sm" onclick="addForecastEvent()">+ Add event</button>
    <div class="hr"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" onclick="runForecast()">▶ Run Simulation</button>
      <button class="btn ghost" onclick="saveScenario()">💾 Save Scenario</button>
      <select class="select" id="fcLoad" style="width:auto" onchange="loadScenario(this.value)">
        <option value="">Load scenario…</option>
        ${(State.scenarios||[]).map((s,i)=>`<option value="${i}">${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>`;
  root.appendChild(inputCard);

  renderForecastEvents();

  const outCard=document.createElement('div'); outCard.className='card'; outCard.id='fcOut';
  outCard.innerHTML=`
    <h2 class="section-title">Projection</h2>
    <div class="chart-wrap tall" style="max-height:340px"><canvas id="fcChart"></canvas></div>
    <div id="fcTable" style="margin-top:14px;max-height:320px;overflow-y:auto"></div>`;
  root.appendChild(outCard);

  // Wire inputs
  ['fcChecking','fcSavings','fcDebt','fcInc','fcExp','fcTransfer','fcDebtExtra','fcApr'].forEach(id=>{
    const el=$('#'+id);
    if (el) el.oninput=()=>{
      f.checkingStart=parseFloat($('#fcChecking').value)||0;
      f.savingsStart=parseFloat($('#fcSavings').value)||0;
      f.debtStart=parseFloat($('#fcDebt').value)||0;
      f.monthlyIncome=parseFloat($('#fcInc').value)||0;
      f.monthlyExpense=parseFloat($('#fcExp').value)||0;
      f.transferToSavings=parseFloat($('#fcTransfer').value)||0;
      f.debtPaymentExtra=parseFloat($('#fcDebtExtra').value)||0;
      f.debtAPR=parseFloat($('#fcApr').value)||0;
      runForecast();
    };
  });
  $('#fcHor').oninput=()=>{ f.horizon=parseInt($('#fcHor').value); $('#fcHorVal').textContent=f.horizon; runForecast(); };
  setTimeout(runForecast,0);
}

registerView('forecast','Forecast',(root)=>{
  // Sub-tab bar: Savings · Investments
  const tabBar=document.createElement('div');
  tabBar.style.cssText='display:flex;gap:6px;margin-bottom:12px';
  tabBar.innerHTML=`
    <button class="btn${forecastTab==='savings'?'':' ghost'} sm" data-tab="savings" style="border-radius:20px">Savings</button>
    <button class="btn${forecastTab==='investments'?'':' ghost'} sm" data-tab="investments" style="border-radius:20px">Investments</button>`;
  root.appendChild(tabBar);
  tabBar.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{forecastTab=btn.dataset.tab;renderActive();});

  if (forecastTab==='savings') _renderForecastSavings(root);
  else _renderForecastInvest(root);
});

function renderForecastEvents() {
  const f=forecastInputs;
  const el=$('#fcEvents'); if (!el) return;
  el.innerHTML=(f.events||[]).map((e,i)=>`
    <div class="row" style="margin-bottom:6px;align-items:center">
      <input class="input" placeholder="Label" value="${escapeHtml(e.label||'')}" onchange="forecastInputs.events[${i}].label=this.value">
      <input class="input" type="number" placeholder="Month #" style="width:90px" value="${e.month||1}" onchange="forecastInputs.events[${i}].month=parseInt(this.value)||1;runForecast()">
      <input class="input" type="number" placeholder="Amount (+/-)" style="width:130px" value="${e.amount||0}" onchange="forecastInputs.events[${i}].amount=parseFloat(this.value)||0;runForecast()">
      <button class="btn ghost sm" onclick="forecastInputs.events.splice(${i},1);renderActive()">×</button>
    </div>`).join('');
}

function addForecastEvent() { forecastInputs.events.push({label:'',month:1,amount:0}); renderActive(); }

function runForecast() {
  const chartEl=$('#fcChart');
  if (!chartEl) return;
  const f=forecastInputs;
  const months=[];
  let chk=f.checkingStart, sav=f.savingsStart, debt=f.debtStart;
  const apr=f.debtAPR/100/12;
  for (let mo=0;mo<f.horizon;mo++) {
    if (debt>0) debt+=debt*apr;
    chk+=f.monthlyIncome-f.monthlyExpense;
    chk-=f.transferToSavings; sav+=f.transferToSavings;
    const debtPay=Math.min(debt,f.debtPaymentExtra+(f.monthlyIncome>0?Math.min(50,debt*0.02):0));
    chk-=debtPay; debt=Math.max(0,debt-debtPay);
    (f.events||[]).filter(e=>e.month===mo+1).forEach(e=>{ chk+=e.amount; });
    months.push({
      month:mo+1,
      label:dayjs(new Date(new Date().getFullYear(),new Date().getMonth()+mo+1,1)).format('MMM YY'),
      checking:chk, savings:sav, debt
    });
  }

  if (window._fcChart) window._fcChart.destroy();
  window._fcChart=new Chart(chartEl,{
    type:'line',
    data:{
      labels:months.map(m=>m.label),
      datasets:[
        {label:'Checking',data:months.map(m=>m.checking),borderColor:'#3B82F6',backgroundColor:'rgba(59,130,246,.1)',fill:true,tension:.25,borderWidth:2,pointRadius:2},
        {label:'Savings',data:months.map(m=>m.savings),borderColor:'#00C49A',backgroundColor:'rgba(0,196,154,.1)',fill:true,tension:.25,borderWidth:2,pointRadius:2},
        {label:'Debt',data:months.map(m=>-m.debt),borderColor:'#EF4444',backgroundColor:'rgba(239,68,68,.1)',fill:true,tension:.25,borderWidth:2,pointRadius:2},
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
      scales:{
        y:{
          ticks:{callback:v=>{ const a=Math.abs(v); return (v<0?'-':'')+( a>=1000?'$'+(a/1000).toFixed(0)+'K':'$'+a ); }},
        }
      }
    }
  });

  const tableDiv=$('#fcTable');
  if (tableDiv) {
    tableDiv.innerHTML=`
      <h3 style="margin-bottom:6px">Month-by-Month</h3>
      <table class="tbl"><thead><tr><th>Month</th><th>Checking</th><th>Savings</th><th>Debt</th><th>Net</th></tr></thead>
      <tbody>${months.map(m=>{
        const net=m.checking+m.savings-m.debt;
        return `<tr>
          <td>${m.label}</td>
          <td class="num ${m.checking<0?'amt-neg':''}">${fmt(m.checking)}</td>
          <td class="num">${fmt(m.savings)}</td>
          <td class="num ${m.debt>0?'amt-neg':''}">${fmt(m.debt)}</td>
          <td class="num ${net>=0?'amt-pos':'amt-neg'}">${fmt(net)}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
}

function saveScenario() {
  const name=prompt('Name this scenario:');
  if (!name) return;
  State.scenarios=State.scenarios||[];
  State.scenarios.push({name,inputs:JSON.parse(JSON.stringify(forecastInputs))});
  lsSet('scenarios',State.scenarios);
  renderActive();
}
function loadScenario(idx) {
  if (!idx) return;
  forecastInputs=JSON.parse(JSON.stringify(State.scenarios[idx].inputs));
  renderActive();
}
