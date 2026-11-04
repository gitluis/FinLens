/* ================================================================
   FINLENS — init.js
   App boot: event wiring + initialization IIFE
================================================================ */

(async function init() {

  /* ---- Theme (chart defaults) ---- */
  applyTheme();

  /* ---- App bar navigation: brand, main nav, Plan menu, ☰ menu, Settings gear ---- */
  $$('.appbar [data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      closeAppBarPopups();
      showView(link.dataset.view);
    });
  });

  /* ---- App bar menus and popovers (ui.js: open/close helpers) ---- */
  const popups = [
    ['#planBtn',  '#planMenu'],
    ['#rangeBtn', '#rangePop'],
    ['#acctBtn',  '#acctPop'],
    ['#menuBtn',  '#mobileMenu'],
  ];
  popups.forEach(([b, p]) => {
    const btn = $(b), panel = $(p);
    if (btn && panel) btn.addEventListener('click', e => { e.stopPropagation(); toggleAppBarPopup(btn, panel); });
  });
  // A click anywhere outside the open menu closes it.
  document.addEventListener('click', e => {
    if (_appBarOpen && !_appBarOpen.panel.contains(e.target) && !_appBarOpen.btn.contains(e.target)) closeAppBarPopups();
  });
  const scrim = $('#menuScrim');
  if (scrim) scrim.addEventListener('click', () => closeAppBarPopups());

  /* ---- Sync badge ---- */
  const syncBadge = $('#syncBadge');
  if (syncBadge) syncBadge.addEventListener('click', syncBadgeClick);

  /* ---- Date range popover ---- */
  $$('#rangePop [data-range]').forEach(opt => {
    opt.addEventListener('click', () => {
      if (opt.dataset.range === 'custom') {
        updateRangeUI(true);           // show the From / To fields, keep the popover open
        const cs = $('#customStart'); if (cs) cs.focus();
      } else {
        setRange(opt.dataset.range);
        closeAppBarPopups(true);
      }
    });
  });

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

  /* ---- Accounts popover ---- */
  const acctAll = $('#acctAll');
  if (acctAll) acctAll.addEventListener('click', () => {
    State.selectedAccounts = 'all';
    buildAccountFilter();
    renderActive();
  });
  const acctList = $('#acctList');
  if (acctList) acctList.addEventListener('change', e => {
    const box = e.target.closest('input[data-acct]');
    if (!box) return;
    const checked = $$('#acctList input[data-acct]').filter(i => i.checked).map(i => i.dataset.acct);
    if (!checked.length) { box.checked = true; return; }   // keep at least one account
    State.selectedAccounts = checked.length === $$('#acctList input[data-acct]').length ? 'all' : checked;
    updateAcctUI();
    renderActive();
  });

  /* ---- File pickers → Settings → Import (handleFilePick(), views-data.js) ---- */
  const folderPick = $('#folderPick');
  const filePick   = $('#filePick');
  if (folderPick) folderPick.addEventListener('change', e => { if (e.target.files.length) handleFilePick(e.target.files); folderPick.value=''; });
  if (filePick)   filePick.addEventListener('change',   e => { if (e.target.files.length) handleFilePick(e.target.files); filePick.value=''; });
  // The Welcome's "Try it with sample data" when FinLens is opened as a file (views-data.js)
  const samplePick = $('#samplePick');
  if (samplePick) samplePick.addEventListener('change', e => { if (e.target.files.length) handleSamplePick(e.target.files); samplePick.value=''; });

  /* ---- Escape closes an open app bar menu first, then the drawer ---- */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (_appBarOpen) { closeAppBarPopups(true); return; }
    closeDrawer();
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

  /* ---- Rename old account codes (v1.12.0) in State and browser storage ---- */
  // Runs every boot; once nothing old is left it changes nothing (migrate.js).
  try {
    await IdMigration.atBoot();
  } catch(e) {
    console.warn('[FinLens] Boot: account code migration failed:', e.message);
  }

  /* ---- Auto-reload CSV data from previously selected folder ---- */
  // Only needed if IndexedDB has no transactions (fresh install or DB cleared).
  // If DB already has transactions, we skip the CSV reload — data is already loaded.
  // Skipped while csvAutoImportPaused: the user cleared their transactions on purpose
  // (Settings → Data & reset), so they stay cleared until the user imports again.
  if (!State.transactions.length && !State.csvAutoImportPaused) {
    try {
      const csvHandle = await idbGet('csvDirHandle');
      if (csvHandle) {
        const perm = await csvHandle.queryPermission({ mode: 'read' });
        if (perm === 'granted') {
          await reloadFromDirHandle(csvHandle);
        } else {
          // Permission needs a user gesture: Settings → Import shows Reconnect (views-data.js)
          State._csvNeedsReconnect = true;
        }
      }
    } catch(e) {
      // Folder may have moved or handle is stale — silently ignore
      console.warn('Auto-reload CSV skipped:', e.message);
    }
  }

  /* ---- Initial render ---- */
  applyTheme();          // Chart.js is loaded by now; point its defaults at the theme tokens
  setRange('month');
  buildAccountFilter();
  showView('overview');
  // Folder access lapsed (Chromium resets it once the last tab closes): offer Reconnect.
  updateFolderBanner();

})();
