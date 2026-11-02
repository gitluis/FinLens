/* ================================================================
   FINLENS — views-invest.js
   Investing ideas (Clarity, v1.15.0): a portfolio mix you sketch from
   reference lists, saved in State.investAlloc. Also the Forecast →
   Investments tab (_renderForecastInvest), drawn by views-forecast.js.
   Reference lists for learning, not financial advice.
================================================================ */

/* =================== INVESTING IDEAS =================== */
// type: s = stocks, b = bonds, r = real estate. preset: the balanced preset's share (%).
const INVEST_FUNDS=[
  {ticker:'VTI',  name:'US total stock market',                cls:'US stocks',            type:'s', risk:'Higher', preset:40, hue:'accent'},
  {ticker:'VXUS', name:'Stocks outside the US',                cls:'International stocks', type:'s', risk:'Higher', preset:20, hue:'teal'},
  {ticker:'BND',  name:'US investment-grade bonds',            cls:'Bonds',                type:'b', risk:'Lower',  preset:20, hue:'warn'},
  {ticker:'SCHD', name:'US dividend-paying companies',         cls:'US stocks',            type:'s', risk:'Medium', preset:10, hue:'pink'},
  {ticker:'VNQ',  name:'US real estate (REITs)',               cls:'Real estate',          type:'r', risk:'Higher', preset:5,  hue:'sky'},
  {ticker:'VTIP', name:'Short-term inflation-protected bonds', cls:'Bonds',                type:'b', risk:'Lower',  preset:5,  hue:'good'},
  {ticker:'VOO',  name:'S&P 500 companies',                    cls:'US stocks',            type:'s', risk:'Higher', preset:0,  hue:'violet'},
  {ticker:'QQQ',  name:'Nasdaq-100 companies',                 cls:'US stocks',            type:'s', risk:'Higher', preset:0,  hue:'card'},
  {ticker:'AVUV', name:'US small-cap value companies',         cls:'US stocks',            type:'s', risk:'Higher', preset:0,  hue:'neutral'},
];
const INVEST_STOCKS=[
  {ticker:'AAPL',  name:'Apple',              sector:'Technology'},
  {ticker:'MSFT',  name:'Microsoft',          sector:'Technology'},
  {ticker:'BRK.B', name:'Berkshire Hathaway', sector:'Financials'},
  {ticker:'JNJ',   name:'Johnson & Johnson',  sector:'Health care'},
  {ticker:'PG',    name:'Procter & Gamble',   sector:'Consumer staples'},
  {ticker:'COST',  name:'Costco',             sector:'Consumer staples'},
];
const RISK_PILL={Lower:'good',Medium:'warn',Higher:'bad'};
const pctNum=(n)=>String(Math.round(n*10)/10);

// The mix from State.investAlloc: the funds above, then any other ticker with a share
// (stocks given a % before v1.15.0, when that list had inputs too), counted as stocks.
function investMix() {
  const a=State.investAlloc||{};
  const val=(t)=>Math.max(0,Number(a[t])||0);
  const known=new Set(INVEST_FUNDS.map(f=>f.ticker));
  const rows=INVEST_FUNDS.filter(f=>val(f.ticker)>0).map(f=>({ ticker:f.ticker, pct:val(f.ticker), hue:f.hue, type:f.type }))
    .concat(Object.keys(a).filter(t=>!known.has(t)&&val(t)>0).map(t=>({ ticker:t, pct:val(t), hue:'neutral', type:'s' })));
  const total=rows.reduce((s,r)=>s+r.pct,0);
  const sum=(k)=>rows.filter(r=>r.type===k).reduce((s,r)=>s+r.pct,0);
  return { rows, total, stocks:sum('s'), bonds:sum('b'), reits:sum('r') };
}
function investMixHtml() {
  const m=investMix(), ok=Math.abs(m.total-100)<0.001;
  const aria=m.rows.length?m.rows.map(r=>`${r.ticker} ${pctNum(r.pct)}%`).join(', '):'Nothing assigned yet';
  return `<div class="panel-head center"><h2 id="mixH">My mix</h2><span class="pill ${ok?'good':'warn'}" id="ivTotal">${ok?'100% assigned':`${pctNum(m.total)}% of 100%`}</span></div>
    <div class="stack lg" role="img" aria-label="${escapeHtml(aria)}">${m.rows.map(r=>`<span class="hue-${r.hue}" style="width:${(r.pct/Math.max(m.total,100)*100).toFixed(2)}%"></span>`).join('')}</div>
    ${m.rows.length?`<div class="mix-list">${m.rows.map(r=>`<div><i class="sw hue-${r.hue}"></i><span class="t">${escapeHtml(r.ticker)}</span><span class="v">${pctNum(r.pct)}%</span></div>`).join('')}</div>`
      :'<p class="empty-note">Nothing assigned yet. Type a % next to a fund, or use the balanced preset.</p>'}
    <div class="split3"><div><b>${pctNum(m.stocks)}%</b><span>Stocks</span></div><div><b>${pctNum(m.bonds)}%</b><span>Bonds</span></div><div><b>${pctNum(m.reits)}%</b><span>Real estate</span></div></div>
    <a class="more-link end" href="#forecast" data-to-forecast>Project this mix in Forecast →</a>`;
}

