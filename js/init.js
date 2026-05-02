/* ================================================================
   FINLENS — init.js
   App boot: event wiring + initialization IIFE
================================================================ */

(async function init() {

  /* ---- Theme ---- */
  applyTheme();

  /* ---- Sidebar nav clicks ---- */
  document.querySelectorAll('a.nav[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showView(link.dataset.view);
    });
  });

  /* ---- Date range select ---- */
  const rangeSelect = $('#rangeSelect');
  if (rangeSelect) {
    rangeSelect.addEventListener('change', () => {
      const r = rangeSelect.value;
      if (r === 'custom') {
        const cs = $('#customStart');
        const ce = $('#customEnd');
        if (cs) cs.style.display = 'inline-block';
        if (ce) ce.style.display = 'inline-block';
      } else {
        const cs = $('#customStart');
        const ce = $('#customEnd');
        if (cs) cs.style.display = 'none';
        if (ce) ce.style.display = 'none';
        setRange(r);
      }
    });
  }

  /* ---- Custom date range ---- */
  const customStart = $('#customStart');
  const customEnd   = $('#customEnd');
  function applyCustomRange() {
    if (customStart && customEnd && customStart.value && customEnd.value) {
      setRange('custom', customStart.value, customEnd.value);
    }
  }
  if (customStart) customStart.addEventListener('change', applyCustomRange);
  if (customEnd)   customEnd.addEventListener('change',   applyCustomRange);

  /* ---- Account filter ---- */
  const acctFilter = $('#acctFilter');
  if (acctFilter) {
    acctFilter.addEventListener('change', () => {
      const val = acctFilter.value;
      State.selectedAccounts = val === 'all' ? 'all' : [val];
      renderActive();
    });
  }

  /* ---- Theme toggle ---- */
  const themeToggle = $('#themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      State.theme = State.theme === 'dark' ? 'light' : 'dark';
      lsSet('theme', State.theme);
      applyTheme();
      renderActive();
    });
  }

  /* ---- File pickers → data tab ---- */
  const folderPick = $('#folderPick');
  const filePick   = $('#filePick');
  if (folderPick) folderPick.addEventListener('change', e => { if (e.target.files.length) handleFilePick(e.target.files); folderPick.value=''; });
  if (filePick)   filePick.addEventListener('change',   e => { if (e.target.files.length) handleFilePick(e.target.files); filePick.value=''; });

  /* ---- Escape key closes drawer ---- */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
  });

  /* ---- Open IndexedDB first (always) — DB views depend on DB._db being ready ---- */
  try {
    await DB.open();
  } catch(e) {
    console.warn('[FinLens] Boot: IndexedDB open failed:', e.message);
  }

  /* ---- Load persisted state: filesystem → IndexedDB → localStorage ---- */
  // Try filesystem (finlens-state.json) first — this is the source of truth
  const fsState = await loadStateFromFile();
  if (fsState) {
    // Merge filesystem state into State object
    Object.assign(State, fsState);
    console.log('[FinLens] Boot: Loaded state from finlens-state.json —', State.transactions.length, 'transactions');
  } else {
    // Fall back to IndexedDB
    // DB.loadAll() populates State from IndexedDB — budgets, bills, settings, AND
    // transactions (so the user does not need to re-upload CSVs after a page refresh).
    try {
      await DB.loadAll();
      console.log('[FinLens] Boot: Loaded state from IndexedDB —', State.transactions.length, 'transactions');
    } catch(e) {
      console.warn('[FinLens] Boot: IndexedDB load failed, continuing with localStorage fallback:', e.message);
    }
  }

  /* ---- Auto-reload CSV data from previously selected folder ---- */
  // Only needed if IndexedDB has no transactions (fresh install or DB cleared).
  // If DB already has transactions, we skip the CSV reload — data is already loaded.
  if (!State.transactions.length) {
    try {
      const csvHandle = await idbGet('csvDirHandle');
      if (csvHandle) {
        const perm = await csvHandle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          await reloadFromDirHandle(csvHandle);
        } else {
          // Permission needs a user gesture — mark so Data tab can show reconnect UI
          State._csvNeedsReconnect = true;
        }
      }
    } catch(e) {
      // Folder may have moved or handle is stale — silently ignore
      console.warn('Auto-reload CSV skipped:', e.message);
    }
  }

  /* ---- Initial render ---- */
  setRange('month');
  buildAccountFilter();
  showView('overview');

})();
