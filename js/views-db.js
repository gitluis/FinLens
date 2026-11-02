/* ================================================================
   FINLENS — views-db.js
   Database views: the DB Schema diagram and DB Inspector, the
   Settings → Database tab that shows them as sub-tabs (Clarity,
   v1.17.0), and the Changelog.
   Colors come from CSS classes in index.html (.sch-*, .dv-*), which
   read the theme tokens, so nothing here names a color.
================================================================ */

/* ══════════════════════════════════════════════════════════════
   1. DB SCHEMA DIAGRAM
   The 5 IndexedDB object stores in finlens_db, their fields and how
   they link, as an inline SVG.
══════════════════════════════════════════════════════════════ */

registerView('db-schema', 'DB Schema', (root) => {
  // hue: a .sch-* class (index.html) that sets --c (lines) and --ct (text) from the theme.
  const stores = [
    {
      id: 'transactions', hue: 'teal',
      fields: [
        { name: 'id',            type: 'string',   key: 'PK', note: 'deterministic hash' },
        { name: 'date',          type: 'Date',      key: 'IDX' },
        { name: 'yearMonth',     type: 'string',    key: 'IDX', note: 'YYYY-MM' },
        { name: 'account',       type: 'string',    key: 'IDX', note: '→ accounts.id' },
        { name: 'type',          type: 'string',    key: 'IDX', note: 'debit|credit|transfer' },
        { name: 'schemaId',      type: 'string',    key: 'IDX', note: '→ BANK_SCHEMAS.id' },
        { name: 'description',   type: 'string',    key: '' },
        { name: 'amount',        type: 'number',    key: '' },
        { name: 'categories',    type: 'string[]',  key: '' },
        { name: 'isRecurring',   type: 'boolean',   key: '' },
        { name: 'isBill',        type: 'boolean',   key: '' },
        { name: 'isSubscription',type: 'boolean',   key: '' },
        { name: '_originalDesc', type: 'string',    key: '' },
      ],
    },
    {
      id: 'tx_overrides', hue: 'warn',
      fields: [
        { name: 'txId',          type: 'string',    key: 'PK', note: '→ transactions.id' },
        { name: 'description',   type: 'string?',   key: '' },
        { name: 'categories',    type: 'string[]?', key: '' },
        { name: 'type',          type: 'string?',   key: '' },
        { name: 'notes',         type: 'string?',   key: '' },
        { name: 'isRecurring',   type: 'boolean?',  key: '' },
        { name: 'isBill',        type: 'boolean?',  key: '' },
        { name: 'isSubscription',type: 'boolean?',  key: '' },
        { name: 'accountOverride',type:'string?',   key: '' },
        { name: 'link',          type: 'object?',   key: '', note: '{type,idx}' },
        { name: 'modifiedAt',    type: 'Date',      key: '' },
      ],
    },
    {
      id: 'accounts', hue: 'sky',
      fields: [
        { name: 'id',            type: 'string',    key: 'PK', note: 'e.g. bank_checking' },
        { name: 'name',          type: 'string',    key: '' },
        { name: 'kind',          type: 'string',    key: '', note: 'bank_checking|credit_card|…' },
        { name: 'schemaId',      type: 'string',    key: '' },
        { name: 'sourceFile',    type: 'string',    key: '' },
        { name: 'displayOrder',  type: 'number',    key: '' },
        { name: 'manualBalance', type: 'number?',   key: '' },
        { name: 'creditLimit',   type: 'number?',   key: '' },
        { name: 'initialBalance',type: 'number?',   key: '' },
        { name: 'dataRangeMin',  type: 'Date?',     key: '', note: 'coverage tracking' },
        { name: 'dataRangeMax',  type: 'Date?',     key: '', note: 'coverage tracking' },
        { name: 'txCount',       type: 'number',    key: '', note: 'coverage tracking' },
      ],
    },
    {
      id: 'import_log', hue: 'violet',
      fields: [
        { name: 'id',            type: 'number',    key: 'PK', note: 'auto-increment' },
        { name: 'timestamp',     type: 'Date',      key: '' },
        { name: 'filename',      type: 'string',    key: '' },
        { name: 'accountId',     type: 'string',    key: '', note: '→ accounts.id' },
        { name: 'schemaId',      type: 'string',    key: '' },
        { name: 'rowsFound',     type: 'number',    key: '' },
        { name: 'rowsInserted',  type: 'number',    key: '' },
        { name: 'rowsSkipped',   type: 'number',    key: '' },
        { name: 'rowsRemoved',   type: 'number',    key: '', note: 'leftover duplicates' },
        { name: 'dateRangeMin',  type: 'Date',      key: '' },
        { name: 'dateRangeMax',  type: 'Date',      key: '' },
      ],
    },
    {
      id: 'app_state', hue: 'neutral',
      fields: [
        { name: 'key',           type: 'string',    key: 'PK', note: 'lsSet() key' },
        { name: 'value',         type: 'any',       key: '', note: 'JSON-serializable' },
      ],
      // The lsSet() keys the code writes (and customSchemas, which it reads).
      note: 'budgets · bills · recurring · debts · debtPlan · buckets · categories · catRules · txRules · apiKey · aiHistory · scenarios · investAlloc · manualBalances · cardDetails · txOverrides · accountOrder · accountLabels · transferKeywords · customSchemas · fileAssignments · lastFolderName · csvAutoImportPaused · sampleData · theme',
    },
  ];

  // ── Layout: three columns ────────────────────────────────────
  //   transactions | tx_overrides over accounts | import_log over app_state
  // 3 × 228 + 2 × 94 = 872px: fits Settings' 1000px page inside a panel. The gaps hold
  // the relationship labels. Text is DM Mono, about 0.6em a character.
  const W = 228, GAP = 94, ROW_H = 30, HDR_H = 44, PAD = 8, STACK = 28, NOTE_LH = 13;
  const byId = Object.fromEntries(stores.map(s => [s.id, s]));
  // Wrap a store's note into lines that fit the box (10px text ≈ 6px a character).
  const perLine = Math.floor((W - 24) / 6);
  stores.forEach(s => {
    s.lines = [];
    if (!s.note) return;
    let line = '';
    s.note.split(' · ').forEach(w => {
      const next = line ? line + ' · ' + w : w;
      if (next.length > perLine && line) { s.lines.push(line + ' ·'); line = w; } else line = next;
    });
    if (line) s.lines.push(line);
  });
  const height = (s) => HDR_H + s.fields.length * ROW_H + PAD * 2 + (s.lines.length ? s.lines.length * NOTE_LH + 8 : 0);
  const at = {
    transactions: { x: 0,               y: 0 },
    tx_overrides: { x: W + GAP,         y: 0 },
    accounts:     { x: W + GAP,         y: height(byId.tx_overrides) + STACK },
    import_log:   { x: (W + GAP) * 2,   y: 0 },
    app_state:    { x: (W + GAP) * 2,   y: height(byId.import_log) + STACK },
  };
  const totalW = W * 3 + GAP * 2;
  const totalH = Math.max(...stores.map(s => at[s.id].y + height(s))) + 2;
  const fieldY = (id, name) => at[id].y + HDR_H + PAD + byId[id].fields.findIndex(f => f.name === name) * ROW_H + ROW_H / 2;
  const esc = escapeHtml;

  let svg = '';
  stores.forEach(s => {
    const { x, y } = at[s.id];
    const h = height(s), r = 10;
    svg += `<g class="sch-${s.hue}">`;
    svg += `<rect class="box-bg" x="${x}" y="${y}" width="${W}" height="${h}" rx="${r}"/>`;
    // header band: rounded at the top only
    svg += `<path class="band" d="M${x},${y + HDR_H} V${y + r} Q${x},${y} ${x + r},${y} H${x + W - r} Q${x + W},${y} ${x + W},${y + r} V${y + HDR_H} Z"/>`;
    svg += `<line class="rule" x1="${x}" y1="${y + HDR_H}" x2="${x + W}" y2="${y + HDR_H}"/>`;
    svg += `<text class="st-name" x="${x + 14}" y="${y + 21}">${esc(s.id)}</text>`;
    svg += `<text class="st-kind" x="${x + 14}" y="${y + 35}">IndexedDB object store</text>`;
    s.fields.forEach((f, i) => {
      const fy = y + HDR_H + PAD + i * ROW_H;
      if (i % 2 === 0) svg += `<rect class="stripe" x="${x + 1}" y="${fy}" width="${W - 2}" height="${ROW_H}"/>`;
      let nameX = x + 12;
      if (f.key) {
        const bw = f.key.length * 6.5 + 8, pk = f.key === 'PK' ? ' pk' : '';
        svg += `<rect class="badge${pk}" x="${nameX}" y="${fy + 8}" width="${bw}" height="14" rx="3"/>`;
        svg += `<text class="badge-t${pk}" x="${nameX + bw / 2}" y="${fy + 18.5}" text-anchor="middle">${f.key}</text>`;
        nameX += bw + 7;
      }
      svg += `<text class="f-name" x="${nameX}" y="${fy + 19}">${esc(f.name)}</text>`;
      svg += `<text class="f-type" x="${x + W - 10}" y="${fy + (f.note ? 13 : 19)}" text-anchor="end">${esc(f.type)}</text>`;
      if (f.note) svg += `<text class="f-note" x="${x + W - 10}" y="${fy + 25}" text-anchor="end">${esc(f.note)}</text>`;
    });
    const ny = y + HDR_H + PAD + s.fields.length * ROW_H + 8;
    s.lines.forEach((l, i) => { svg += `<text class="st-note" x="${x + 14}" y="${ny + 10 + i * NOTE_LH}">${esc(l)}</text>`; });
    svg += `<rect class="box" x="${x}" y="${y}" width="${W}" height="${h}" rx="${r}"/>`;   // outline on top of the band
    svg += `</g>`;
  });

  // ── Relationships: a dashed curve from the field to the key it points at ──
  // [from store, field, to store, field, hue, label lines, label position 'above' | 'mid']
  const rels = [
    ['transactions', 'id',        'tx_overrides', 'txId', 'teal',   ['1:N', 'id → txId'],       'above'],
    ['transactions', 'account',   'accounts',     'id',   'sky',    ['N:1', 'account → id'],    'mid'],
    ['import_log',   'accountId', 'accounts',     'id',   'violet', ['N:1', 'accountId → id'],  'mid'],
  ];
  rels.forEach(([fs, ff, ts, tf, hue, label, pos]) => {
    const leftToRight = at[fs].x < at[ts].x;
    const x1 = leftToRight ? at[fs].x + W : at[fs].x, y1 = fieldY(fs, ff);
    const x2 = leftToRight ? at[ts].x : at[ts].x + W, y2 = fieldY(ts, tf);
    const mx = (x1 + x2) / 2, d = leftToRight ? -8 : 8;
    svg += `<g class="sch-${hue}">`;
    svg += `<path class="rel" d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/>`;
    svg += `<polygon class="rel-head" points="${x2},${y2} ${x2 + d},${y2 - 4} ${x2 + d},${y2 + 4}"/>`;
    const ly = pos === 'above' ? Math.min(y1, y2) - 30 : (y1 + y2) / 2 - 13;
    const lw = Math.max(...label.map(l => l.length)) * 6 + 10;
    svg += `<rect class="rel-bg" x="${mx - lw / 2}" y="${ly}" width="${lw}" height="28" rx="4"/>`;
    label.forEach((l, i) => { svg += `<text class="rel-t" x="${mx}" y="${ly + 11 + i * 12}" text-anchor="middle">${esc(l)}</text>`; });
    svg += `</g>`;
  });

  const desc = 'Diagram of the five IndexedDB object stores and their fields: transactions, tx_overrides, accounts, import_log and app_state. '
    + 'transactions.id links to tx_overrides.txId (one transaction, many edits); transactions.account and import_log.accountId each point at accounts.id.';
  appendHtml(root, `<section class="panel" aria-labelledby="schH">
    <div><h2 id="schH">Database schema</h2>
      <p class="sub">The five object stores FinLens keeps in this browser's IndexedDB database, their fields, and how they link. No server, no cloud.</p></div>
    <p class="sub sch-hint">Scroll sideways to see the whole diagram.</p>
    <div class="table-scroll sch-scroll" id="dbDiagram" tabindex="0" role="region" aria-label="Schema diagram">
      <svg class="sch" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" role="img" aria-label="${escapeHtml(desc)}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>
    </div>
    <div class="legend sch-legend">
      <span><span class="key-badge pk sch-teal">PK</span>Primary key (the store's keyPath)</span>
      <span><span class="key-badge">IDX</span>Indexed field (fast queries)</span>
      <span class="sch-neutral"><svg class="sch" width="32" height="12" aria-hidden="true"><path class="rel" d="M0,6 H24"/><polygon class="rel-head" points="32,6 24,2 24,10"/></svg>Link between stores</span>
      <span><i class="sch-opt">type?</i>Optional field (may be missing)</span>
    </div>
    <p class="trend-note">Database <code class="code-tag">finlens_db</code> · version 1 · IndexedDB in this browser. Your data stays on this device.</p>
  </section>`);
});


