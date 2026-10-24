/* ================================================================
   FINLENS — db.js
   IndexedDB API layer — all database access.
   Loaded immediately after core.js.
   Database: finlens_db  Version: 1
================================================================ */

/* ---------- reconstituteTx: rebuild in-memory tx from a DB record ---------- */
// Mirrors mkTx() but operates on already-stored plain objects (no schema needed).
function reconstituteTx(raw, ov) {
  ov = ov || {};
  const cats = (ov.categories && ov.categories.length)
    ? ov.categories
    : (raw.categories && raw.categories.length ? raw.categories : ['Other']);
  const src = raw._originalDesc || raw.description || '';
  return {
    id: raw.id,
    date: raw.date instanceof Date ? raw.date : new Date(raw.date),
    description: ov.description || raw.description || '',
    amount: raw.amount,
    categories: cats,
    get category() { return this.categories[0] || 'Other'; },
    account: ov.accountOverride || raw.account,
    type: ov.type || raw.type,
    isRecurring: 'isRecurring' in ov ? !!ov.isRecurring : !!raw.isRecurring,
    isBill:      'isBill'      in ov ? !!ov.isBill      : !!raw.isBill,
    isSubscription: 'isSubscription' in ov ? !!ov.isSubscription : !!raw.isSubscription,
    notes: ov.notes || '',
    balance: null,
    _originalDesc: src,
  };
}

