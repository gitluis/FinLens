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
   * Batch-insert transactions. Uses add() (not put()) — duplicate IDs are silently
   * skipped (or occurrence-suffixed for Chase). Returns import stats + gap warning.
   */
  async importTransactions(txArray, accountId, schemaId) {
    if (!this._db || !txArray.length) {
      return { inserted: 0, skipped: 0, dateRangeMin: null, dateRangeMax: null, gapWarning: null };
    }

    // Find schema config for allowOccurrenceSuffix
    const allSchemas = [...(typeof BANK_SCHEMAS !== 'undefined' ? BANK_SCHEMAS : []),
                        ...(State.customSchemas || [])];
    const schema = allSchemas.find(s => s.id === schemaId);
    const allowSuffix = schema ? !!schema.allowOccurrenceSuffix : false;

    // Sort for stable occurrence-suffix assignment
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

    // Batch insert
    let inserted = 0, skipped = 0;

    for (const tx of sorted) {
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
        if (err && err.name === 'ConstraintError') {
          if (!allowSuffix) {
            skipped++;
          } else {
            // Occurrence suffix: try _2, _3, ... until add succeeds
            let suffixNum = 2, added = false;
            while (suffixNum <= 99 && !added) {
              try {
                const suffixStore = this._db.transaction('transactions', 'readwrite').objectStore('transactions');
                await this._req(suffixStore.add({ ...storable, id: storable.id + '_' + suffixNum }));
                inserted++;
                added = true;
              } catch (e2) {
                if (e2 && e2.name === 'ConstraintError') { suffixNum++; }
                else { skipped++; break; }
              }
            }
            if (!added && suffixNum > 99) skipped++;
          }
        }
        // Other errors: silently skip
      }
    }

    // Update account coverage metadata
    await this._updateAccountCoverage(accountId, fileMinDate, fileMaxDate, inserted);

    return { inserted, skipped, dateRangeMin: fileMinDate, dateRangeMax: fileMaxDate, gapWarning };
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
};
