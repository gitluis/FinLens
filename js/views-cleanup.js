/* ================================================================
   FINLENS — views-cleanup.js
   Settings → Data & Reset: clean up imported data, the database and
   logs, clear plans, disconnect the CSV folder, or start over.
   Loaded after views-settings.js, before views-db.js.

   Where FinLens keeps data (keep in sync with CLAUDE.md §20):
   - memory        State
   - localStorage  finlens_* keys (lsSet / lsGet)
   - IndexedDB     finlens_db (DB.STORES) and finlens_fs (CSV folder handle)
   - disk          finlens-state.json in the connected CSV folder
                   (CSV files themselves are never modified)
================================================================ */

const DataCleanup = {
  lastMessage: null,   // { kind: 'good'|'warn'|'bad', text } shown once at the top of the tab
  lastDone: null,      // 'action|arg' of the action that just ran: its button shows "Cleared" once

  // Plans and history the user created: [State key (= lsSet key), label, empty value (default [])]
  PLAN_ITEMS: [
    ['budgets',     'Budgets'],
    ['bills',       'Bills'],
    ['buckets',     'Savings buckets'],
    ['debts',       'Debts'],
    ['scenarios',   'Forecast scenarios'],
    ['investAlloc', 'Investment mix', {}],
    ['aiHistory',   'AI history'],
  ],
  // Cleared together with a plan item: [State key, lsSet key, empty value, note]
  PLAN_ALSO: {
    bills: [['recurringConfirmed', 'recurring', {}, 'Also forgets which spotted recurring charges you confirmed or dismissed.']],
    debts: [['debtPlan', 'debtPlan', { strategy: 'avalanche', extra: 0 }, 'Also resets the payoff plan (strategy and extra payment).']],
  },
  // Each plan item's row in Clean up: [title, what it holds (count → text)]
  PLAN_ROWS: {
    budgets:     ['Clear budgets',            n => plural(n, 'budget')],
    bills:       ['Clear bills',              n => plural(n, 'bill')],
    buckets:     ['Clear buckets',            n => plural(n, 'savings goal')],
    debts:       ['Clear debts',              n => plural(n, 'debt')],
    scenarios:   ['Clear forecast scenarios', n => plural(n, 'saved scenario')],
    investAlloc: ['Clear investment mix',     n => plural(n, 'fund')],
    aiHistory:   ['Clear AI history',         n => plural(n, 'saved answer')],
  },
  // How many entries a plan item holds (the investment mix: tickers with a share above 0)
  _planCount(key) {
    const v = State[key];
    if (Array.isArray(v)) return v.length;
    return Object.values(v || {}).filter(x => Number(x) > 0).length;
  },

  /* ---------- actions ---------- */

  async clearImported() {
    this._dropImported();
    if (State.sampleData) { State.sampleData = false; lsSet('sampleData', false); updateFolderBanner(); }
    await DB.clearStores(['transactions', 'accounts']);
    buildAccountFilter();
    // With a folder connected, boot would re-import its CSVs into the now-empty
    // database. Pause that (saved before _finish() rewrites the state file) so the
    // clear sticks until the user imports again.
    const paused = !!(await idbGet('csvDirHandle'));
    if (paused) { State.csvAutoImportPaused = true; lsSet('csvAutoImportPaused', true); }
    await this._finish('Imported transactions and accounts cleared.' + (paused
      ? ` They stay cleared after a reload: “${State.lastFolderName}” won't re-import until you click Rebuild here or Reload CSVs under Settings → Import.`
      : ''));
  },

  async clearImportLog() {
    await DB.clearStores(['import_log']);
    _importLogCache = [];
    this._done('good', 'Import log cleared.');
  },

  // Puts every loaded transaction back to its CSV values, rebuilt from the loaded
  // transactions themselves, so none is dropped or added (v1.16.1). Up to v1.16.0 it
  // replaced them with IndexedDB's rows. That store is empty after a restore from
  // finlens-state.json (a new browser, or cleared site data), so every transaction
  // vanished, and _finish() then saved the empty list to the file.
  // IndexedDB's transactions store is left as it is: it holds what imports put there.
  async clearEdits() {
    const edits = State.txOverrides || {};
    State.txOverrides = {};
    lsSet('txOverrides', {});
    await DB.clearStores(['tx_overrides']);
    // A stored row only fills in what a transaction from an older finlens-state.json
    // doesn't record. It never decides which transactions exist.
    const rows = new Map((await DB._getAllTransactions()).map(r => [r.id, r]));
    State.transactions = State.transactions.map(t => this._unedited(t, edits[t.id], rows.get(t.id)));
    detectTransfers();
    await this._finish('Transaction edits cleared.');
  },

  async clearPlan(key) {
    const item = this.PLAN_ITEMS.find(i => i[0] === key);
    if (!item) return;
    const fresh = (v) => JSON.parse(JSON.stringify(v));
    State[key] = fresh(item[2] !== undefined ? item[2] : []);
    lsSet(key, State[key]);
    (this.PLAN_ALSO[key] || []).forEach(([sk, lk, empty]) => { State[sk] = fresh(empty); lsSet(lk, State[sk]); });
    await this._finish(`${item[1]} cleared.`);
  },

  async rebuildFromFolder() {
    const handle = await idbGet('csvDirHandle');
    if (!handle) return this._done('bad', 'No CSV folder is connected.');
    // Ask for access now, while still inside the click: read-write also lets the
    // backup file be updated afterwards; read is the minimum needed to re-import.
    let canRead = !!(await folderWithWriteAccess());
    if (!canRead) {
      try {
        canRead = (await handle.queryPermission({ mode: 'read' })) === 'granted'
               || (await handle.requestPermission({ mode: 'read' })) === 'granted';
      } catch(e) { canRead = false; }
    }
    if (!canRead) return this._done('bad', `FinLens doesn't have access to “${State.lastFolderName}”. Nothing was cleared.`);

    this._dropImported();
    _importLogCache = [];
    await DB.clearStores(['transactions', 'accounts', 'import_log']);
    await reloadFromDirHandle(handle);   // re-imports every CSV, detects transfers, renders
    await this._finish(`Rebuilt from “${State.lastFolderName}”: ${State.transactions.length.toLocaleString()} transactions re-imported.`);
  },

  // "Use my own files" on the sample-data banner: removes the samples (transactions,
  // accounts, their import log) and goes back to the Welcome. Plans made meanwhile stay.
  // Runs from a click: with a folder connected it rewrites finlens-state.json.
  async clearSampleData() {
    this._dropImported();
    _importLogCache = [];
    await DB.clearStores(['transactions', 'accounts', 'import_log']);
    State.sampleData = false; lsSet('sampleData', false);
    buildAccountFilter();
    updateFolderBanner();
    if (await idbGet('csvDirHandle')) await saveStateNow();
    showView('overview');
  },

  async disconnectFolder() {
    const name = State.lastFolderName || 'the folder';
    await forgetDataFolder();
    buildAccountFilter();
    this._done('good', `Disconnected “${name}”. FinLens no longer reads CSVs from it or saves finlens-state.json there. Nothing on disk was changed.`);
  },

  /**
   * Erase everything FinLens stores, then reload. Must run from a click: it may
   * need write access to the folder to retire finlens-state.json.
   * stateFile: 'archive' (rename to finlens-state-backup-DDMMYYYY.json) | 'delete'
   */
  async startOver(stateFile = 'archive') {
    State._resetInProgress = true;   // blocks pending/future auto-saves until the reload
    const file = await retireStateFile(stateFile);
    await idbDel('csvDirHandle');
    const dbStatus = await DB.destroy();
    const fsStatus = await deleteIndexedDB('finlens_fs');
    lsClearAll();

    const lines = ['FinLens has been reset and will now reload with no data.'];
    if (file.status === 'archived') lines.push(`Your old backup file was renamed to ${file.name} (API key removed).`);
    if (file.status === 'deleted')  lines.push('finlens-state.json was deleted.');
    if (file.status === 'denied' || file.status === 'error') {
      lines.push(`Couldn't ${stateFile === 'archive' ? 'rename' : 'delete'} finlens-state.json, so it's still in the folder. If you reconnect that folder, rename or delete the file first, or your old data will come back.`);
    }
    if (dbStatus === 'blocked' || fsStatus === 'blocked') {
      lines.push('Another FinLens tab is still open. Close it so the database can finish erasing.');
    }
    alert(lines.join('\n\n'));
    location.reload();
  },

  /* ---------- helpers ---------- */

  // Transaction `t` as its import made it, without its edit `ov` (for clearEdits()).
  // - Description: the kept original. Notes and the plan link live only in the edit.
  // - Flags: from the transaction rules, as mkTx() sets them without an edit.
  // - Category and type: recorded on the transaction since v1.16.1, else from its
  //   IndexedDB `row`. A transaction from an older finlens-state.json with no row has
  //   neither. If its category or type was edited, or it was marked as a transfer, they
  //   are worked out again from the description and amount, as an import of a file
  //   without Category and Type columns does. That is exact for checking and savings;
  //   a card's own Category and Type can't be recovered. detectTransfers() runs after.
  _unedited(t, ov, row) {
    ov = ov || {};
    const desc = t._originalDesc || t.description || '';
    const has = (c, ty) => Array.isArray(c) && c.length > 0 && !!ty;
    let cats = t._originalCategories, type = t._originalType;
    if (!has(cats, type) && row) { cats = row.categories; type = row.type; }
    const known = has(cats, type);
    if (!known) {
      const edited = (ov.categories && ov.categories.length) || ov.category || ov.type;
      cats = t.categories || [];
      type = t.type;
      if (edited || type === 'transfer') {
        const keep = edited ? [] : cats.filter(c => c !== 'Transfer out' && c !== 'Transfer in');
        cats = keep.length ? keep : [autoCategory(desc)];
        type = t.amount < 0 ? 'debit' : 'credit';
      }
    }
    return reconstituteTx({
      id: t.id, date: t.date, amount: t.amount,
      // No screen sets accountOverride, but older data can hold one: the row knows the
      // account the transaction was imported into.
      account: ov.accountOverride && row ? row.account : t.account,
      description: desc, _originalDesc: desc,
      categories: [...cats], type,
      isRecurring: txRuleFlag(desc, 'recurring'),
      isBill: txRuleFlag(desc, 'bill'),
      isSubscription: txRuleFlag(desc, 'subscription'),
      // Worked-out values aren't recorded as the CSV's: they stay a guess.
      _originalCategories: known ? cats : undefined,
      _originalType: known ? type : undefined,
    }, {});
  },

  // Forget imported data in memory (the caller clears the matching DB stores).
  _dropImported() {
    State.transactions = [];
    State.accounts = {};
    State.fileMeta = [];
    State.selectedAccounts = 'all';
    State.lastRefresh = null;
    _lastImportResults = [];
    _coverageCache = {};
  },

  // After clearing data that finlens-state.json also holds: rewrite the file now,
  // so the next page load can't restore what was just cleared.
  async _finish(text) {
    const file = await saveStateNow();
    if (file === 'denied') {
      this._done('warn', `${text} But FinLens couldn't update finlens-state.json in “${State.lastFolderName}” (no write access), so reloading may bring the cleared data back. Allow access when asked, or disconnect the folder.`);
    } else if (file === 'error') {
      this._done('warn', `${text} But writing finlens-state.json in “${State.lastFolderName}” failed (${State._lastSaveError || 'unknown error'}), so reloading may bring the cleared data back.`);
    } else {
      this._done('good', text + (file === 'saved' ? ' Backup file updated.' : ''));
    }
  },

  _done(kind, text) {
    this.lastMessage = { kind, text };
    if (kind === 'bad') this.lastDone = null;
    renderActive();
  },
};

