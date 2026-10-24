/* ================================================================
   FINLENS — views-invest.js
   Investing Ideas + Forecast Investments (new tab)
================================================================ */

/* =================== INVESTING IDEAS =================== */
const ETF_LIST = [
  {ticker:'VTI',  name:'Vanguard Total Stock Market',    cat:'US Equities',  risk:'Medium', sugPct:35, rationale:'Broad exposure to the entire US stock market in one fund.'},
  {ticker:'VXUS', name:'Vanguard Total International',   cat:'Intl Equities',risk:'Medium', sugPct:15, rationale:'Global diversification outside the US.'},
  {ticker:'BND',  name:'Vanguard Total Bond Market',     cat:'US Bonds',     risk:'Low',    sugPct:20, rationale:'Income and stability — counter-balance to stocks.'},
  {ticker:'VNQ',  name:'Vanguard Real Estate',           cat:'REITs',        risk:'Medium', sugPct:5,  rationale:'Real estate exposure without owning property.'},
  {ticker:'QQQ',  name:'Invesco Nasdaq-100',             cat:'Tech-heavy',   risk:'High',   sugPct:10, rationale:'Concentrated bet on large US tech.'},
  {ticker:'SCHD', name:'Schwab US Dividend Equity',      cat:'Dividend',     risk:'Medium', sugPct:10, rationale:'High-quality dividend payers — passive income tilt.'},
  {ticker:'VTIP', name:'Vanguard Short-Term TIPS',       cat:'Inflation',    risk:'Low',    sugPct:5,  rationale:'Inflation protection for bond portion.'},
];
const STOCK_LIST = [
  {ticker:'AAPL',  name:'Apple',              cat:'Mega-cap tech',      risk:'Medium',    sugPct:10, rationale:'Massive cash generation and ecosystem moat.'},
  {ticker:'MSFT',  name:'Microsoft',          cat:'Mega-cap tech',      risk:'Medium',    sugPct:10, rationale:'Cloud + enterprise software durable growth.'},
  {ticker:'GOOGL', name:'Alphabet',           cat:'Mega-cap tech',      risk:'Medium',    sugPct:8,  rationale:'Search dominance plus AI/cloud optionality.'},
  {ticker:'AMZN',  name:'Amazon',             cat:'Consumer + Cloud',   risk:'Medium',    sugPct:8,  rationale:'Retail scale + AWS profit engine.'},
  {ticker:'BRK.B', name:'Berkshire Hathaway', cat:'Conglomerate',       risk:'Low-Med',   sugPct:10, rationale:'Diversified holdings, value-oriented, Buffett-managed.'},
  {ticker:'JNJ',   name:'Johnson & Johnson',  cat:'Healthcare',         risk:'Low',       sugPct:8,  rationale:'Defensive dividend-payer with healthcare moat.'},
  {ticker:'PG',    name:'Procter & Gamble',   cat:'Consumer Staples',   risk:'Low',       sugPct:8,  rationale:'Recession-resistant brand portfolio.'},
  {ticker:'NVDA',  name:'NVIDIA',             cat:'AI / Semiconductors',risk:'High',      sugPct:10, rationale:'Dominant position in AI chips and data center compute.'},
];

// Strong recommended portfolio
const RECOMMENDED_PORTFOLIO = [
  {ticker:'VTI',  pct:40, reason:'Core US equity engine — captures entire market growth'},
  {ticker:'VXUS', pct:20, reason:'International diversification reduces single-market risk'},
  {ticker:'BND',  pct:20, reason:'Bond cushion reduces volatility, generates income'},
  {ticker:'SCHD', pct:10, reason:'Dividend reinvestment compounds returns over time'},
  {ticker:'VNQ',  pct:5,  reason:'Real estate exposure acts as inflation hedge'},
  {ticker:'VTIP', pct:5,  reason:'Short-term TIPS protect against unexpected inflation'},
];