/* ---------- DB object ---------- */
const DB = {
  _db: null,
  DB_NAME: 'finlens_db',
  DB_VERSION: 1,

  /* ── Internal helpers ────────────────────────────────────────── */
  _req(req) {
    return new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror  = () => rej(req.error);
    });
  },

  _getStore(name, mode = 'readonly') {
    return this._db.transaction(name, mode).objectStore(name);
  },

  /* ── Lifecycle ───────────────────────────────────────────────── */
  open() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      req.onerror = () => {
        console.error('DB.open failed:', req.error);
        rej(req.error);
      };

      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._db.onerror = (ev) => console.error('DB error:', ev.target.error);
        // Another tab is deleting or upgrading the database (e.g. "Start over"):
        // let go so it isn't blocked. This tab then keeps working from memory.
        this._db.onversionchange = () => { this._db.close(); this._db = null; };
        res();
      };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        const oldVersion = e.oldVersion; // 0 = fresh install

        // ── transactions store (immutable source records) ──
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('date',      'date',      { unique: false });
          txStore.createIndex('yearMonth', 'yearMonth', { unique: false });
          txStore.createIndex('account',   'account',   { unique: false });
          txStore.createIndex('type',      'type',      { unique: false });
          txStore.createIndex('schemaId',  'schemaId',  { unique: false });
        }

        // ── tx_overrides store (user edits — keyed by txId) ──
        if (!db.objectStoreNames.contains('tx_overrides')) {
          db.createObjectStore('tx_overrides', { keyPath: 'txId' });
        }

        // ── accounts store ──
        if (!db.objectStoreNames.contains('accounts')) {
          db.createObjectStore('accounts', { keyPath: 'id' });
        }

        // ── import_log store ──
        if (!db.objectStoreNames.contains('import_log')) {
          db.createObjectStore('import_log', { keyPath: 'id', autoIncrement: true });
        }

        // ── app_state store (key-value, replaces localStorage) ──
        if (!db.objectStoreNames.contains('app_state')) {
          db.createObjectStore('app_state', { keyPath: 'key' });
        }

        // On fresh install (version 0 → 1): migrate localStorage into app_state
        if (oldVersion === 0) {
          const appStateStore = e.target.transaction.objectStore('app_state');
          DB._migrateSync(appStateStore);
        }
      };
    });
  },

  /* Called inside onupgradeneeded — must be sync (uses the upgrade transaction) */
  _migrateSync(appStateStore) {
    const LS_KEYS = [
      'budgets','buckets','debts','bills','recurring','txOverrides','manualBalances',
      'catRules','categories','apiKey','aiHistory','scenarios','investAlloc',
      'fileAssignments','lastFolderName','theme','accountOrder','accountLabels',
      'txRules','transferKeywords','customSchemas',
    ];
    for (const k of LS_KEYS) {
      try {
        const raw = localStorage.getItem('finlens_' + k);
        if (raw !== null) {
          appStateStore.put({ key: k, value: JSON.parse(raw) });
        }
      } catch(e) { /* ignore malformed values */ }
    }
    console.log('DB: migrated localStorage → app_state');
  },

  /* ── App State (key-value, replaces lsSet/lsGet for persistence) ─ */
  setState(key, value) {
    if (!this._db) return Promise.resolve();
    return this._req(
      this._getStore('app_state', 'readwrite').put({ key, value })
    ).catch(e => console.warn('DB.setState failed:', key, e));
  },

  getState(key, def) {
    if (!this._db) return Promise.resolve(def);
    return this._req(
      this._getStore('app_state').get(key)
    ).then(rec => (rec !== undefined && rec !== null) ? rec.value : def)
     .catch(() => def);
  },

  /* ── Transactions ────────────────────────────────────────────── */

  /**
   * Batch-insert transactions. IDs arrive final from parseCsvFile() — including the
   * _2, _3 … suffixes for truly identical rows, counted within the file — so any ID
   * already in the store is a re-imported row and is skipped. Never assign suffixes
   * here: doing so on collision (≤v1.8.0) re-inserted every row of a re-uploaded
   * Chase file as an "_2" copy.
   *
   * Also removes leftover copies from that bug: a suffixed row whose base transaction
   * is in this file but whose exact ID is not (e.g. base_2 when the file has only one
   * such row). Same-day identical rows always appear together in a bank export, so the
   * file is authoritative for how many copies of each of its transactions exist.
   *
   * Returns { inserted, skipped, removed, dateRangeMin, dateRangeMax, gapWarning }.
   */
  async importTransactions(txArray, accountId, schemaId) {
    if (!this._db || !txArray.length) {
      return { inserted: 0, skipped: 0, removed: 0, dateRangeMin: null, dateRangeMax: null, gapWarning: null };
    }

    // Sort chronologically for insertion
    const sorted = [...txArray].sort((a, b) => {
      const da = a.date instanceof Date ? a.date : new Date(a.date);
      const db = b.date instanceof Date ? b.date : new Date(b.date);
      const dateCmp = da - db;
      if (dateCmp !== 0) return dateCmp;
      const descCmp = (a._originalDesc || a.description || '')
        .localeCompare(b._originalDesc || b.description || '');
      if (descCmp !== 0) return descCmp;
      return a.amount - b.amount;
    });

    // Compute file date range
    const dates = sorted.map(t => (t.date instanceof Date ? t.date : new Date(t.date)).getTime());
    const fileMinDate = new Date(Math.min(...dates));
    const fileMaxDate = new Date(Math.max(...dates));

    // Gap detection: compare against existing account coverage
    let gapWarning = null;
    try {
      const existingAcct = await this._req(this._getStore('accounts').get(accountId));
      if (existingAcct && existingAcct.dataRangeMax) {
        const existingMax = new Date(existingAcct.dataRangeMax);
        const GAP_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
        if (fileMinDate.getTime() - existingMax.getTime() > GAP_THRESHOLD_MS) {
          gapWarning = {
            from: new Date(existingMax.getTime() + 86400000),  // day after existing max
            to:   new Date(fileMinDate.getTime() - 86400000),  // day before file min
          };
        }
      }
    } catch(e) { /* account might not exist yet — first upload */ }

    // IDs already stored (keys only — one read). Checking up front avoids relying on
    // ConstraintError, which also logs a console error for every re-imported row.
    let existingIds = new Set();
    try {
      existingIds = new Set(await this._req(this._getStore('transactions').getAllKeys()));
    } catch(e) { console.warn('DB.importTransactions: could not read existing IDs:', e); }

    // Batch insert
    let inserted = 0, skipped = 0, removed = 0;

    for (const tx of sorted) {
      if (existingIds.has(tx.id)) { skipped++; continue; }
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const storable = {
        id:             tx.id,
        date:           d,
        yearMonth:      (typeof monthKey === 'function') ? monthKey(d) : d.toISOString().slice(0,7),
        account:        tx.account,
        type:           tx.type,
        schemaId,
        description:    tx._originalDesc || tx.description || '',
        amount:         tx.amount,
        categories:     Array.isArray(tx.categories) ? tx.categories : [tx.category || 'Other'],
        isRecurring:    !!tx.isRecurring,
        isBill:         !!tx.isBill,
        isSubscription: !!tx.isSubscription,
        _originalDesc:  tx._originalDesc || tx.description || '',
      };

      // Use a fresh transaction for each row to avoid transaction timeout
      try {
        const txnStore = this._db.transaction('transactions', 'readwrite').objectStore('transactions');
        await this._req(txnStore.add(storable));
        inserted++;
      } catch (err) {
        // Already stored (e.g. read raced with another import): it's a duplicate.
        if (err && err.name === 'ConstraintError') skipped++;
        // Other errors: silently skip
      }
    }

    // Remove leftover copies created by the ≤v1.8.0 collision-suffix bug (see above).
    const baseOf = (id) => id.replace(/_\d+$/, '');
    const batchIds = new Set(sorted.map(t => t.id));
    const batchBases = new Set(sorted.map(t => baseOf(t.id)));
    const stale = [...existingIds].filter(id =>
      id !== baseOf(id) && !batchIds.has(id) && batchBases.has(baseOf(id)));
    if (stale.length) {
      removed = await new Promise((res) => {
        const t = this._db.transaction('transactions', 'readwrite');
        const store = t.objectStore('transactions');
        stale.forEach(id => store.delete(id));
        t.oncomplete = () => res(stale.length);
        t.onerror = t.onabort = () => res(0);
      });
    }

    // Update account coverage metadata
    await this._updateAccountCoverage(accountId, fileMinDate, fileMaxDate, inserted - removed);

    return { inserted, skipped, removed, dateRangeMin: fileMinDate, dateRangeMax: fileMaxDate, gapWarning };
  },

  async _updateAccountCoverage(accountId, fileMin, fileMax, newlyInserted) {
    if (!this._db) return;
    try {
      const store = this._db.transaction('accounts', 'readwrite').objectStore('accounts');
      const existing = await this._req(store.get(accountId));
      if (!existing) return;

      const curMin = existing.dataRangeMin ? new Date(existing.dataRangeMin) : null;
      const curMax = existing.dataRangeMax ? new Date(existing.dataRangeMax) : null;

      existing.dataRangeMin = curMin ? new Date(Math.min(curMin.getTime(), fileMin.getTime())) : fileMin;
      existing.dataRangeMax = curMax ? new Date(Math.max(curMax.getTime(), fileMax.getTime())) : fileMax;
      existing.txCount = (existing.txCount || 0) + newlyInserted;

      await this._req(store.put(existing));
    } catch(e) { console.warn('DB._updateAccountCoverage:', e); }
  },

  /* Returns { [accountId]: { min, max, count } } for all accounts that have coverage data */
  async getCoverage() {
    if (!this._db) return {};
    const accounts = await this.getAccounts();
    const result = {};
    for (const a of accounts) {
      if (a.dataRangeMin || a.dataRangeMax) {
        result[a.id] = {
          min:   a.dataRangeMin ? new Date(a.dataRangeMin) : null,
          max:   a.dataRangeMax ? new Date(a.dataRangeMax) : null,
          count: a.txCount || 0,
        };
      }
    }
    return result;
  },

  /**
   * Boot-time loader. Reads all app_state keys into State, loads accounts,
   * loads transactions (with overrides applied), runs detectTransfers().
   * Call: await DB.loadAll() before first renderActive().
   */
  async loadAll() {
    if (!this._db) return;

    // ── 1. Load app_state into State ──
    const appStateMap = [
      // [stateKey,      dbKey,             default]
      ['budgets',            'budgets',             []],
      ['buckets',            'buckets',             []],
      ['debts',              'debts',               []],
      ['bills',              'bills',               []],
      ['recurringConfirmed', 'recurring',           {}],
      ['txOverrides',        'txOverrides',         {}],
      ['manualBalances',     'manualBalances',      {}],
      ['categoryRules',      'catRules',            []],
      ['categories',         'categories',          null],
      ['apiKey',             'apiKey',              ''],
      ['aiHistory',          'aiHistory',           []],
      ['scenarios',          'scenarios',           []],
      ['investAlloc',        'investAlloc',         {}],
      ['fileAssignments',    'fileAssignments',     {}],
      ['lastFolderName',     'lastFolderName',      ''],
      ['theme',              'theme',               'light'],
      ['accountOrder',       'accountOrder',        []],
      ['accountLabels',      'accountLabels',       {}],
      ['txRules',            'txRules',             []],
      ['transferKeywords',   'transferKeywords',    null],
      ['customSchemas',      'customSchemas',       []],
    ];

    for (const [stateKey, dbKey, def] of appStateMap) {
      const val = await this.getState(dbKey, def);
      if (val !== null && val !== undefined) State[stateKey] = val;
    }

    // Ensure categories has a fallback
    if (!State.categories || !State.categories.length) {
      State.categories = [
        'Food & Dining','Groceries','Housing','Transport','Entertainment',
        'Health','Shopping','Bills & Utilities','Subscriptions','Personal',
        'Travel','Income','Transfer','Fees','Other'
      ];
    }
    // Ensure transferKeywords has a fallback
    if (!State.transferKeywords || !State.transferKeywords.length) {
      State.transferKeywords = DEFAULT_TRANSFER_KEYWORDS;
    }

    // Merge custom schemas into BANK_SCHEMAS (avoid duplicates)
    if (State.customSchemas && State.customSchemas.length && typeof BANK_SCHEMAS !== 'undefined') {
      for (const cs of State.customSchemas) {
        if (!BANK_SCHEMAS.find(s => s.id === cs.id)) BANK_SCHEMAS.push(cs);
      }
    }

    // ── 2. Load accounts ──
    const dbAccounts = await this.getAccounts();
    // Merge DB accounts into State.accounts (preserving any in-memory ones)
    for (const a of dbAccounts) {
      const existing = State.accounts[a.id];
      State.accounts[a.id] = { ...(existing || {}), ...a };
      // Apply any persisted custom label
      if (State.accountLabels && State.accountLabels[a.id]) {
        State.accounts[a.id].name = State.accountLabels[a.id];
      }
    }

    // ── 3. Load transactions + apply overrides ──
    const rawTxs = await this._getAllTransactions();
    if (rawTxs.length) {
      const overridesMap = await this.getOverrides();
      State.transactions = rawTxs
        .map(raw => {
          const ov = overridesMap.get(raw.id) || State.txOverrides[raw.id] || {};
          return reconstituteTx(raw, ov);
        })
        .sort((a, b) => b.date - a.date);

      // Re-run transfer detection on the loaded transactions
      detectTransfers();
    }
  },

  async _getAllTransactions() {
    if (!this._db) return [];
    return new Promise((res) => {
      const req = this._getStore('transactions').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => res([]);
    });
  },

  /**
   * Filtered transaction query. Uses IDB date index when from/to are provided.
   * Accounts filtering is applied post-cursor.
   */
  queryTransactions({ from, to, accounts } = {}) {
    if (!this._db) return Promise.resolve([]);
    return new Promise((res) => {
      const store = this._getStore('transactions');
      let req;
      if (from || to) {
        const lower = from  ? from  : undefined;
        const upper = to    ? to    : undefined;
        const range = lower && upper ? IDBKeyRange.bound(lower, upper)
                    : lower          ? IDBKeyRange.lowerBound(lower)
                    :                  IDBKeyRange.upperBound(upper);
        req = store.index('date').getAll(range);
      } else {
        req = store.getAll();
      }
      req.onsuccess = () => {
        let rows = (req.result || []).map(raw => reconstituteTx(raw, State.txOverrides[raw.id] || {}));
        if (accounts && accounts.length) rows = rows.filter(t => accounts.includes(t.account));
        res(rows);
      };
      req.onerror = () => res([]);
    });
  },

  /* ── Overrides ───────────────────────────────────────────────── */

  /** Upsert an override. Merges patch into any existing override for txId. */
  async setOverride(txId, patch) {
    if (!this._db) return;
    try {
      const store = this._db.transaction('tx_overrides', 'readwrite').objectStore('tx_overrides');
      let existing = null;
      try { existing = await this._req(store.get(txId)); } catch(e) {}
      const merged = { ...(existing || {}), ...patch, txId, modifiedAt: new Date() };
      await this._req(store.put(merged));
    } catch(e) { console.warn('DB.setOverride:', e); }
  },

  /** Returns Map<txId, overrideObject> for all stored overrides. */
  async getOverrides() {
    if (!this._db) return new Map();
    return new Promise((res) => {
      const req = this._getStore('tx_overrides').getAll();
      req.onsuccess = () => {
        const m = new Map();
        for (const ov of (req.result || [])) m.set(ov.txId, ov);
        res(m);
      };
      req.onerror = () => res(new Map());
    });
  },

  /* ── Accounts ────────────────────────────────────────────────── */

  /** Upsert account. Preserves existing coverage + manualBalance if not supplied. */
  async upsertAccount(account) {
    if (!this._db) return;
    try {
      const store = this._db.transaction('accounts', 'readwrite').objectStore('accounts');
      let existing = null;
      try { existing = await this._req(store.get(account.id)); } catch(e) {}
      const merged = { ...(existing || {}), ...account };
      // Never wipe coverage or balance that was already in DB
      if (existing) {
        if (existing.dataRangeMin && !account.dataRangeMin) merged.dataRangeMin = existing.dataRangeMin;
        if (existing.dataRangeMax && !account.dataRangeMax) merged.dataRangeMax = existing.dataRangeMax;
        if (existing.txCount      && !account.txCount)      merged.txCount      = existing.txCount;
        if (existing.manualBalance != null && account.manualBalance == null)
          merged.manualBalance = existing.manualBalance;
      }
      await this._req(store.put(merged));
    } catch(e) { console.warn('DB.upsertAccount:', e); }
  },

  async getAccounts() {
    if (!this._db) return [];
    return new Promise((res) => {
      const req = this._getStore('accounts').getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => res([]);
    });
  },

  /* ── Import Log ──────────────────────────────────────────────── */

  async logImport(meta) {
    if (!this._db) return;
    try {
      const store = this._db.transaction('import_log', 'readwrite').objectStore('import_log');
      await this._req(store.add({ ...meta, timestamp: new Date() }));
    } catch(e) { console.warn('DB.logImport:', e); }
  },

  /** Returns import log entries newest-first. */
  async getImportLog() {
    if (!this._db) return [];
    return new Promise((res) => {
      const req = this._getStore('import_log').getAll();
      req.onsuccess = () => res((req.result || []).slice().reverse());
      req.onerror   = () => res([]);
    });
  },

  /* ── Cleanup & reset (used by Settings → Data & Reset, views-cleanup.js) ── */

  /** Every object store in finlens_db. Keep in sync with open() → onupgradeneeded. */
  STORES: ['transactions', 'tx_overrides', 'accounts', 'import_log', 'app_state'],

  /** Returns { [storeName]: recordCount } (null for a store that couldn't be read). */
  async counts() {
    const out = {};
    if (!this._db) return out;
    for (const name of this.STORES) {
      try { out[name] = await this._req(this._getStore(name).count()); }
      catch(e) { out[name] = null; }
    }
    return out;
  },

  /** Empties the given object stores in a single transaction. Resolves true once committed. */
  clearStores(names) {
    if (!this._db || !names.length) return Promise.resolve(false);
    return new Promise((res) => {
      const t = this._db.transaction(names, 'readwrite');
      names.forEach(n => t.objectStore(n).clear());
      t.oncomplete = () => res(true);
      t.onerror = t.onabort = () => res(false);
    });
  },

  /**
   * Closes this tab's connection and deletes finlens_db entirely.
   * Resolves 'deleted', 'blocked' (another FinLens tab still has it open — the
   * delete finishes when that tab closes or reloads) or 'error'.
   */
  destroy() {
    if (this._db) { this._db.close(); this._db = null; }
    return deleteIndexedDB(this.DB_NAME);
  },
};