/* ══════════════════════════════════════════════════════════════
   2. DB INSPECTOR
   Browse any IndexedDB store: pick a store, search, page through.
   Read-only. Re-reads the store on every visit, keeping the store,
   search and page (a page past the end moves back to the last one).
══════════════════════════════════════════════════════════════ */

const DB_INSPECTOR_STORES = ['transactions', 'tx_overrides', 'accounts', 'import_log', 'app_state'];
const INSPECTOR_PAGE_SIZE = 50;
// Session memory (nothing is saved): the chosen store, search and page, and the records last read.
const DBInspector = {
  store: 'transactions',
  search: '',          // as typed; matched case-insensitively against each record's JSON
  page: 0,             // 0-based
  all: [],             // the store's records, as last read
  rows: [],            // …those that match the search
  keyPath: 'id',       // the store's key, shown first
  // The API key is in app_state (CLAUDE.md §13). Show that it's there, never its value, and
  // leave its value out of the search so typing can't reveal it a character at a time.
  isSecret: (r) => DBInspector.store === 'app_state' && r && r.key === 'apiKey',
  matches(r, q) {
    const v = this.isSecret(r) ? { key: r.key } : r;
    return JSON.stringify(v).toLowerCase().includes(q);
  },
};

registerView('db-inspector', 'DB Inspector', (root) => {
  const I = DBInspector;
  appendHtml(root, `<section class="panel" aria-labelledby="inspH">
    <div class="panel-head center"><h2 id="inspH">DB Inspector</h2><span class="pill">Read-only</span></div>
    <p class="sub" style="margin:0">The raw records in this browser's database, one store at a time. Nothing here can be changed.</p>
    <div class="form-row">
      <label class="field insp-store">Store<select class="select" id="inspStoreSelect">
        ${DB_INSPECTOR_STORES.map(s => `<option value="${s}"${s === I.store ? ' selected' : ''}>${s}</option>`).join('')}
      </select></label>
      <label class="field grow">Search<input class="input" type="search" id="inspSearch" placeholder="Any key or value contains…" value="${escapeHtml(I.search)}" autocomplete="off" spellcheck="false"></label>
      <button type="button" class="btn ghost lg" id="inspClear">Clear search</button>
      <button type="button" class="btn ghost lg" id="inspLoad" title="Read the store again">Refresh</button>
    </div>
    <p class="status-line" id="inspMeta" role="status"></p>
  </section>
  <section class="panel flush" aria-label="Records">
    <div class="table-scroll" id="inspTable"><p class="empty-note">Reading the store…</p></div>
    <div class="list-foot"><span id="inspPageInfo"></span><div class="pager" id="inspPager" role="group" aria-label="Pages"></div></div>
  </section>`);

  // Read the selected store, then draw. Runs after the render (renders stay synchronous,
  // CLAUDE.md §15) and looks its elements up again afterwards: the view may have been left.
  async function fetchAndRender() {
    const store = I.store;
    let rows = null;
    try {
      if (typeof DB !== 'undefined' && DB._db) {
        rows = await new Promise((res) => {
          const os = DB._db.transaction(store, 'readonly').objectStore(store);
          I.keyPath = typeof os.keyPath === 'string' ? os.keyPath : 'id';
          const req = os.getAll();
          req.onsuccess = () => res(req.result || []);
          req.onerror = () => res(null);
        });
      }
    } catch (e) { rows = null; }
    if (store !== I.store) return;   // another store was picked meanwhile
    const tbl = $('#inspTable');
    if (!tbl) return;
    if (!rows) {
      I.all = []; I.rows = [];
      tbl.innerHTML = `<div style="padding:20px 24px">${callout('warn', 'The browser database isn\'t available, so there is nothing to show.')}</div>`;
      const meta = $('#inspMeta'); if (meta) meta.textContent = '';
      const pi = $('#inspPageInfo'); if (pi) pi.textContent = '';
      const pg = $('#inspPager'); if (pg) pg.innerHTML = '';
      return;
    }
    I.all = rows;
    applySearch();
  }

  function applySearch() {
    const q = I.search.trim().toLowerCase();
    I.rows = q ? I.all.filter(r => I.matches(r, q)) : I.all;
    const meta = $('#inspMeta');
    if (meta) meta.textContent = `${plural(I.rows.length, 'record')} found (${I.all.length.toLocaleString()} total in store)`;
    renderPage();
  }

  // One cell. Strings are escaped; long values are cut, with the full value (up to 500
  // characters) in the cell's title.
  function cell(r, k) {
    const v = r[k];
    if (I.isSecret(r) && k === 'value') return `<td><span class="dv-hidden">Hidden: an API key is saved</span></td>`;
    let disp, full;
    if (v === null || v === undefined) disp = '<span class="dv-null">null</span>';
    else if (v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v))) {
      const d = dayjs(v);
      disp = `<span class="dv-date">${d.isValid() ? d.format('MMM D YYYY, h:mm A') : escapeHtml(String(v))}</span>`;
      full = v instanceof Date ? v.toISOString() : v;
    } else if (Array.isArray(v)) {
      full = '[' + v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ') + ']';
      disp = `<span class="dv-arr">${escapeHtml(full.slice(0, 100))}</span>`;
    } else if (typeof v === 'object') {
      full = JSON.stringify(v);
      disp = `<span class="dv-obj">${escapeHtml(full.slice(0, 80))}</span>`;
    } else if (typeof v === 'boolean') disp = `<span class="${v ? 'dv-true' : 'dv-false'}">${v}</span>`;
    else if (typeof v === 'number') disp = `<span class="dv-num">${v.toLocaleString()}</span>`;
    else { full = String(v); disp = escapeHtml(full.slice(0, 100)); }
    const title = full && full.length > 20 ? ` title="${escapeHtml(full.slice(0, 500))}"` : '';
    return `<td${title}>${disp}</td>`;
  }

  function renderPage() {
    const pages = Math.max(1, Math.ceil(I.rows.length / INSPECTOR_PAGE_SIZE));
    I.page = Math.max(0, Math.min(I.page, pages - 1));   // the store may have shrunk
    const start = I.page * INSPECTOR_PAGE_SIZE;
    const pageRows = I.rows.slice(start, start + INSPECTOR_PAGE_SIZE);
    const tbl = $('#inspTable'), info = $('#inspPageInfo'), pager = $('#inspPager');
    if (!tbl) return;
    if (info) info.textContent = I.rows.length
      ? `Page ${I.page + 1} of ${pages} · ${(start + 1).toLocaleString()}–${Math.min(start + INSPECTOR_PAGE_SIZE, I.rows.length).toLocaleString()} of ${I.rows.length.toLocaleString()}`
      : '';
    if (pager) {
      const nums = [];
      for (let p = 0; p < pages; p++) if (p === 0 || p === pages - 1 || Math.abs(p - I.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
      pager.innerHTML = pages > 1 ? `<button type="button" data-page="${I.page - 1}" id="inspPrev" aria-label="Previous page" ${I.page <= 0 ? 'disabled' : ''}>‹</button>
        ${nums.map(p => p === '…' ? '<span class="gap" aria-hidden="true">…</span>' : `<button type="button" data-page="${p}" ${p === I.page ? 'aria-current="page"' : ''} aria-label="Page ${p + 1}">${p + 1}</button>`).join('')}
        <button type="button" data-page="${I.page + 1}" id="inspNext" aria-label="Next page" ${I.page >= pages - 1 ? 'disabled' : ''}>›</button>` : '';
      $$('[data-page]', pager).forEach(b => b.onclick = () => {
        I.page = +b.dataset.page; renderPage();
        const cur = $('#inspPager [aria-current="page"]'); if (cur) cur.focus({ preventScroll: true });
      });
    }
    if (!pageRows.length) {
      const q = I.search.trim();
      tbl.innerHTML = `<p class="empty-note">${q ? `No records in ${escapeHtml(I.store)} match “${escapeHtml(q)}”.` : `${escapeHtml(I.store)} is empty.`}</p>`;
      return;
    }
    // Columns: the store's key first, then every other key on this page, in first-seen order.
    const keys = [I.keyPath];
    pageRows.forEach(r => Object.keys(r).forEach(k => { if (!keys.includes(k)) keys.push(k); }));
    const head = `<thead><tr>${keys.map(k => `<th scope="col">${escapeHtml(k)}</th>`).join('')}</tr></thead>`;
    const body = `<tbody>${pageRows.map(r => {
      const id = r[I.keyPath];
      return `<tr><th scope="row" title="${escapeHtml(String(id))}">${escapeHtml(String(id ?? ''))}</th>${keys.slice(1).map(k => cell(r, k)).join('')}</tr>`;
    }).join('')}</tbody>`;
    tbl.innerHTML = `<table class="tbl db-tbl"><caption class="sr-only">${escapeHtml(I.store)}, page ${I.page + 1} of ${pages}</caption>${head}${body}</table>`;
  }

  // Picking a store reads it; the search filters as you type (no re-read).
  $('#inspStoreSelect').onchange = (e) => { I.store = e.target.value; I.page = 0; I.all = []; I.rows = []; fetchAndRender(); };
  $('#inspSearch').oninput = debounce((e) => { I.search = e.target.value; I.page = 0; applySearch(); }, 200);
  $('#inspSearch').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); I.search = e.target.value; I.page = 0; applySearch(); } };
  $('#inspClear').onclick = () => { const s = $('#inspSearch'); s.value = ''; I.search = ''; I.page = 0; applySearch(); s.focus(); };
  $('#inspLoad').onclick = () => fetchAndRender();

  // Every visit reads the store again: rows from the last visit may be stale (an import
  // or a clear since then). The store, search and page are kept.
  setTimeout(fetchAndRender, 0);
});