registerView('investments','Investing ideas',(root)=>{
  pageActions(root,'Sketch a portfolio mix and save it with your other plans',
    `<button type="button" class="btn ghost lg" id="ivClear">Clear my %</button><button type="button" class="btn lg" id="ivPreset">Use the balanced preset</button>`);
  appendHtml(root,`<p class="callout plain" role="note">These are reference lists for learning, not financial advice. FinLens doesn't connect to a brokerage or place trades. Check current fund details with the provider before you invest.</p>`);
  const a=State.investAlloc||{};
  appendHtml(root,`<div class="cols-3">
    <section class="panel" aria-labelledby="mixH" id="ivMix">${investMixHtml()}</section>
    <section class="panel span-2" aria-labelledby="etfH">
      <div><h2 id="etfH">Index funds and ETFs</h2><p class="sub">Type your own percentages. They're saved with your plans.</p></div>
      <div class="table-scroll"><table class="tbl flush fund-tbl mw-640 fit-sm">
        <thead><tr><th scope="col">Ticker</th><th scope="col">What it holds</th><th scope="col" class="hide-sm">Risk</th><th scope="col" class="r hide-sm">Preset</th><th scope="col" class="r">My %</th></tr></thead>
        <tbody>${INVEST_FUNDS.map(f=>`<tr>
          <td class="strong">${f.ticker}</td>
          <td><span style="font-weight:500">${f.name}</span><span class="s2">${f.cls}</span>
            <div class="sm-line"><span class="pill ${RISK_PILL[f.risk]}">${f.risk} risk</span><span>Preset ${f.preset?f.preset+'%':'—'}</span></div></td>
          <td class="hide-sm"><span class="pill ${RISK_PILL[f.risk]}">${f.risk}</span></td>
          <td class="r dim hide-sm">${f.preset?f.preset+'%':'—'}</td>
          <td class="r"><label class="pct-field"><span class="sr-only">My percent for ${f.ticker}</span><input class="alloc-input" type="number" min="0" max="100" step="5" inputmode="decimal" data-ticker="${f.ticker}" value="${pctNum(Math.max(0,Number(a[f.ticker])||0))}"><span aria-hidden="true">%</span></label></td>
        </tr>`).join('')}</tbody></table></div>
    </section></div>`);
  appendHtml(root,`<section class="panel" aria-labelledby="stkH">
    <div><h2 id="stkH">Individual stocks to read about</h2><p class="sub">Large, widely held companies across sectors. A starting point for research, not picks.</p></div>
    <div class="ref-cards">${INVEST_STOCKS.map(s=>`<div class="ref-card"><span class="tk">${s.ticker}</span><span style="flex:1;min-width:0"><span class="nm">${escapeHtml(s.name)}</span><span class="sec">${s.sector}</span></span></div>`).join('')}</div>
  </section>`);

  const mix=$('#ivMix');
  const toForecast=(e)=>{ const l=e.target.closest('[data-to-forecast]'); if (!l) return; e.preventDefault(); forecastTab='investments'; showView('forecast'); window.scrollTo(0,0); };
  mix.addEventListener('click',toForecast);
  $$('.alloc-input',root).forEach(inp=>{
    inp.addEventListener('input',()=>{ setInvestAlloc(inp.dataset.ticker,inp.value,false); mix.innerHTML=investMixHtml(); });
    inp.addEventListener('change',()=>{ setInvestAlloc(inp.dataset.ticker,inp.value,true); });
  });
  $('#ivClear').onclick=()=>{ State.investAlloc={}; lsSet('investAlloc',State.investAlloc); renderActive(); $('#ivClear').focus(); };
  $('#ivPreset').onclick=()=>{
    State.investAlloc=Object.fromEntries(INVEST_FUNDS.filter(f=>f.preset>0).map(f=>[f.ticker,f.preset]));
    lsSet('investAlloc',State.investAlloc); renderActive(); $('#ivPreset').focus();
  };
});

