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

  // Plans and history the user created: [State key (= lsSet key), label]
  PLAN_ITEMS: [
    ['budgets',   'Budgets'],
    ['bills',     'Bills'],
    ['buckets',   'Savings buckets'],
    ['debts',     'Debts'],
    ['aiHistory', 'AI history'],
  ],

  /* ---------- actions ---------- */

  async clearImported() {
    this._dropImported();
    await DB.clearStores(['transactions', 'accounts']);
    buildAccountFilter();
    // With a folder connected, boot would re-import its CSVs into the now-empty
    // database. Pause that (saved before _finish() rewrites the state file) so the
    // clear sticks until the user imports again.
    const paused = !!(await idbGet('csvDirHandle'));
    if (paused) { State.csvAutoImportPaused = true; lsSet('csvAutoImportPaused', true); }
    await this._finish('Imported transactions and accounts cleared.' + (paused
      ? ` They stay cleared after a reload: “${State.lastFolderName}” won't re-import until you click Rebuild here or Reload under Settings → Import.`
      : ''));
  },

  async clearImportLog() {
    await DB.clearStores(['import_log']);
    _importLogCache = [];
    this._done('good', 'Import log cleared.');
  },

  async clearEdits() {
    State.txOverrides = {};
    lsSet('txOverrides', {});
    await DB.clearStores(['tx_overrides']);
    // Rebuild the loaded transactions without overrides so the change shows now.
    if (DB._db && State.transactions.length) {
      const raw = await DB._getAllTransactions();
      State.transactions = raw.map(r => reconstituteTx(r, {})).sort((a, b) => b.date - a.date);
      detectTransfers();
    }
    await this._finish('Transaction edits cleared.');
  },

  async clearPlan(key) {
    const item = this.PLAN_ITEMS.find(i => i[0] === key);
    if (!item) return;
    State[key] = [];
    lsSet(key, []);
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
    } else {
      this._done('good', text + (file === 'saved' ? ' Backup file updated.' : ''));
    }
  },

  _done(kind, text) {
    this.lastMessage = { kind, text };
    renderActive();
  },
};

/* ---------- view ---------- */

const DC_ROW_STYLE = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm)';