/* ══════════════════════════════════════════════════════════════
   3. SETTINGS → DATABASE TAB (v1.17.0)
   DB Inspector and DB Schema as sub-tabs: a segmented tab control,
   as on Forecast (Savings / Investments), and one tabpanel the chosen
   view renders into. Both are still views of their own, so
   showView('db-inspector') and showView('db-schema') keep working.
   Kept above the Changelog block so this tab still registers if
   that block ever throws (see v1.9.4).
══════════════════════════════════════════════════════════════ */

const DB_TOOLS_TABS = [
  ['db-inspector', 'DB Inspector', 'dbTabInsp'],
  ['db-schema',    'DB Schema',    'dbTabSchema'],
];
let dbToolsTab = 'db-inspector';   // remembered for the session only, like forecastTab

registerView('db-tools', 'Database', (root) => {
  const tabs = DB_TOOLS_TABS.filter(([k]) => VIEWS[k]);
  if (!tabs.length) return;
  if (!tabs.some(([k]) => k === dbToolsTab)) dbToolsTab = tabs[0][0];
  appendHtml(root, `<div class="seg tabs-seg" role="tablist" aria-label="Database tools">${tabs.map(([k, l, id]) =>
    `<button type="button" role="tab" id="${id}" data-db-tab="${k}" aria-selected="${dbToolsTab === k}" aria-controls="dbPanel" tabindex="${dbToolsTab === k ? 0 : -1}">${l}</button>`).join('')}</div>`);
  // Arrow keys, Home and End move between the sub-tabs; focus follows.
  const pick = (k) => { dbToolsTab = k; renderActive(); const t = $(`[role="tab"][data-db-tab="${k}"]`); if (t) t.focus(); };
  const btns = $$('[data-db-tab]', root);
  btns.forEach((b, i) => {
    b.onclick = () => pick(b.dataset.dbTab);
    b.onkeydown = (e) => {
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : null;
      if (n == null) return;
      e.preventDefault(); e.stopPropagation(); pick(btns[(n + btns.length) % btns.length].dataset.dbTab);
    };
  });
  const panel = document.createElement('div');
  panel.id = 'dbPanel';
  panel.className = 'tab-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tabs.find(([k]) => k === dbToolsTab)[2]);
  root.appendChild(panel);
  VIEWS[dbToolsTab].render(panel);
});