// A fund's share: 0–100, saved when `save` (on change; typing only updates the mix).
function setInvestAlloc(ticker, raw, save) {
  const v=Math.min(100,Math.max(0,parseFloat(raw)||0));
  State.investAlloc=State.investAlloc||{};
  if (v>0) State.investAlloc[ticker]=v; else delete State.investAlloc[ticker];
  if (save) lsSet('investAlloc',State.investAlloc);
}
// Kept for callers before v1.15.0: save the value of a "My %" input.
function saveInvestAlloc(input) { setInvestAlloc(input.dataset.ticker,input.value,true); }

/* =================== FORECAST → INVESTMENTS (views-forecast.js draws the tabs) =================== */
// Inputs live in memory: they start from these defaults on every page load.
let investForecastInputs=null;
const RETURN_PRESETS={conservative:5,moderate:8,aggressive:11};
const RETURN_PRESET_LIST=[['conservative','Conservative'],['moderate','Moderate'],['aggressive','Aggressive'],['custom','Custom']];
function getInvestForecastDefaults() {
  const recent3=byMonth(State.transactions).slice(-3);
  const avgSurplus=recent3.length?Math.max(0,recent3.reduce((s,m)=>s+(m.income-m.expense),0)/recent3.length):500;
  return { start:1000, monthly:Math.round(avgSurplus*0.5), years:20, preset:'moderate', custom:7, inflOn:true, infl:2.5 };
}
const investRate=(f)=>f.preset==='custom'?(Number(f.custom)||0):RETURN_PRESETS[f.preset]??8;

function _renderForecastInvest(panel) {
  if (!investForecastInputs) investForecastInputs=getInvestForecastDefaults();
  const f=investForecastInputs;
  panel.insertAdjacentHTML('beforeend',`<div class="cols-3">
    <section class="panel" aria-labelledby="iInH">
      <h2 id="iInH">Your numbers</h2>
      <div class="fc-form">
        <label class="field">Starting amount ($)<input class="input" type="number" step="100" inputmode="decimal" data-if="start" value="${escapeHtml(String(f.start))}"></label>
        <label class="field">Added each month ($)<input class="input" type="number" step="50" inputmode="decimal" data-if="monthly" value="${escapeHtml(String(f.monthly))}"></label>
        <label class="slider sm"><span class="top"><span>Years</span><b id="ifYearsVal">${f.years}</b></span><input type="range" min="1" max="40" data-if="years" value="${f.years}" aria-label="Years"></label>
        <fieldset class="preset-set"><legend>Yearly return</legend>
          <div class="preset-grid">${RETURN_PRESET_LIST.map(([k,n])=>`<button type="button" class="preset" data-preset="${k}" aria-pressed="${f.preset===k}"><b>${n}</b><span>${k==='custom'?'Your rate':RETURN_PRESETS[k]+'%'}</span></button>`).join('')}</div>
          ${f.preset==='custom'?`<label class="field">Custom return (%)<input class="input" type="number" step="0.5" inputmode="decimal" data-if="custom" value="${escapeHtml(String(f.custom))}"></label>`:''}
        </fieldset>
        <label class="toggle-row">Show in today's dollars<input type="checkbox" id="ifInflOn" ${f.inflOn?'checked':''}></label>
        <label class="field">Inflation (%)<input class="input" type="number" step="0.5" inputmode="decimal" data-if="infl" value="${escapeHtml(String(f.infl))}"></label>
      </div>
    </section>
    <div class="span-2 fc-out">
      <section class="panel" aria-labelledby="iOutH" id="ifOut"></section>
      <section class="panel" aria-labelledby="iTblH" id="ifTbl"></section>
    </div></div>`);
  const draw=()=>{ const o=investForecastHtml(f); $('#ifOut').innerHTML=o.out; $('#ifTbl').innerHTML=o.table; };
  draw();
  $$('[data-if]',panel).forEach(inp=>inp.addEventListener('input',()=>{
    const k=inp.dataset.if, v=parseFloat(inp.value);
    f[k]=k==='years'?Math.min(40,Math.max(1,Math.round(v)||1)):(isFinite(v)?v:0);
    if (k==='years') $('#ifYearsVal').textContent=f.years;
    draw();
  }));
  $('#ifInflOn').addEventListener('change',e=>{ f.inflOn=e.target.checked; draw(); });
  $$('[data-preset]',panel).forEach(b=>b.onclick=()=>{
    f.preset=b.dataset.preset; renderActive();
    const n=$(`[data-preset="${f.preset}"]`); if (n) n.focus();
  });
}