registerView('investments','Investments',(root)=>{
  const disc=document.createElement('div');
  disc.className='insight warn';
  disc.innerHTML=`⚠️ <strong>Educational only — not financial advice.</strong> Consult a financial advisor before investing. All investments carry risk.`;
  root.appendChild(disc);

  // Investable surplus
  const months=byMonth(State.transactions);
  const recent3=months.slice(-3);
  const avgIncome=recent3.length?recent3.reduce((s,m)=>s+m.income,0)/recent3.length:0;
  const avgExpense=recent3.length?recent3.reduce((s,m)=>s+m.expense,0)/recent3.length:0;
  const debtPmts=(State.debts||[]).reduce((s,d)=>s+(d.minPayment||0),0);
  const surplus=Math.max(0,avgIncome-avgExpense-debtPmts);
  const balances=currentBalances();
  const totalCash=Object.values(State.accounts).filter(a=>a.kind==='ally_checking'||a.kind==='ally_savings').reduce((s,a)=>s+(balances[a.id]||0),0);
  const monthsSaved=avgExpense>0?totalCash/avgExpense:0;
  const emergencyTarget=avgExpense*3;

  const m=document.createElement('div'); m.className='grid grid-3';
  m.innerHTML=`
    <div class="card"><h3>Avg Monthly Surplus</h3><div class="big num ${surplus>0?'amt-pos':'amt-neg'}">${fmt(surplus)}</div><div class="footnote">Income − Spend − Min debt pmts</div></div>
    <div class="card"><h3>Emergency Fund</h3><div class="big num">${monthsSaved.toFixed(1)} mo</div><div class="footnote">Target: 3 months = ${fmt(emergencyTarget)}</div></div>
    <div class="card"><h3>Investable Cash</h3><div class="big num">${fmt(Math.max(0,totalCash-emergencyTarget))}</div><div class="footnote">After emergency buffer</div></div>`;
  root.appendChild(m);

  // Allocation suggestion
  const allocCard=document.createElement('div'); allocCard.className='card';
  let allocRows;
  if (surplus<=0) {
    allocRows=`<p class="muted">No monthly surplus detected — focus on reducing expenses or increasing income before investing.</p>`;
  } else if (monthsSaved<3) {
    allocRows=`<div class="insight">First: build emergency fund to ${fmt(emergencyTarget)} (${fmt(Math.max(0,emergencyTarget-totalCash))} more needed).</div>
      <p class="muted" style="margin-top:8px">Suggested split of ${fmt(surplus)}/mo while building emergency fund:</p>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Bucket</th><th style="text-align:right">Allocation</th><th>Why</th></tr></thead>
      <tbody><tr><td><strong>Ally Savings / HYSA</strong></td><td class="num" style="text-align:right">${fmt(surplus*0.7)}</td><td>Emergency fund priority</td></tr>
      <tr><td><strong>401(k) up to employer match</strong></td><td class="num" style="text-align:right">${fmt(surplus*0.3)}</td><td>Free money — never leave match on the table</td></tr></tbody></table>`;
  } else {
    const a401k=Math.min(surplus*0.4,1000);
    const aETF=(surplus-a401k)*0.7;
    const aSavings=(surplus-a401k)*0.3;
    allocRows=`<p class="muted">Suggested monthly split of <strong>${fmt(surplus)}</strong> surplus:</p>
      <table class="tbl" style="margin-top:8px"><thead><tr><th>Bucket</th><th style="text-align:right">Allocation</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td><strong>401(k) / IRA</strong></td><td class="num" style="text-align:right">${fmt(a401k)}</td><td>Tax-advantaged. Capture employer match first.</td></tr>
        <tr><td><strong>Diversified ETF basket</strong></td><td class="num" style="text-align:right">${fmt(aETF)}</td><td>VTI + VXUS + BND for broad market exposure.</td></tr>
        <tr><td><strong>High-yield savings buffer</strong></td><td class="num" style="text-align:right">${fmt(aSavings)}</td><td>Liquid buffer above 3-month emergency fund.</td></tr>
      </tbody></table>`;
  }
  allocCard.innerHTML=`<h2 class="section-title">Personalized Starter Allocation</h2><div style="margin-top:10px">${allocRows}</div>`;
  root.appendChild(allocCard);

  // Recommended strong portfolio
  const recCard=document.createElement('div'); recCard.className='card';
  recCard.style.background='linear-gradient(135deg,var(--surface),var(--surface-2))';
  recCard.innerHTML=`<h2 class="section-title" style="display:flex;align-items:center;gap:8px">⭐ Recommended Strong Portfolio</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">A time-tested passive portfolio optimized for long-term growth with balanced risk. Based on evidence-based investing principles.</p>
    <table class="tbl" style="margin-top:10px">
      <thead><tr><th>Ticker</th><th>%</th><th>Reason</th></tr></thead>
      <tbody>${RECOMMENDED_PORTFOLIO.map(r=>`<tr>
        <td><strong class="num">${r.ticker}</strong></td>
        <td class="num"><strong>${r.pct}%</strong></td>
        <td style="font-size:12.5px">${r.reason}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="chart-wrap sm" style="margin-top:12px"><canvas id="recPortChart"></canvas></div>
    <p class="muted" style="font-size:11.5px;margin-top:8px">This 60/40-inspired portfolio targets ~7–8% annualized long-term returns with lower volatility than pure equity portfolios.</p>`;
  root.appendChild(recCard);

  // ETF table with allocation inputs
  const etfCard=document.createElement('div'); etfCard.className='card';
  etfCard.innerHTML=`<h2 class="section-title">ETFs to Consider</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Set your own % allocation in the "My %" column. Your custom portfolio is calculated below.</p>
    <table class="tbl" style="margin-top:8px">
      <thead><tr><th>Ticker</th><th>Name</th><th>Category</th><th>Risk</th><th>Suggested %</th><th>My %</th><th>Rationale</th></tr></thead>
      <tbody>${ETF_LIST.map(e=>`<tr>
        <td><strong class="num">${e.ticker}</strong></td>
        <td>${e.name}</td>
        <td><span class="chip">${e.cat}</span></td>
        <td><span class="pill ${e.risk==='Low'?'good':e.risk==='High'?'bad':'warn'}">${e.risk}</span></td>
        <td class="num" style="text-align:center">${e.sugPct}%</td>
        <td><input class="alloc-input" type="number" min="0" max="100" placeholder="0" value="${State.investAlloc[e.ticker]||''}" data-ticker="${e.ticker}" onchange="saveInvestAlloc(this)"></td>
        <td style="font-size:12px">${e.rationale}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  root.appendChild(etfCard);

  // Stock table with allocation inputs
  const stkCard=document.createElement('div'); stkCard.className='card';
  stkCard.innerHTML=`<h2 class="section-title">Blue-Chip Stocks (Examples)</h2>
    <table class="tbl" style="margin-top:8px">
      <thead><tr><th>Ticker</th><th>Name</th><th>Category</th><th>Risk</th><th>Suggested %</th><th>My %</th><th>Rationale</th></tr></thead>
      <tbody>${STOCK_LIST.map(s=>`<tr>
        <td><strong class="num">${s.ticker}</strong></td>
        <td>${s.name}</td>
        <td><span class="chip">${s.cat}</span></td>
        <td><span class="pill ${s.risk==='Low'?'good':s.risk.includes('High')?'bad':'warn'}">${s.risk}</span></td>
        <td class="num" style="text-align:center">${s.sugPct}%</td>
        <td><input class="alloc-input" type="number" min="0" max="100" placeholder="0" value="${State.investAlloc[s.ticker]||''}" data-ticker="${s.ticker}" onchange="saveInvestAlloc(this)"></td>
        <td style="font-size:12px">${s.rationale}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  root.appendChild(stkCard);

  // My portfolio summary
  const allItems=[...ETF_LIST,...STOCK_LIST];
  const myAlloc=allItems.filter(x=>State.investAlloc[x.ticker]>0).map(x=>({...x,myPct:Number(State.investAlloc[x.ticker])}));
  const totalMyPct=myAlloc.reduce((s,x)=>s+x.myPct,0);
  if (myAlloc.length) {
    const myCard=document.createElement('div'); myCard.className='card';
    myCard.innerHTML=`<h2 class="section-title">My Portfolio Summary</h2>
      ${totalMyPct!==100?`<div class="insight warn" style="margin-bottom:10px">Allocations total <strong>${totalMyPct}%</strong> — ${totalMyPct<100?'add '+(100-totalMyPct)+'% more':'reduce by '+(totalMyPct-100)+'%'} to reach 100%.</div>`:''}
      <table class="tbl">
        <thead><tr><th>Ticker</th><th>Name</th><th>My %</th></tr></thead>
        <tbody>${myAlloc.map(x=>`<tr><td><strong class="num">${x.ticker}</strong></td><td>${x.name}</td><td class="num"><strong>${x.myPct}%</strong></td></tr>`).join('')}</tbody>
      </table>
      <div class="chart-wrap sm" style="margin-top:12px"><canvas id="myPortChart"></canvas></div>`;
    root.appendChild(myCard);
    setTimeout(()=>{
      const ctx=$('#myPortChart');
      if (ctx) {
        new Chart(ctx,{type:'doughnut',data:{labels:myAlloc.map(x=>x.ticker),datasets:[{data:myAlloc.map(x=>x.myPct),backgroundColor:CHART_PALETTE}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:11}}}}}});
      }
    },0);
  }

  // AI CTA
  const cta=document.createElement('div'); cta.className='card'; cta.style.background='linear-gradient(135deg,#0F1C2E,#162436)'; cta.style.color='#fff';
  cta.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><div><div style="font-weight:600;color:#fff">Want personalized investing analysis?</div><div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">Ask Claude to analyze your full financial picture and tailor a plan.</div></div><button class="btn" onclick="showView('ai')">Ask Claude →</button></div>`;
  root.appendChild(cta);

  setTimeout(()=>{
    const ctx=$('#recPortChart');
    if (ctx) {
      new Chart(ctx,{type:'doughnut',data:{labels:RECOMMENDED_PORTFOLIO.map(r=>r.ticker),datasets:[{data:RECOMMENDED_PORTFOLIO.map(r=>r.pct),backgroundColor:CHART_PALETTE}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{boxWidth:10,font:{size:11}}}}}});
    }
  },0);
});

function saveInvestAlloc(input) {
  const ticker=input.dataset.ticker;
  const val=parseFloat(input.value)||0;
  State.investAlloc[ticker]=val;
  lsSet('investAlloc',State.investAlloc);
}

/* =================== FORECAST INVESTMENTS (NEW) =================== */
let investForecastInputs=null;
function getInvestForecastDefaults() {
  const months=byMonth(State.transactions);
  const recent3=months.slice(-3);
  const avgSurplus=recent3.length?Math.max(0,recent3.reduce((s,m)=>s+(m.income-m.expense),0)/recent3.length):500;
  return {
    startingAmount: 1000,
    monthlyContrib: Math.round(avgSurplus*0.5),
    annualReturn: 8,
    horizon: 20,
    returnPreset: 'moderate',  // conservative/moderate/aggressive/custom
    inflation: 2.5,
    allocPreset: 'recommended', // recommended / custom
  };
}

function _renderForecastInvest(root){
  if (!investForecastInputs) investForecastInputs=getInvestForecastDefaults();
  const f=investForecastInputs;

  const inputCard=document.createElement('div'); inputCard.className='card';
  inputCard.innerHTML=`
    <h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">
      Investment Forecast Inputs
      <button class="btn ghost sm" onclick="investForecastInputs=getInvestForecastDefaults();renderActive()">↻ Reset</button>
    </h2>
    <div class="grid grid-3" style="margin-top:12px">
      <div>
        <label class="lbl">Starting Amount ($)</label>
        <input class="input" type="number" id="ifStart" value="${f.startingAmount}" oninput="investForecastInputs.startingAmount=parseFloat(this.value)||0;runInvestForecast()">
      </div>
      <div>
        <label class="lbl">Monthly Contribution ($)</label>
        <input class="input" type="number" id="ifContrib" value="${f.monthlyContrib}" oninput="investForecastInputs.monthlyContrib=parseFloat(this.value)||0;runInvestForecast()">
      </div>
      <div>
        <label class="lbl">Horizon (years): <span id="ifHorVal">${f.horizon}</span></label>
        <input type="range" min="1" max="40" value="${f.horizon}" id="ifHor" style="width:100%;margin-top:4px" oninput="investForecastInputs.horizon=parseInt(this.value);document.getElementById('ifHorVal').textContent=this.value;runInvestForecast()">
      </div>
    </div>
    <div style="margin-top:12px">
      <label class="lbl">Expected Annual Return Preset</label>
      <div class="range-btns" style="margin-top:6px;display:inline-flex">
        <button data-preset="conservative" class="${f.returnPreset==='conservative'?'active':''}" onclick="setReturnPreset('conservative')">Conservative (5%)</button>
        <button data-preset="moderate" class="${f.returnPreset==='moderate'?'active':''}" onclick="setReturnPreset('moderate')">Moderate (8%)</button>
        <button data-preset="aggressive" class="${f.returnPreset==='aggressive'?'active':''}" onclick="setReturnPreset('aggressive')">Aggressive (11%)</button>
        <button data-preset="custom" class="${f.returnPreset==='custom'?'active':''}" onclick="setReturnPreset('custom')">Custom</button>
      </div>
      ${f.returnPreset==='custom'?`<div style="margin-top:8px;max-width:200px"><label class="lbl">Custom Annual Return (%)</label><input class="input" type="number" step="0.1" value="${f.annualReturn}" oninput="investForecastInputs.annualReturn=parseFloat(this.value)||0;runInvestForecast()"></div>`:''}
    </div>
    <div style="margin-top:12px;max-width:200px">
      <label class="lbl">Assumed Inflation (%/yr)</label>
      <input class="input" type="number" step="0.1" id="ifInflation" value="${f.inflation}" oninput="investForecastInputs.inflation=parseFloat(this.value)||0;runInvestForecast()">
    </div>`;
  root.appendChild(inputCard);

  const chartCard=document.createElement('div'); chartCard.className='card';
  chartCard.innerHTML=`
    <h2 class="section-title">Portfolio Growth Projection</h2>
    <div class="chart-wrap tall"><canvas id="ifChart"></canvas></div>`;
  root.appendChild(chartCard);

  const summaryCard=document.createElement('div'); summaryCard.id='ifSummary'; summaryCard.className='card';
  summaryCard.innerHTML=`<h2 class="section-title">Summary</h2><div id="ifSummaryBody"></div>`;
  root.appendChild(summaryCard);

  const tableCard=document.createElement('div'); tableCard.className='card';
  tableCard.innerHTML=`<h2 class="section-title">Year-by-Year Breakdown</h2><div id="ifTable" style="max-height:400px;overflow-y:auto"></div>`;
  root.appendChild(tableCard);

  setTimeout(runInvestForecast,0);
}

const RETURN_PRESETS={conservative:5,moderate:8,aggressive:11};

function setReturnPreset(preset) {
  investForecastInputs.returnPreset=preset;
  if (preset!=='custom') investForecastInputs.annualReturn=RETURN_PRESETS[preset];
  renderActive();
}

function runInvestForecast() {
  const chart=$('#ifChart');
  if (!chart) return;
  const f=investForecastInputs;
  const rate=f.annualReturn/100/12;
  const inflRate=f.inflation/100/12;
  const totalMonths=f.horizon*12;

  const nominal=[], real=[], contributions=[], years=[];
  let val=f.startingAmount, contribTotal=f.startingAmount;

  for (let m=1;m<=totalMonths;m++) {
    val=val*(1+rate)+f.monthlyContrib;
    contribTotal+=f.monthlyContrib;
    if (m%12===0) {
      const yr=m/12;
      const realVal=val/Math.pow(1+f.inflation/100,yr);
      years.push(yr);
      nominal.push(Math.round(val));
      real.push(Math.round(realVal));
      contributions.push(Math.round(contribTotal));
    }
  }

  if (window._ifChart) window._ifChart.destroy();
  window._ifChart=new Chart(chart,{
    type:'line',
    data:{
      labels:years.map(y=>`Year ${y}`),
      datasets:[
        {label:'Portfolio Value',data:nominal,borderColor:'#00C49A',backgroundColor:'rgba(0,196,154,.1)',fill:true,tension:.3,borderWidth:2,pointRadius:2},
        {label:'Real Value (inflation-adj)',data:real,borderColor:'#3B82F6',backgroundColor:'rgba(59,130,246,.05)',fill:false,tension:.3,borderWidth:2,borderDash:[5,5],pointRadius:0},
        {label:'Total Contributed',data:contributions,borderColor:'#94A3B8',backgroundColor:'rgba(148,163,184,.08)',fill:true,tension:.3,borderWidth:1.5,pointRadius:0},
      ]
    },
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}}},
      scales:{y:{ticks:{callback:v=>{ if(v>=1e6) return '$'+(v/1e6).toFixed(1)+'M'; if(v>=1e3) return '$'+(v/1e3).toFixed(0)+'K'; return '$'+v; }}}}
    }
  });

  const finalNominal=nominal[nominal.length-1]||0;
  const finalReal=real[real.length-1]||0;
  const totalContrib=contributions[contributions.length-1]||0;
  const gains=finalNominal-totalContrib;
  const gainsMultiplier=totalContrib>0?(finalNominal/totalContrib).toFixed(2):0;

  const summaryBody=$('#ifSummaryBody');
  if (summaryBody) {
    summaryBody.innerHTML=`
      <div class="grid grid-4" style="margin-top:8px">
        <div class="card"><h3>Final Value (Nominal)</h3><div class="big num amt-pos">${fmt(finalNominal)}</div></div>
        <div class="card"><h3>Final Value (Real)</h3><div class="big num">${fmt(finalReal)}</div><div class="footnote">Inflation-adjusted</div></div>
        <div class="card"><h3>Total Contributed</h3><div class="big num">${fmt(totalContrib)}</div></div>
        <div class="card"><h3>Investment Gains</h3><div class="big num amt-pos">${fmt(gains)}</div><div class="footnote">${gainsMultiplier}× money multiplier</div></div>
      </div>
      <div class="insight" style="margin-top:10px">
        Contributing <strong>${fmt(f.monthlyContrib)}/month</strong> at <strong>${f.annualReturn}% annual return</strong> for <strong>${f.horizon} years</strong> turns ${fmt(f.startingAmount+totalContrib)} in contributions into <strong>${fmt(finalNominal)}</strong> — a <strong>${fmt(gains)} gain</strong>.
      </div>`;
  }

  const tableDiv=$('#ifTable');
  if (tableDiv) {
    const rows=years.map((yr,i)=>{
      const gain=nominal[i]-contributions[i];
      return `<tr>
        <td>Year ${yr}</td>
        <td class="num">${fmt(contributions[i])}</td>
        <td class="num amt-pos">${fmt(nominal[i])}</td>
        <td class="num">${fmt(real[i])}</td>
        <td class="num ${gain>=0?'amt-pos':'amt-neg'}">${fmt(gain)}</td>
      </tr>`;
    });
    tableDiv.innerHTML=`<table class="tbl"><thead><tr><th>Period</th><th>Total Contributed</th><th>Portfolio Value</th><th>Real Value</th><th>Gains</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
}