/* ══════════════════════════════════════════════════════════════
   4. CHANGELOG
   Content embedded directly — no fetch() needed, works on file://
   UPDATE THIS BLOCK whenever CHANGELOG.md changes.
══════════════════════════════════════════════════════════════ */

// Block-comment trick: content lives inside /* ... */ so no character
// escaping is needed (backticks, dollar signs, etc. are all fine).
// Only restriction: the string must not contain the sequence  */
// Line endings are normalized first: Git for Windows (core.autocrlf) checks files out
// with CRLF, and Function.toString() returns the source as written.
const CHANGELOG_MD = (function(){/*
# FinLens Changelog

All notable changes to the FinLens personal finance dashboard are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.1] — 2026-04-27

### Navigation & Date Ranges
- **Date range selector replaced** — Removed pill-style buttons; replaced with a `<select>` dropdown in the topbar supporting 10 modes: This Week, Past Week, This Month, Last Month, Last 3 Months, Last 6 Months, YTD, Last Year, All Time, Custom. Custom mode shows inline date pickers. `setRange()` updated to handle all new modes; `describeRange()` updated with a `MODE_LABELS` map for human-readable labels.
- **Sidebar: "Invest" → "Investments"** — renamed nav label for clarity; view ID and data-section attribute unchanged.
- **Sidebar: "System" → "Configuration"** — renamed nav section header; internal `data-section="system"` unchanged to preserve compatibility.
- **Sidebar: Database section** — new sidebar section containing two new nav items: `db-schema` (Visual DB Diagram) and `db-inspector` (DB Inspector).
- **Sidebar: Changelog nav item** — added under the Configuration section.

### New Views (`js/views-db.js`)
- **DB Schema view (`db-schema`)** — SVG-based entity-relationship diagram for the `finlens_db` IndexedDB. Shows all 5 object stores (`transactions`, `tx_overrides`, `accounts`, `import_log`, `app_state`) as colored boxes with field listings, PK/IDX badges, and type annotations. Curved dashed relationship arrows connect: `transactions.id ↔ tx_overrides.txId`, `transactions.account → accounts.id`, `import_log.accountId → accounts.id`. Legend card below the diagram explains badge and arrow meanings.
- **DB Inspector view (`db-inspector`)** — Interactive browser for all IndexedDB object stores. Features: store selector dropdown, text search (filters displayed rows client-side), async IDB `getAll()` reads, paginated display (50 records/page) with Prev/Next navigation, column headers auto-derived from row keys, type-aware cell rendering (dates via Day.js, arrays in purple, booleans in teal/gray, numbers in amber mono). Load and Clear buttons for on-demand data fetching.
- **Changelog view (`changelog`)** — Changelog content embedded directly in `views-db.js` (no `fetch()` needed; works on `file://` protocol).

### Technical
- **`js/views-db.js` (new)** — Registers `db-schema`, `db-inspector`, and `changelog` views. Added to `index.html` script load order between `views-settings.js` and `init.js`.
- **FileStorage removed** — Deleted `FileStorage` object, `FS_STATE_MAP`, and `FileStorage.scheduleWrite()` call from `core.js`. Removed `FileStorage.restore()` from `init.js`. Removed File Sync card, `fsConnect()`, `fsReconnect()`, `fsSaveAll()`, `fsDisconnect()` from `views-settings.js`. The `finlens-data.json` secondary persistence path is fully retired. `idbGet`/`idbSet`/`idbDel` helpers are retained (still used for `csvDirHandle` in `views-data.js`). IndexedDB (`finlens_db` via `js/db.js`) is now the sole persistence layer beyond localStorage.

---

## [1.4.0] — 2026-04-27

### Technical — IndexedDB Migration (Phases 0–5)

- **`js/db.js` (new)** — Full IndexedDB API layer (`finlens_db` v1). Five object stores: `transactions` (immutable source records with 5 indexes), `tx_overrides` (user edits keyed by txId), `accounts` (metadata + coverage tracking), `import_log` (per-upload audit trail), `app_state` (key-value replacement for localStorage). All DB methods return Promises. `DB.open()` triggers a one-time `migrateFromLocalStorage()` on fresh install, copying all `finlens_*` localStorage keys into `app_state`. Subsequent loads use `DB.loadAll()` which restores State from IndexedDB — transactions persist across page reloads without re-upload.
- **`core.js`: Bank Schema Registry** — Added `BANK_SCHEMAS` constant array with built-in schemas for `ally_checking`, `ally_savings`, and `chase`. Each schema specifies column mappings, hash fields, `amountSign`, `dateFormat`, and `allowOccurrenceSuffix`. Added `detectSchema(headers, filename)` — filename-based disambiguation (Ally checking vs savings share identical column structure) runs before header-based `detect()` matching. Added `normalizeRow(row, schema, accountId)` — generic normalizer driven by schema config. Replaced `normalizeAllyRow()` and `normalizeChaseRow()`.
- **`core.js`: `parseCsvFile()` updated** — now calls `detectSchema()`, then `normalizeRow()` per row, then `DB.importTransactions()` + `DB.upsertAccount()` + `DB.logImport()` when IndexedDB is ready. Returns normalized txs for current-session in-memory use (unchanged API for `loadFiles()`).
- **`core.js`: `parseDate()` updated** — now accepts an optional `format` parameter (`'MM/DD/YYYY'` | `'DD/MM/YYYY'` | `'YYYY-MM-DD'`), defaulting to `'MM/DD/YYYY'`. Format-aware regex parsing replaces the ambiguous `new Date(s)` call for slash-delimited date strings.
- **`core.js`: `lsSet()` updated** — now also calls `DB.setState(key, value)` fire-and-forget when IndexedDB is ready, keeping `app_state` in sync with every localStorage write.
- **`core.js`: `detectTransfers()` updated** — transfer keyword regex is now built from `State.transferKeywords` (user-editable) instead of a hardcoded string. Falls back to `DEFAULT_TRANSFER_KEYWORDS` if empty.
- **`core.js`: `State.transferKeywords`** — new persisted field (`string[]`). Default: `['transfer','zelle','ach','venmo','paypal','coinbase','savings booster']`.
- **`core.js`: `State.customSchemas`** — new persisted field for user-defined bank schemas. Merged into `BANK_SCHEMAS` at boot by `DB.loadAll()`.
- **`db.js`: Occurrence suffix** — `DB.importTransactions()` handles truly identical Chase rows (same date/postDate/description/amount) by appending `_2`, `_3`, ... to the transaction ID. Batch is sorted by `(date, description, amount)` before insert for stable suffix assignment across re-uploads. Ally schemas have `allowOccurrenceSuffix: false`; duplicate Ally rows are silently skipped.
- **`db.js`: Gap detection** — `DB.importTransactions()` compares the incoming file's earliest date against the account's current `dataRangeMax`. If the gap exceeds 2 days, a `gapWarning: { from, to }` is returned and surfaced in the Data tab result card.
- **`db.js`: Coverage tracking** — `DB._updateAccountCoverage()` updates `dataRangeMin`, `dataRangeMax`, and `txCount` on the accounts store after every import. `DB.getCoverage()` reads this for the Data tab's permanent coverage table.
- **`init.js`: Async boot** — `DB.open()` then `DB.loadAll()` run before the first render. CSV auto-reload is skipped when IndexedDB already has transactions.
- **`views-data.js`: Coverage Summary card** — permanent card showing first transaction date, latest date, and total count per account from `DB.getCoverage()`.
- **`views-data.js`: Post-Upload Result card** — shown after each CSV import with rows inserted/skipped, file date range, total DB coverage, "Next upload: start from [date]" guidance, and gap warning when applicable.
- **`views-data.js`: Import Log card** — collapsible history table. Columns: When, File, Account, Schema, Found, New, Skipped, File Range.
- **`views-settings.js`: IndexedDB Status card** — primary storage section. Shows DB readiness, transaction count, and Export/Import JSON backup buttons.
- **`views-settings.js`: Transfer Keywords card** — new card for editing `State.transferKeywords`. Shows current keywords as removable chips, text input + Add button, and a "Re-apply to All Transactions" button.

---

## [1.3.9] — 2026-04-27

### Technical
- **`core.js`: Ally transaction hash now includes Time** — `normalizeAllyRow()` reads the `Time` column (HH:MM:SS, bank-assigned) and passes it to `mkTx()`. The hash for Ally transactions is now `hash(date|time|desc|amount|account)`, eliminating the risk of identical same-day charges colliding into a single transaction ID.
- **`core.js`: Chase transaction hash now includes Post Date** — The hash for Chase transactions is `hash(txDate|postDate|desc|amount|account)`. Note: truly identical Chase rows still collide; occurrence-suffix dedup is handled in the IndexedDB implementation.
- **`core.js`: Removed dead Ally balance-reading code** — Ally does not export a running balance; `mkTx()` now hardcodes `balance: null` unconditionally for all sources.

---

## [1.3.8] — 2026-04-27

### General
- **New "Invest" sidebar section** — "Investing Ideas" and "Forecast Investments" are now grouped under their own collapsible "Invest" nav section, separate from "Insight".

### Spending
- **"Other" filtered from charts** — the By Category bar chart and Category Ranking horizontal bar no longer include the "Other" / uncategorized bucket.
- **Removed "View All Expenses" table** — the category drill-down and the Transactions tab serve this purpose better.

### Savings Buckets
- **Bucket detail drawer** — clicking anywhere on a bucket card opens a side drawer with current vs goal KPIs, progress bar, and a table of linked transactions.
- **No-goal display cleanup** — buckets with no goal set no longer show "0% complete" or an empty progress bar.

---

## [1.3.7] — 2026-04-27

### General
- **CSV auto-reload on startup** — `init.js` now checks IndexedDB for a stored `csvDirHandle` and silently reloads all CSV transactions on page load if folder permission is still granted.

### Transactions
- **"Debit" renamed to "Expense"** — the type chip, bulk-type dropdown, type filter, and transaction-edit drawer all now say "Expense" instead of "Debit". Internal type value `'debit'` is unchanged.
- **Search clear button** — a X button now appears inside the search field whenever there is text.
- **Transaction Rules** — new card at the bottom of the Transactions view. Rules auto-flag transactions as Bill, Subscription, or Recurring when their description contains a keyword. Stored in `State.txRules`.

### Spending
- **"By Category" — vertical bar chart** — replaced the doughnut chart. Click any bar to drill into that category's transactions.
- **"Category Ranking" — horizontal bar chart** — replaced progress bars. Click any bar to drill into that category.

---

## [1.3.6] — 2026-04-26

### General
- **Filter persistence fix** — fixed a bug where selecting "All Accounts" set `State.selectedAccounts` to `[]` instead of `'all'`, causing zero transactions to display.

### Overview
- **CC debt displayed as positive** — Chase account balance card now shows `Math.abs(bal)`.
- **CC sparklines in red** — the 30-day area sparkline for Chase accounts renders with red stroke and fill.
- **Bulk edit transaction type** — the bulk-selection bar now includes a "Set type" dropdown and an "Apply Type" button.

---

## [1.3.5] — 2026-04-26

### General
- **Collapsible sidebar sections** — the four nav groups are now collapsible. State is saved to `localStorage`.

### Overview
- **Upcoming bills** — replaced the calendar widget with a compact table showing the 5 soonest unpaid bills.
- **Merged Recent Transactions panel** — single "Recent Transactions" card showing the 5 most recent across all accounts.
- **Editable KPI card titles** — double-click any account KPI card title to rename it inline. Custom names persist to `State.accountLabels`.

### Transactions
- **Bulk select** — each transaction row has a checkbox. When items are selected, a bulk-action bar appears with options to apply a category, mark as Bill/Subscription, or clear.
- **Link to Budget / Bucket / Debt** — the transaction edit drawer now has a "Link to" section to associate a transaction with an existing budget, savings bucket, or debt entry.

---

## [1.3.4] — 2026-04-26

### Data
- **Account reordering** — each row in the Loaded Files card has up/down buttons to set display order. Saved to `localStorage` as `accountOrder`.

### Overview
- **KPI cards follow account order** — account balance cards rendered using `orderedAccounts()`.

---

## [1.3.3] — 2026-04-26

### Bills
- **Transaction table no longer blank** — fixed two root causes: regex requiring trailing whitespace after "GAS"/"PHONE" keywords (replaced with word-boundary-aware patterns), and exact-match category list that missed Chase category names (replaced with keyword regex `BILL_CAT_KW`).

---

## [1.3.2] — 2026-04-26

### Overview
- **Date-range aware balances** — account KPI cards now compute the balance at end of the selected period.

### Transactions
- **Type filter added** — new dropdown: All Types / Income / Debit / Transfer in / Transfer out.
- **Transfer chip colors** — "Transfer in" chip uses green; "Transfer out" uses red.

---

## [1.3.1] — 2026-04-25

### Bug Fixes
- **Custom date range** — date inputs from `<input type="date">` return strings; converted to proper `Date` objects in `setRange()`.
- **Bills tab blank** — changed from `filteredTx()` to `State.transactions` (all-time) so bills always show regardless of the period selector.
- **Spending drill-down** — replaced inline `onclick` strings with `data-sp-cat-idx` attributes to avoid escaping issues.

---

## [1.3.0] — 2026-04-25

### General
- **Favicon** — added SVG bookmark icon (teal square with "FL").
- **Chart overflow fix** — sparkline canvases now wrapped in `.spark-wrap` div with explicit 64px height.

### Transactions
- **Transfer in / Transfer out** — transfers labeled by direction. Outgoing: `Transfer out`; incoming: `Transfer in`.

### Income
- **Returns / Refunds KPI** — positive-amount transactions from Chase Shopping/Merchandise category auto-classified as Returns.
- **Interest Earned KPI** — separate KPI card for interest payments.

### Bills
- **No longer blank** — broad keyword match in addition to category tags.

### Transfers
- **FROM / TO filters** — dropdown filters above the Transfer History table.

---

## [1.2.0] — 2026-04-25

### New Features
- **Local File Storage (File System Access API)** — FinLens could save settings, budgets, and preferences to a `finlens-data.json` file. *(Removed in v1.4.1 — IndexedDB is now the sole persistence layer.)*

---

## [1.1.0] — 2026-04-25

### Architecture
- Split monolithic `index.html` into a multi-file structure: `core.js`, `ui.js`, and six view modules (`views-main.js`, `views-plan.js`, `views-invest.js`, `views-forecast.js`, `views-ai.js`, `views-data.js`), plus `views-settings.js` and `init.js`.

### New Features
- **Forecast Investments tab** — project portfolio growth with starting amount, monthly contributions, horizon slider, return presets, and year-by-year breakdown table.
- **Data tab** — dedicated file management screen with manual file-to-account assignment UI, grouped account balance inputs, initial balance fields, and credit limit inputs.
- **Settings tab** — retains Categories, API Key, Backup & Restore, and Display settings.

---

## [1.0.0] — 2026-04-01

### Initial Release
- Single-file `index.html` dashboard with embedded CSS and JavaScript.
- Tabs: Overview, Transactions, Income, Bills & Subs, Spending, Transfers, Budgeting, Savings Buckets, Debt Tracker, Trends & Insights, Investing Ideas, Forecast, AI Analysis, Settings & Data.
- CSV import for Ally Checking, Ally Savings, and Chase credit card files.
- AI Analysis powered by Claude (Anthropic API key required).
- LocalStorage persistence for budgets, buckets, debts, bills, categories, AI history, manual balances, and settings.
- Light/dark theme toggle.
- Savings forecast simulator with scenario save/load.
- Debt payoff simulator (avalanche vs. snowball).
- Recurring transaction detection.
*/}).toString().replace(/\r\n?/g, '\n').match(/\/\*\n([\s\S]*)\n\*\//)?.[1] ?? '_The changelog text could not be read._';

registerView('changelog', 'Changelog', (root) => {

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="section-title">Changelog</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Version history for FinLens.</p>
    <div id="changelogOutline" style="margin-top:12px;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)"></div>
    <div id="changelogBody" style="margin-top:16px"></div>`;
  root.appendChild(card);

  setTimeout(() => {
    const body = document.getElementById('changelogBody');
    const outline = document.getElementById('changelogOutline');
    if (!body) return;
    if (typeof marked !== 'undefined') {
      body.innerHTML = `<div style="font-size:13.5px;line-height:1.7;max-width:820px">${renderMarkdown(CHANGELOG_MD)}</div>`;

      // Extract h2 headers for outline
      const h2s = body.querySelectorAll('h2');
      if (h2s.length > 0) {
        const outlineLinks = Array.from(h2s).map((h, i) => {
          const text = h.textContent.trim();
          const id = `v-${i}`;
          h.id = id;  // Add id to header for anchor linking
          return `<a href="#${id}" style="display:inline-block;margin:4px 8px 4px 0;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--teal);font-size:12px;transition:all 0.2s">${escapeHtml(text)}</a>`;
        }).join('');
        outline.innerHTML = outlineLinks;
      }

      body.querySelectorAll('h2').forEach(h => {
        h.style.cssText = 'margin-top:28px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border);font-size:15px;color:var(--text)';
      });
      body.querySelectorAll('h3').forEach(h => {
        h.style.cssText = 'margin-top:16px;margin-bottom:4px;font-size:13px;color:var(--text-2);font-weight:600';
      });
      body.querySelectorAll('ul').forEach(ul => {
        ul.style.cssText = 'padding-left:18px;margin:6px 0';
      });
      body.querySelectorAll('li').forEach(li => {
        li.style.cssText = 'margin:4px 0;font-size:13px;color:var(--text-2)';
      });
      body.querySelectorAll('code').forEach(c => {
        c.style.cssText = 'background:var(--surface-2);border:1px solid var(--border);padding:1px 5px;border-radius:4px;font-size:11.5px;font-family:var(--font-mono,monospace)';
      });
      body.querySelectorAll('strong').forEach(s => {
        s.style.cssText = 'color:var(--text);font-weight:600';
      });
    } else {
      body.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;color:var(--text-2)">${escapeHtml(CHANGELOG_MD)}</pre>`;
    }
  }, 0);
});