// Year by year at the chosen yearly return (growthByYear() in aggregation.js). Today's
// dollars divide each year's value by (1 + inflation) for every year that has passed.
function investForecastHtml(f) {
  const rate=investRate(f), infl=(Number(f.infl)||0)/100;
  const rows=growthByYear(f.start,f.monthly,rate,f.years).map(r=>({ ...r, real:r.balance/Math.pow(1+infl,r.year) }));
  const last=rows[rows.length-1];
  const max=Math.max(1,...rows.map(r=>Math.max(r.balance,r.real)));
  const h=(v)=>(Math.max(0,v)/max*100).toFixed(1);
  const rl=pctNum(rate)+'%';
  const out=`<h2 id="iOutH">In ${plural(f.years,'year')}, at ${rl} a year</h2>
    <div class="big-stats"><div><span class="l">Projected value</span><span class="v">${fmt0(last.balance)}</span></div>
      <div><span class="l">In today's dollars</span><span class="v c-teal">${fmt0(last.real)}</span></div>
      <div><span class="l">You put in</span><span class="v">${fmt0(last.putIn)}</span></div></div>
    <div class="legend"><span><i class="sw hue-accent"></i>Projected value</span>${f.inflOn?'<span><i class="sw hue-teal"></i>In today\'s dollars</span>':''}</div>
    <div class="ybars${f.inflOn?'':' nominal'}" role="img" aria-label="${escapeHtml(`Investment grows to ${fmt0(last.balance)}, or ${fmt0(last.real)} in today's dollars, in ${plural(f.years,'year')}`)}">${rows.map(r=>`<span class="yb ov" title="Year ${r.year}: ${fmt0(r.balance)}${f.inflOn?` (${fmt0(r.real)} in today's dollars)`:''}"><i class="n" style="height:${h(r.balance)}%"></i>${f.inflOn?`<i class="r" style="height:${h(r.real)}%"></i>`:''}</span>`).join('')}</div>
    <div class="axis-ends"><span>Year 1</span><span>Year ${f.years}</span></div>
    <p class="trend-note">Returns are assumptions, not promises. Growth compounds monthly: ${rl} a year is ${(monthlyRateFromYearly(rate)*100).toFixed(3)}% a month. Additions land at the end of each month. Today's dollars take off ${pctNum(infl*100)}% inflation a year.</p>`;
  const table=`<h2 id="iTblH">Year by year</h2>
    <div class="scroll-y"><table class="tbl flush sticky compact-sm">
      <thead><tr><th scope="col">Year</th><th scope="col" class="r">Put in</th><th scope="col" class="r">Value</th><th scope="col" class="r">Today's dollars</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td class="dim">${r.year}</td><td class="r">${fmt0(r.putIn)}</td><td class="r strong">${fmt0(r.balance)}</td><td class="r">${fmt0(r.real)}</td></tr>`).join('')}</tbody></table></div>`;
  return { out, table };
}