registerView('data-cleanup', 'Data & Reset', (root) => {
  const msg = DataCleanup.lastMessage;
  DataCleanup.lastMessage = null;
  if (msg) {
    const banner = document.createElement('div');
    banner.className = 'insight' + (msg.kind === 'good' ? '' : ' ' + msg.kind);
    banner.style.marginBottom = '2px';
    banner.textContent = msg.text;
    root.appendChild(banner);
  }

  const folder = State.lastFolderName;
  const n = (x) => Number(x || 0).toLocaleString();
  const plural = (x, one, many) => `${n(x)} ${x === 1 ? one : many}`;
  // A two-step button: first click arms it, second click runs the action.
  const btn = (action, label, arg = '', cls = 'btn danger sm') =>
    `<button class="${cls}" data-dc-action="${action}" data-dc-arg="${escapeAttr(arg)}" data-dc-label="${escapeAttr(label)}">${label}</button>`;
  const row = (title, count, desc, button) => `
    <div style="${DC_ROW_STYLE}">
      <div style="min-width:0">
        <div style="font-size:13px;font-weight:500">${title} <span class="muted" style="font-weight:400;font-size:12px">${count}</span></div>
        <div class="muted" style="font-size:11.5px;margin-top:2px">${desc}</div>
      </div>
      ${button}
    </div>`;

  /* ---- Imported data & database ---- */
  const imported = document.createElement('div'); imported.className = 'card';
  imported.innerHTML = `
    <h2 class="section-title">Imported data &amp; database</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Data that came from your CSV files. Clearing it keeps your plans, account names, balances and settings.</p>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${row('Transactions &amp; accounts',
            `${plural(State.transactions.length, 'transaction', 'transactions')} loaded · <span id="dcDbTx">…</span> in database · <span id="dcDbAcct">…</span>`,
            'Removes every imported transaction and account record from this browser.',
            btn('clearImported', 'Clear'))}
      ${row('Import log', '<span id="dcDbLog">…</span>',
            'The history of CSV imports shown under Settings → Import.',
            btn('clearImportLog', 'Clear'))}
      ${row('Transaction edits', plural(Object.keys(State.txOverrides || {}).length, 'edit', 'edits'),
            'Your changes to descriptions, categories, notes and flags. Edits are kept when you clear or re-import transactions, so they re-apply automatically.',
            btn('clearEdits', 'Clear'))}
      ${folder ? `<div data-needs-handle>${row('Rebuild from folder', `📁 ${escapeHtml(folder)}`,
            'Clears imported transactions, accounts and the import log, then re-imports every CSV in the folder. Fixes a messy database without touching your plans.',
            btn('rebuildFromFolder', 'Rebuild', '', 'btn sm'))}</div>` : ''}
    </div>
    ${folder ? `<div class="insight${State.csvAutoImportPaused && !State.transactions.length ? ' warn' : ''}" data-needs-handle style="margin-top:12px;font-size:12px">${State.csvAutoImportPaused && !State.transactions.length
        ? `Automatic import from “${escapeHtml(folder)}” is paused because you cleared your transactions. Click <strong>Rebuild</strong>, or Reload under Settings → Import, to bring them back.`
        : `Clearing transactions pauses the automatic import from “${escapeHtml(folder)}”, so they stay cleared after a reload until you click Rebuild or Reload.`}</div>` : ''}`;
  root.appendChild(imported);

  /* ---- Plans & history ---- */
  const plans = document.createElement('div'); plans.className = 'card';
  plans.innerHTML = `
    <h2 class="section-title">Your plans &amp; history</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Things you created in FinLens. Clearing one can't be undone.</p>
    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${DataCleanup.PLAN_ITEMS.map(([key, label]) => {
        const len = (State[key] || []).length;
        return row(label, key === 'aiHistory' ? plural(len, 'entry', 'entries') : n(len), '', btn('clearPlan', 'Clear', key));
      }).join('')}
    </div>`;
  root.appendChild(plans);

  /* ---- CSV folder & backup file ---- */
  const files = document.createElement('div'); files.className = 'card';
  files.innerHTML = `
    <h2 class="section-title">CSV folder &amp; backup file</h2>
    ${folder
      ? `<div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
          ${row(`📁 ${escapeHtml(folder)}`,
                State.lastFsyncTime ? '· backup saved ' + dayjs(State.lastFsyncTime).format('MMM D, h:mm A') : '',
                'FinLens reads your CSVs from this folder and saves <code>finlens-state.json</code> there. Disconnecting stops both; nothing on disk is changed.',
                btn('disconnectFolder', 'Disconnect', '', 'btn ghost sm'))}
        </div>`
      : `<p class="muted" style="font-size:12px;margin-top:6px">No CSV folder is connected, so nothing is saved to disk. Connect one under Settings → Import.</p>`}`;
  root.appendChild(files);

  /* ---- Start over ---- */
  const reset = document.createElement('div'); reset.className = 'card';
  reset.style.borderColor = 'var(--red)';
  reset.innerHTML = `
    <h2 class="section-title">Start over from scratch</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Erases everything FinLens keeps in this browser — transactions, accounts, import log, edits, budgets, bills, buckets, debts, AI history, settings and your API key — and disconnects your CSV folder. <strong>Your CSV files are never touched.</strong></p>
    ${folder ? `
      <div style="margin-top:12px;font-size:12.5px">
        <div style="font-weight:500">Backup file in “${escapeHtml(folder)}”</div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="radio" name="dcStateFile" value="archive" checked> Keep a copy: rename <code>finlens-state.json</code> to <code>finlens-state-backup-${dayjs().format('DDMMYYYY')}.json</code></label>
        <label style="display:flex;gap:8px;align-items:center;margin-top:4px"><input type="radio" name="dcStateFile" value="delete"> Delete <code>finlens-state.json</code></label>
        <div class="muted" style="font-size:11.5px;margin-top:4px">Either way, reconnecting this folder later starts fresh. FinLens may ask for permission to change the folder.</div>
      </div>` : ''}
    <label class="lbl" for="dcResetConfirm" style="display:block;margin-top:14px">Type <strong>RESET</strong> to confirm</label>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px">
      <input class="input" id="dcResetConfirm" autocomplete="off" spellcheck="false" style="max-width:160px">
      <button class="btn danger" id="dcResetBtn" disabled>🗑️ Start over</button>
    </div>`;
  root.appendChild(reset);

  /* ---- wiring ---- */
  root.querySelectorAll('[data-dc-action]').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.armed !== '1') {
      // First click arms the button; the second click (a fresh user gesture, which
      // file-permission prompts require) runs the action.
      b.dataset.armed = '1';
      b.textContent = 'Click again to confirm';
      setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = b.dataset.dcLabel; } }, 4000);
      return;
    }
    b.dataset.armed = '';
    b.disabled = true;
    b.textContent = 'Working…';
    try { await DataCleanup[b.dataset.dcAction](b.dataset.dcArg); }
    catch(e) { console.error('[FinLens] cleanup:', e); DataCleanup._done('bad', 'Something went wrong: ' + (e.message || e)); }
  }));

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
    const set = (id, text) => { const el = $('#' + id); if (el) el.textContent = text; };
    set('dcDbTx',   c.transactions == null ? '—' : n(c.transactions));
    set('dcDbAcct', c.accounts == null ? '—' : plural(c.accounts, 'account', 'accounts'));
    set('dcDbLog',  c.import_log == null ? '—' : plural(c.import_log, 'entry', 'entries'));
    // A folder name without a stored handle (legacy file input) can't be re-read.
    if (!(await idbGet('csvDirHandle'))) $$('[data-needs-handle]').forEach(el => el.remove());
  }, 0);
});