/* ---------- view (Clarity, v1.16.0) ---------- */

registerView('data-cleanup', 'Data & reset', (root) => {
  wireLinks(root);
  const msg = DataCleanup.lastMessage;
  DataCleanup.lastMessage = null;
  const done = DataCleanup.lastDone;
  DataCleanup.lastDone = null;
  if (msg) appendHtml(root, callout(msg.kind === 'good' ? 'good' : msg.kind, escapeHtml(msg.text)));

  const folder = State.lastFolderName;
  const f = escapeHtml(folder || '');
  const n = (x) => Number(x || 0).toLocaleString();
  const edits = Object.keys(State.txOverrides || {}).length;
  const paused = State.csvAutoImportPaused && !State.transactions.length;

  /* ---- What FinLens has stored ---- */
  const count = (k) => DataCleanup._planCount(k);
  const settingsLine = [plural(count('budgets'), 'budget'), plural(count('bills'), 'bill'), plural(count('buckets'), 'bucket'),
    plural(count('debts'), 'debt'), plural(count('aiHistory'), 'AI answer')]
    .concat(count('scenarios') ? [plural(count('scenarios'), 'forecast scenario')] : [])
    .concat(count('investAlloc') ? ['your investment mix'] : [])
    .concat([State.apiKey ? 'API key' : 'no API key']).join(' · ');
  appendHtml(root, `<section class="panel" aria-labelledby="storedH">
    <h2 id="storedH">What FinLens has stored</h2>
    <div class="kv-rows">
      <div><span class="k">This browser's database</span><span class="v"><span data-count="transactions">…</span> · <span data-count="accounts">…</span> · <span data-count="import_log">…</span> · ${plural(edits, 'transaction edit')}</span></div>
      <div><span class="k">This browser's settings</span><span class="v">${settingsLine}</span></div>
      <div><span class="k">Your folder</span><span class="v">${folder ? `“${f}”: finlens-state.json (everything above except the API key). Your CSV files are never changed.` : 'No folder connected, so nothing is saved to disk. Connect one in <a href="#settings" data-goto="settings" data-tab="import">Import</a>.'}</span></div>
    </div>
  </section>`);

  /* ---- Clean up ---- */
  // [action, arg, title, what it does, button label, label once done, needs a stored folder handle]
  const rows = [
    ['clearImported', '', 'Clear transactions and accounts',
      paused ? `Automatic import from “${f}” is paused because you cleared your transactions. Rebuild, or Reload CSVs in Import, brings them back.`
        : folder ? `Keeps your plans, edits and settings. “${f}” won't re-import its CSVs until you reload them.` : 'Keeps your plans, edits, account names, balances and settings.',
      'Clear', 'Cleared'],
    ['clearImportLog', '', 'Clear import log', '<span data-count="import_log">…</span>', 'Clear', 'Cleared'],
    ['clearEdits', '', 'Clear transaction edits',
      edits ? `${plural(edits, 'renamed, re-categorized or flagged transaction')} go${edits === 1 ? 'es' : ''} back to ${edits === 1 ? 'its' : 'their'} CSV values` : 'No edits yet', 'Clear', 'Cleared'],
  ];
  if (folder) rows.push(['rebuildFromFolder', '', 'Rebuild from your folder', 'Re-reads every CSV from scratch. Plans and edits are kept.', 'Rebuild', 'Rebuilt', true]);
  DataCleanup.PLAN_ITEMS.forEach(([key]) => {
    const [title, what] = DataCleanup.PLAN_ROWS[key];
    const also = (DataCleanup.PLAN_ALSO[key] || []).map(a => a[3]).join(' ');
    rows.push(['clearPlan', key, title, what(count(key)) + (also ? '. ' + also : ''), 'Clear', 'Cleared']);
  });
  if (folder) rows.push(['disconnectFolder', '', 'Disconnect folder', 'Stops auto-reload and backups. Files on disk stay as they are.', 'Disconnect', 'Disconnected']);
  appendHtml(root, `<section class="panel" aria-labelledby="cleanH">
    <div><h2 id="cleanH">Clean up</h2><p class="sub">Each button asks you to click again to confirm.</p></div>
    <div class="clean-rows">${rows.map(([act, arg, title, desc, label, doneLabel, needsHandle]) => {
      const isDone = done === act + '|' + arg;
      return `<div class="clean-row"${needsHandle ? ' data-needs-handle' : ''}>
        <div class="who"><div class="t">${title}</div><div class="d">${desc}</div></div>
        <button type="button" class="btn ghost clean-btn${isDone ? ' done' : ''}" data-dc-action="${act}" data-dc-arg="${escapeHtml(arg)}" data-dc-label="${label}" data-dc-done="${doneLabel}" aria-label="${escapeHtml(title)}"${isDone ? ' disabled' : ''}>${isDone ? doneLabel : label}</button>
      </div>`;
    }).join('')}</div>
  </section>`);

  /* ---- Export and import (JSON) ---- */
  appendHtml(root, `<section class="panel row-panel" aria-labelledby="xferH">
    <div class="grow"><h2 id="xferH">Export and import</h2>
      <p class="sub">Download your plans, transaction edits, balances, categories and AI history as a JSON file, or load one you exported. Transactions and your API key aren't in it; your CSVs bring the transactions back.</p></div>
    <div class="acts"><button type="button" class="btn ghost lg" id="dcExport">Export JSON</button>
      <button type="button" class="btn ghost lg" id="dcImport">Import JSON…</button>
      <input type="file" id="dcImportFile" accept=".json,application/json" hidden></div>
  </section>`);

  /* ---- Start over ---- */
  appendHtml(root, `<section class="panel danger-panel" aria-labelledby="resetH">
    <h2 id="resetH">Start over</h2>
    <p class="body">Erases everything FinLens has stored in this browser, forgets the folder and reloads the app. Your CSV files are not touched.</p>
    ${folder ? `<fieldset class="radio-set"><legend>Your backup file</legend>
      <label><input type="radio" name="dcStateFile" value="archive" checked>Keep a copy as finlens-state-backup-${dayjs().format('DDMMYYYY')}.json</label>
      <label><input type="radio" name="dcStateFile" value="delete">Delete finlens-state.json</label>
    </fieldset>` : ''}
    <div class="form-row">
      <label class="field">Type RESET to confirm<input class="input reset-in" id="dcResetConfirm" autocomplete="off" spellcheck="false"></label>
      <button type="button" class="btn danger lg" id="dcResetBtn" disabled>Erase and start over</button>
    </div>
  </section>`);

  /* ---- wiring ---- */
  root.querySelectorAll('[data-dc-action]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') {
      // First click arms the button; the second click (a fresh user gesture, which
      // file-permission prompts require) runs the action.
      b.dataset.armed = '1';
      b.classList.add('armed');
      b.textContent = 'Click again to confirm';
      setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') { b.dataset.armed = ''; b.classList.remove('armed'); b.textContent = b.dataset.dcLabel; } }, 4000);
      return;
    }
    b.dataset.armed = '';
    b.classList.remove('armed');
    b.disabled = true;
    b.textContent = 'Working…';
    DataCleanup.lastDone = b.dataset.dcAction + '|' + b.dataset.dcArg;
    try { await DataCleanup[b.dataset.dcAction](b.dataset.dcArg); }
    catch(e) { console.error('[FinLens] cleanup:', e); DataCleanup._done('bad', 'Something went wrong: ' + (e.message || e)); }
  }));

  $('#dcExport').onclick = () => exportAllData();
  const jf = $('#dcImportFile');
  $('#dcImport').onclick = () => jf.click();
  jf.onchange = (e) => { if (jf.files.length) importJsonFile(e); setTimeout(() => { jf.value = ''; }, 0); };

  const confirmInput = $('#dcResetConfirm');
  const resetBtn = $('#dcResetBtn');
  confirmInput.addEventListener('input', () => { resetBtn.disabled = confirmInput.value.trim() !== 'RESET'; });
  resetBtn.addEventListener('click', () => {
    if (confirmInput.value.trim() !== 'RESET') return;
    resetBtn.disabled = true;
    resetBtn.textContent = 'Erasing…';
    const choice = $('input[name="dcStateFile"]:checked');
    DataCleanup.startOver(choice ? choice.value : 'archive');
  });

  // Database counts load asynchronously (renders stay synchronous — CLAUDE.md §15).
  setTimeout(async () => {
    const c = typeof DB !== 'undefined' ? await DB.counts() : {};
    const text = {
      transactions: c.transactions == null ? 'transactions: —' : plural(c.transactions, 'transaction'),
      accounts: c.accounts == null ? 'accounts: —' : plural(c.accounts, 'account'),
      import_log: c.import_log == null ? 'import log: —' : plural(c.import_log, 'import log entry', 'import log entries'),
    };
    $$('[data-count]').forEach(el => { el.textContent = text[el.dataset.count] || '—'; });
    // A folder name without a stored handle (legacy file input) can't be re-read.
    if (!(await idbGet('csvDirHandle'))) $$('[data-needs-handle]').forEach(el => el.remove());
  }, 0);
});
