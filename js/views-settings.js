/* ================================================================
   FINLENS — views-settings.js
   Settings tab — Display, Import, Accounts, Categories, Danger Zone
================================================================ */

let settingsTab='general';

const SETTINGS_TABS=[
  ['general',   '⚙️ General'],
  ['import',    '📥 Import'],
  ['accounts',  '🏦 Accounts'],
  ['credit-cards','💳 Credit Cards'],
  ['categories','🏷️ Categories'],
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
    <div class="muted" style="font-size:11.5px;margin-top:14px">FinLens v1.7.0 ·${State.transactions.length} transactions loaded${State.lastRefresh?' · Refreshed '+dayjs(State.lastRefresh).format('MMM D, YYYY h:mm A'):''}</div>`;
  root.appendChild(displayCard);

  /* ---- Danger Zone ---- */
  const dangerCard=document.createElement('div'); dangerCard.className='card';
  dangerCard.innerHTML=`
    <h2 class="section-title">Danger Zone</h2>
    <p class="muted" style="margin-top:6px;font-size:12px">Permanently erase data from this browser. This cannot be undone.</p>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Transactions</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${State.transactions.length.toLocaleString()} transactions</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all transactions? This cannot be undone.')){clearDataset('transactions')}">Clear</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Budgets</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${State.budgets.length} budget${State.budgets.length!==1?'s':''}</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all budgets?')){clearDataset('budgets')}">Clear</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Bills</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${State.bills.length} bill${State.bills.length!==1?'s':''}</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all bills?')){clearDataset('bills')}">Clear</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Savings Buckets</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${State.buckets.length} bucket${State.buckets.length!==1?'s':''}</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all savings buckets?')){clearDataset('buckets')}">Clear</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Debts</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${State.debts.length} debt${State.debts.length!==1?'s':''}</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all debts?')){clearDataset('debts')}">Clear</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div>
          <div style="font-size:13px;font-weight:500">Transaction Edits</div>
          <div class="muted" style="font-size:11.5px;margin-top:2px">${Object.keys(State.txOverrides).length} override${Object.keys(State.txOverrides).length!==1?'s':''}</div>
        </div>
        <button class="btn danger sm" onclick="if(confirm('Clear all transaction edits/overrides?')){clearDataset('txOverrides')}">Clear</button>
      </div>
      <div style="margin-top:6px;padding-top:14px;border-top:1px solid var(--border)">
        <button class="btn danger" onclick="if(confirm('Erase ALL FinLens data? This cannot be undone.')){clearAllData()}">🗑️ Clear All Data</button>
      </div>
    </div>`;
  root.appendChild(dangerCard);
}

function saveCurrency(val) {
  lsSet('currency',val);
  // TODO: future — convert currency symbol in formatters
}

/* ---- Clear an individual dataset ---- */
function clearDataset(key) {
  const defaults = {
    transactions: [],
    budgets:      [],
    bills:        [],
    buckets:      [],
    debts:        [],
    txOverrides:  {},
  };
  if (!(key in defaults)) return;
  State[key] = defaults[key];
  lsSet(key, defaults[key]);
  // Also wipe from IndexedDB if available
  if (typeof DB !== 'undefined' && DB._db) {
    if (key === 'transactions') {
      // Clear transactions store in IndexedDB
      DB._db.transaction('transactions','readwrite').objectStore('transactions').clear();
      State.accounts = {};
      lsSet('accounts', {});
      State.fileMeta = [];
      lsSet('fileMeta', []);
      State.accountOrder = [];
      lsSet('accountOrder', []);
    } else {
      DB.setState(key, defaults[key]);
    }
  }
  renderActive();
}

/* Transfer keyword helpers (renderKwChipsTransfers, addTransferKeywordTransfers,
   deleteTransferKeywordFromTransfers, reapplyTransferKeywords) live in views-main.js
   alongside the Transfers tab that owns the keyword editor. */
