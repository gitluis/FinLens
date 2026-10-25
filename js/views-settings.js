/* ================================================================
   FINLENS — views-settings.js
   Settings shell (tab bar) + General tab: Display, Anthropic API Key.
   Clearing data and starting over live in the Data & Reset tab (views-cleanup.js).
================================================================ */

let settingsTab='general';

const SETTINGS_TABS=[
  ['general',   '⚙️ General'],
  ['import',    '📥 Import'],
  ['accounts',  '🏦 Accounts'],
  ['credit-cards','💳 Credit Cards'],
  ['categories','🏷️ Categories'],
  ['data-cleanup','🧹 Data & Reset'],
];

registerView('settings','Settings',(root)=>{
  const tabBar=document.createElement('div');
  tabBar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px';
  tabBar.innerHTML=SETTINGS_TABS.map(([k,l])=>
    `<button class="btn${settingsTab===k?'':' ghost'} sm" data-tab="${k}" style="border-radius:20px">${l}</button>`
  ).join('');
  root.appendChild(tabBar);
  tabBar.querySelectorAll('[data-tab]').forEach(btn=>btn.onclick=()=>{settingsTab=btn.dataset.tab;renderActive();});

  if (settingsTab==='general') _renderGeneralSettings(root);
  else VIEWS[settingsTab].render(root);
});

function _renderGeneralSettings(root) {
  /* ---- Display ---- */
  const displayCard=document.createElement('div'); displayCard.className='card';
  displayCard.innerHTML=`
    <h2 class="section-title">Display</h2>
    <div class="grid grid-2" style="margin-top:12px;max-width:500px">
      <div>
        <label class="lbl">Theme</label>
        <select class="select" onchange="State.theme=this.value;applyTheme();lsSet('theme',this.value)">
          <option value="light" ${State.theme!=='dark'?'selected':''}>Light</option>
          <option value="dark" ${State.theme==='dark'?'selected':''}>Dark</option>
        </select>
      </div>
      <div>
        <label class="lbl">Currency</label>
        <select class="select" id="currencySelect" onchange="saveCurrency(this.value)">
          <option value="USD" ${(lsGet('currency','USD')==='USD')?'selected':''}>USD ($)</option>
          <option value="EUR" ${(lsGet('currency','USD')==='EUR')?'selected':''}>EUR (€)</option>
        </select>
      </div>
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:14px">FinLens v1.9.5 ·${State.transactions.length} transactions loaded${State.lastRefresh?' · Refreshed '+dayjs(State.lastRefresh).format('MMM D, YYYY h:mm A'):''}</div>`;
  root.appendChild(displayCard);

  /* ---- Anthropic API Key ---- */
  // The key value is never rendered back into the DOM; only whether one is saved.
  const keyCard=document.createElement('div'); keyCard.className='card';
  keyCard.innerHTML=`
    <h2 class="section-title">Anthropic API Key</h2>
    <p class="muted" style="margin-top:6px;font-size:12px">Powers the AI Analysis tab. Stored only in this browser (localStorage + IndexedDB) — never written to <code>finlens-state.json</code>. Get a key at <strong>console.anthropic.com</strong>.</p>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;max-width:620px">
      <input class="input" type="password" id="apiKeyInput" autocomplete="off" spellcheck="false" placeholder="${State.apiKey?'Key saved — paste a new one to replace it':'sk-ant-…'}" style="flex:1;min-width:240px">
      <button class="btn sm" id="apiKeySave">Save key</button>
      ${State.apiKey?'<button class="btn danger sm" id="apiKeyRemove">Remove</button>':''}
    </div>
    <div style="margin-top:10px">${State.apiKey?'<span class="pill good">Key saved in this browser</span>':'<span class="pill warn">No key saved</span>'}</div>`;
  root.appendChild(keyCard);
  $('#apiKeySave').addEventListener('click',saveApiKey);
  $('#apiKeyInput').addEventListener('keydown',e=>{ if (e.key==='Enter') saveApiKey(); });
  if ($('#apiKeyRemove')) $('#apiKeyRemove').addEventListener('click',()=>{ if (confirm('Remove the saved API key from this browser?')) removeApiKey(); });

  /* ---- Pointer to Data & Reset (the old Danger Zone moved there in v1.9.0) ---- */
  const dataCard=document.createElement('div'); dataCard.className='card';
  dataCard.innerHTML=`
    <h2 class="section-title">Clear data or start over</h2>
    <p class="muted" style="margin-top:6px;font-size:12px">Clean up imported transactions, the database and import log, clear budgets or bills, or erase everything and start from scratch.</p>
    <button class="btn ghost sm" id="openDataReset" style="margin-top:10px">🧹 Open Data &amp; Reset</button>`;
  root.appendChild(dataCard);
  $('#openDataReset').addEventListener('click',()=>{ settingsTab='data-cleanup'; renderActive(); });
}

/* ---- API key (browser storage only — saveStateToFile() excludes it) ---- */
function saveApiKey() {
  const v=($('#apiKeyInput')?.value||'').trim();
  if (!v) { alert('Paste your Anthropic API key first.'); return; }
  State.apiKey=v;
  lsSet('apiKey',v);
  renderActive();
}
function removeApiKey() {
  State.apiKey='';
  lsSet('apiKey','');
  renderActive();
}

function saveCurrency(val) {
  lsSet('currency',val);
  // TODO: future — convert currency symbol in formatters
}

/* Transfer keyword helpers (renderKwChipsTransfers, addTransferKeywordTransfers,
   deleteTransferKeywordFromTransfers, reapplyTransferKeywords) live in views-main.js
   alongside the Transfers tab that owns the keyword editor. */
