/* ================================================================
   FINLENS — migrate.js
   Rewrites data saved by older versions. Loaded after db.js.
================================================================ */

/* ---------- v1.12.0: neutral account codes ---------- */
// Up to v1.10.x the account kinds, schema ids and account ids were named after two
// banks. They are now bank_checking, bank_savings and credit_card (card_<file> for card
// accounts). Data saved by those versions (browser storage, finlens-state.json, its
// backups and JSON exports) still carries the old codes, so this file is the one place
// that lists them (CLAUDE.md §22).
//
// Transaction ids are hashes that include the account id (mkTx() in core.js), so they
// change too. The stored transaction lacks two of the hash inputs (the bank's time or
// the post date), but the hash is linear enough to swap the account part of an existing
// id without them: see _rekey().
const IdMigration = {
  // Account kinds and BANK_SCHEMAS ids
  KINDS: { ally_checking: 'bank_checking', ally_savings: 'bank_savings', chase: 'credit_card' },
  // Account ids: fixed ones, and the prefix of card accounts (<prefix><file name>)
  ACCOUNT_IDS: { ally_checking: 'bank_checking', ally_savings: 'bank_savings' },
  OLD_CARD_PREFIX: 'chase_',
  NEW_CARD_PREFIX: 'card_',
  // Default names older versions gave imported accounts → the names given now. Names the
  // user typed are left alone.
  NAMES: [
    [/^Ally (?:Bank )?Checking$/, () => 'Bank Checking'],
    [/^Ally (?:Bank )?Savings$/,  () => 'Bank Savings'],
    [/^Chase Credit Card$/,       () => 'Bank Credit Card'],
    [/^Chase \((.*)\)$/,          (m) => `Bank Credit Card (${m[1]})`],
  ],
  // Persisted State keys that hold account ids, kinds or transaction ids.
  KEYS: ['txOverrides', 'manualBalances', 'accountLabels', 'accountOrder', 'fileAssignments'],

  /* ---------- codes and names ---------- */
  kind(k) { return this.KINDS[k] || k; },

  accountId(id) {
    if (typeof id !== 'string') return id;
    if (this.ACCOUNT_IDS[id]) return this.ACCOUNT_IDS[id];
    if (id.startsWith(this.OLD_CARD_PREFIX)) return this.NEW_CARD_PREFIX + id.slice(this.OLD_CARD_PREFIX.length);
    return id;
  },

  isOld(id) { return this.accountId(id) !== id; },

  // The id an older version gave this account, or null if it never had another.
  oldAccountId(id) {
    if (typeof id !== 'string') return null;
    for (const [o, n] of Object.entries(this.ACCOUNT_IDS)) if (n === id) return o;
    if (id.startsWith(this.NEW_CARD_PREFIX)) return this.OLD_CARD_PREFIX + id.slice(this.NEW_CARD_PREFIX.length);
    return null;
  },

  accountName(name) {
    if (typeof name !== 'string') return name;
    for (const [re, to] of this.NAMES) { const m = re.exec(name); if (m) return to(m); }
    return name;
  },

  // manualBalances keys: <accountId>, <accountId>_limit, <accountId>_initial
  balanceKey(k) {
    for (const [o, n] of Object.entries(this.ACCOUNT_IDS)) {
      if (k === o || k === o + '_limit' || k === o + '_initial') return n + k.slice(o.length);
    }
    return k.startsWith(this.OLD_CARD_PREFIX) ? this.NEW_CARD_PREFIX + k.slice(this.OLD_CARD_PREFIX.length) : k;
  },

  /* ---------- transaction ids ---------- */
  // hash() in core.js is h = 31·h + charCode (mod 2^32) over "<date>|<time or post date>|
  // <description>|<amount>|<accountId>", shown as 'tx' + |h| in base 36. Because it's
  // linear, h(P + "|" + account) = h(P)·31^n + h("|" + account), so the hash of the prefix P
  // can be recovered from an id and re-extended with the new account id.
  _h(s, h = 0) {
    for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
    return h;
  },
  _pow(b, n) { let p = 1; for (let i = 0; i < n; i++) p = Math.imul(p, b); return p; },
  // 31⁻¹ mod 2^32 (Newton's method; 31 is odd, so the inverse exists).
  _INV31: (() => { let x = 31; for (let i = 0; i < 5; i++) x = Math.imul(x, (2 - Math.imul(31, x)) | 0); return x; })(),

  // Hashes of every bank time string, by length (HH:MM:SS, and H:MM:SS just in case).
  _timeHashes: null,
  _times(len) {
    if (!this._timeHashes) {
      const p = (n) => String(n).padStart(2, '0');
      const m = { 7: new Set(), 8: new Set() };
      for (let H = 0; H < 24; H++) for (let M = 0; M < 60; M++) for (let S = 0; S < 60; S++) {
        m[8].add(this._h(`${p(H)}:${p(M)}:${p(S)}`));
        if (H < 10) m[7].add(this._h(`${H}:${p(M)}:${p(S)}`));
      }
      this._timeHashes = m;
    }
    return this._timeHashes[len];
  },

  // Is hP the hash of a prefix this transaction could have had? The id only keeps |h|, so
  // each id gives two candidates; this check keeps the right one. The prefix is the date,
  // then the bank's time or the card's post date (not stored, so searched for), then the
  // description and amount.
  _fits(hP, tx) {
    const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
    if (isNaN(d)) return false;
    const date = d.toISOString().slice(0, 10);
    const tail = '|' + (tx._originalDesc || tx.description || '') + '|' + tx.amount;
    if (this._h(date + tail) === hP) return true;                         // neither column
    const head = Math.imul((hP - this._h(tail)) | 0, this._pow(this._INV31, tail.length));  // h(date|X)
    const hDate = this._h(date + '|');
    for (const len of [8, 7]) {                                            // X = time
      if (this._times(len).has((head - Math.imul(hDate, this._pow(31, len))) | 0)) return true;
    }
    const t0 = Date.parse(date + 'T00:00:00Z'), p10 = this._pow(31, 10);  // X = post date
    for (let k = -10; k <= 90; k++) {
      const pd = new Date(t0 + k * 864e5).toISOString().slice(0, 10);
      if (((Math.imul(hDate, p10) + this._h(pd)) | 0) === head) return true;
    }
    return false;
  },

  // The id the transaction gets when its account part `from` becomes `to`, or null when
  // its id can't be traced back to `from`.
  _rekey(tx, from, to) {
    const m = /^tx([0-9a-z]+)(_\d+)?$/.exec(tx.id || '');
    if (!m) return null;
    const n = parseInt(m[1], 36);
    const a = '|' + from, b = '|' + to;
    const out = new Set();
    for (const h of new Set([n | 0, (-n) | 0])) {
      const hP = Math.imul((h - this._h(a)) | 0, this._pow(this._INV31, a.length));
      if (!this._fits(hP, tx)) continue;
      const hNew = (Math.imul(hP, this._pow(31, b.length)) + this._h(b)) | 0;
      out.add('tx' + Math.abs(hNew).toString(36) + (m[2] || ''));
    }
    return out.size === 1 ? [...out][0] : null;
  },

  // New id for a transaction stored under an old account. The id was hashed with the
  // account of the file it came from: normally tx.account, but a transaction moved to
  // another account (accountOverride) may have come from any of them.
  _newTxId(tx, oldAccounts, moved) {
    const from = moved ? [tx.account, ...oldAccounts] : [tx.account];
    const found = new Set();
    for (const a of new Set(from)) {
      if (!this.isOld(a)) continue;
      const id = this._rekey(tx, a, this.accountId(a));
      if (id) found.add(id);
    }
    return found.size === 1 ? [...found][0] : null;
  },

  // The id an older version gave this transaction, or null.
  _oldTxId(tx) {
    const old = this.oldAccountId(tx.account);
    return old ? this._rekey(tx, tx.account, old) : null;
  },

  /* ---------- state objects (State, finlens-state.json, exports) ---------- */
  _account(a) {
    if (!a || typeof a !== 'object') return a;
    const id = this.accountId(a.id), kind = this.kind(a.kind), name = this.accountName(a.name);
    const schemaId = a.schemaId === undefined ? undefined : this.kind(a.schemaId);
    if (id === a.id && kind === a.kind && name === a.name && schemaId === a.schemaId) return a;
    const out = { ...a, id, kind, name };
    if (schemaId !== undefined) out.schemaId = schemaId;
    return out;
  },

  _mapKeys(obj, keyFn, valFn = (v) => v) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    let changed = false;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const nk = keyFn(k), nv = valFn(v);
      if (nk !== k || nv !== v) changed = true;
      // A key already in its new form wins over an old one that maps onto it.
      if (nk in out && nk !== k) continue;
      out[nk] = nv;
    }
    return changed ? out : null;
  },

  _override(v) {
    return v && typeof v === 'object' && this.isOld(v.accountOverride)
      ? { ...v, accountOverride: this.accountId(v.accountOverride) } : v;
  },

  // Rewrites the persisted keys in KEYS. Returns the new value, or null if unchanged.
  _key(key, v, idMap) {
    if (v === null || v === undefined) return null;
    switch (key) {
      case 'txOverrides':     return this._mapKeys(v, (k) => idMap.get(k) || k, (o) => this._override(o));
      case 'manualBalances':  return this._mapKeys(v, (k) => this.balanceKey(k));
      case 'accountLabels':   return this._mapKeys(v, (k) => this.accountId(k), (n) => this.accountName(n));
      case 'fileAssignments': return this._mapKeys(v, (k) => k, (kind) => this.kind(kind));
      case 'accountOrder': {
        if (!Array.isArray(v) || !v.some((id) => this.isOld(id))) return null;
        return [...new Set(v.map((id) => this.accountId(id)))];
      }
    }
    return null;
  },

  // Rewrites a state object in place: State, a parsed finlens-state.json (transactions
  // already rebuilt with reconstituteTx()), or a JSON export. Safe to run on data that's
  // already new: nothing matches, nothing changes.
  // Returns { changed: [keys], idMap: Map(old tx id → new), kept: count of transactions
  // whose id couldn't be traced and so kept their old id }.
  migrateState(s) {
    const changed = [], idMap = new Map();
    let kept = 0;
    if (!s || typeof s !== 'object') return { changed, idMap, kept };

    const txs = Array.isArray(s.transactions) ? s.transactions.filter((t) => t && typeof t === 'object') : [];
    const oldAccounts = [...new Set([...Object.keys(s.accounts || {}), ...txs.map((t) => t.account)])]
      .filter((a) => this.isOld(a));
    if (oldAccounts.length) {
      const ovs = s.txOverrides || {};
      for (const t of txs) {
        const moved = !!(ovs[t.id] && ovs[t.id].accountOverride);
        if (!this.isOld(t.account) && !moved) continue;
        const id = this._newTxId(t, oldAccounts, moved);
        if (id) { if (id !== t.id) { idMap.set(t.id, id); t.id = id; } }
        else if (this.isOld(t.account)) kept++;
        t.account = this.accountId(t.account);
      }
      if (txs.length) changed.push('transactions');
    }

    if (s.accounts && typeof s.accounts === 'object') {
      const out = this._mapKeys(s.accounts, (k) => this.accountId(k), (a) => this._account(a));
      if (out) { s.accounts = out; changed.push('accounts'); }
    }

    for (const key of this.KEYS) {
      const out = this._key(key, s[key], idMap);
      if (out) { s[key] = out; changed.push(key); }
    }

    if (Array.isArray(s.selectedAccounts) && s.selectedAccounts.some((id) => this.isOld(id))) {
      s.selectedAccounts = s.selectedAccounts.map((id) => this.accountId(id));
    }
    if (Array.isArray(s.fileMeta)) {
      s.fileMeta = s.fileMeta.map((f) => (f && this.KINDS[f.kind]) ? { ...f, kind: this.kind(f.kind), account: this.accountName(f.account) } : f);
    }
    return { changed, idMap, kept };
  },

  /* ---------- browser storage (IndexedDB finlens_db + localStorage) ---------- */
  async _all(store) {
    return new Promise((res) => {
      try {
        const r = DB._db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result || []);
        r.onerror = () => res([]);
      } catch (e) { res([]); }
    });
  },

  // Rewrites old codes in IndexedDB (transactions, tx_overrides, accounts, import_log,
  // app_state) and in localStorage. `idMap` adds transaction ids already worked out from
  // State (the state file may hold transactions IndexedDB doesn't).
  // Returns { transactions, kept, idMap } counts for the log line.
  async migrateStores(idMap = new Map()) {
    const result = { transactions: 0, kept: 0, idMap };
    if (typeof DB !== 'undefined' && DB._db) {
      const [ovs, accounts, logs, appState] = await Promise.all(
        ['tx_overrides', 'accounts', 'import_log', 'app_state'].map((s) => this._all(s)));
      // An import stores the account before its transactions, Data & Reset clears the two
      // together, and this migration rewrites every store in one IndexedDB transaction, so
      // transactions with old codes always come with an account that has one.
      const txs = accounts.some((a) => this.isOld(a.id)) ? await this._all('transactions') : [];
      // Transactions moved to another account (accountOverride), per any copy of the edits
      const savedOvs = (appState.find((r) => r.key === 'txOverrides') || {}).value || {};
      const moved = new Set([
        ...ovs.filter((o) => o.accountOverride).map((o) => o.txId),
        ...[savedOvs, State.txOverrides || {}].flatMap((m) => Object.keys(m).filter((k) => m[k] && m[k].accountOverride)),
      ]);
      const oldAccounts = [...new Set([...accounts.map((a) => a.id), ...txs.map((t) => t.account)])].filter((a) => this.isOld(a));

      const puts = { transactions: [], tx_overrides: [], accounts: [], import_log: [], app_state: [] };
      const dels = { transactions: [], tx_overrides: [], accounts: [] };

      for (const raw of txs) {
        const old = this.isOld(raw.account) || this.KINDS[raw.schemaId];
        if (!old && !(oldAccounts.length && moved.has(raw.id))) continue;
        let id = idMap.get(raw.id);
        if (!id) {
          id = this._newTxId(raw, oldAccounts, moved.has(raw.id));
          if (id) idMap.set(raw.id, id);
          else { id = raw.id; if (this.isOld(raw.account)) result.kept++; }
        }
        if (id === raw.id && !old) continue;
        if (id !== raw.id) dels.transactions.push(raw.id);
        puts.transactions.push({ ...raw, id, account: this.accountId(raw.account), schemaId: this.kind(raw.schemaId) });
        result.transactions++;
      }
      for (const ov of ovs) {
        const txId = idMap.get(ov.txId) || ov.txId, out = this._override(ov);
        if (txId === ov.txId && out === ov) continue;
        if (txId !== ov.txId) dels.tx_overrides.push(ov.txId);
        puts.tx_overrides.push({ ...out, txId });
      }
      for (const a of accounts) {
        const out = this._account(a);
        if (out === a) continue;
        if (out.id !== a.id) dels.accounts.push(a.id);
        puts.accounts.push(out);
      }
      for (const l of logs) {
        if (!this.isOld(l.accountId) && !this.KINDS[l.schemaId]) continue;
        puts.import_log.push({ ...l, accountId: this.accountId(l.accountId), schemaId: this.kind(l.schemaId) });
      }
      for (const rec of appState) {
        if (!this.KEYS.includes(rec.key)) continue;
        const out = this._key(rec.key, rec.value, idMap);
        if (out) puts.app_state.push({ key: rec.key, value: out });
      }

      const stores = Object.keys(puts).filter((s) => puts[s].length || (dels[s] && dels[s].length));
      if (stores.length) {
        await new Promise((res) => {
          const t = DB._db.transaction(stores, 'readwrite');
          for (const s of stores) {
            const st = t.objectStore(s);
            (dels[s] || []).forEach((k) => st.delete(k));
            puts[s].forEach((r) => st.put(r));
          }
          t.oncomplete = () => res(true);
          t.onerror = t.onabort = () => { console.warn('[FinLens] Account code migration: IndexedDB write failed', t.error); res(false); };
        });
      }
    }
    // localStorage keeps its own copy of these keys (lsGet reads it at startup).
    for (const key of this.KEYS) {
      const v = lsGet(key, null);
      const out = this._key(key, v, idMap);
      if (out) lsSet(key, out);
    }
    return result;
  },

  // Boot step (init.js), after State is loaded from finlens-state.json or IndexedDB.
  async atBoot() {
    const mem = this.migrateState(State);
    const store = await this.migrateStores(new Map(mem.idMap));
    if (mem.changed.length) _saveStateDebounced(State);
    if (mem.changed.length || store.transactions) {
      const kept = Math.max(mem.kept, store.kept);
      console.log(`[FinLens] Renamed old account codes; ${store.idMap.size} transaction ids updated` +
        (kept ? `, ${kept} kept their old id (couldn't be traced)` : ''));
    }
  },

  // Edits saved under a transaction's old id (an export from an older version, or edits
  // kept while transactions were cleared) move to its new id. Returns the ids that
  // received an edit, so the caller can rebuild those transactions.
  adoptOverrides(txs) {
    const ovs = State.txOverrides || {};
    const ids = new Set(txs.map((t) => t.id));
    const orphans = new Set(Object.keys(ovs).filter((k) => !ids.has(k)));
    const adopted = new Set();
    if (!orphans.size) return adopted;
    for (const t of txs) {
      if (ovs[t.id] || !this.oldAccountId(t.account)) continue;
      const old = this._oldTxId(t);
      if (old && orphans.has(old)) {
        ovs[t.id] = this._override(ovs[old]);
        delete ovs[old];
        orphans.delete(old);
        adopted.add(t.id);
      }
    }
    return adopted;
  },
};
