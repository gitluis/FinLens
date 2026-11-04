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
   The 5 IndexedDB object stores in app_data, their fields and how
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
        { name: 'link',          type: 'object?',   key: '', note: '{type,id}' },
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
      note: 'budgets · bills · recurring · debts · debtPlan · buckets · categories · catRules · ruleCategories · txRules · apiKey · aiHistory · scenarios · investAlloc · manualBalances · cardDetails · txOverrides · accountOrder · accountLabels · transferKeywords · customSchemas · fileAssignments · lastFolderName · csvAutoImportPaused · sampleData · theme',
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
    <p class="trend-note">Database <code class="code-tag">app_data</code> · version 1 · IndexedDB in this browser. Your data stays on this device.</p>
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
   Reads CHANGELOG.md (next to index.html) each time the view opens, so it always
   matches the file (v1.16.15). Before, it showed a copy embedded here, which nobody
   updated after v1.4.1. A page opened as a file (file://) can't read other files, so
   there it says where the changelog is instead.
══════════════════════════════════════════════════════════════ */

registerView('changelog', 'Changelog', (root) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="section-title">Changelog</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Version history for FinLens, from <code>CHANGELOG.md</code>.</p>
    <div id="changelogOutline" style="margin-top:12px;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)" hidden></div>
    <div id="changelogBody" style="margin-top:16px"><p class="muted" style="font-size:13px">Reading CHANGELOG.md…</p></div>`;
  root.appendChild(card);
  loadChangelog($('#changelogBody', card), $('#changelogOutline', card));
});

// Fetch CHANGELOG.md and render it into the Changelog view. Browsers don't let a page
// opened from file:// fetch files (Chrome, Edge and Firefox refuse and log an error), so
// it isn't tried there. Any failure shows a note pointing to the file.
async function loadChangelog(body, outline) {
  let md = '';
  if (location.protocol !== 'file:') {
    try {
      const r = await fetch('CHANGELOG.md', { cache: 'no-cache' });
      if (r.ok) md = (await r.text()).replace(/\r\n?/g, '\n');   // CRLF checkouts (Git for Windows)
    } catch (e) { /* offline or blocked: the note below */ }
  }
  if (!body.isConnected) return;   // the view was left before the file arrived
  if (!md.trim()) {
    body.innerHTML = `<div class="callout plain" role="status" id="changelogNote"><span>The version history is in <strong>CHANGELOG.md</strong>, in the FinLens folder next to <code>index.html</code>. Open that file to read it.${location.protocol === 'file:' ? ' FinLens is opened as a file here, and browsers don\'t let a page opened that way read other files.' : ' FinLens couldn\'t load it from this address.'}</span></div>`;
    return;
  }
  if (typeof marked === 'undefined') {
    body.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;color:var(--text-2)">${escapeHtml(md)}</pre>`;
    return;
  }
  // The file's own "# FinLens Changelog" is left out: the shell's title is the page's one H1.
  body.innerHTML = `<div style="font-size:13.5px;line-height:1.7;max-width:820px">${renderMarkdown(md.replace(/^# [^\n]*\n+/, ''))}</div>`;

  // An outline of the versions (one link per h2)
  const h2s = $$('h2', body);
  if (h2s.length) {
    outline.innerHTML = h2s.map((h, i) => {
      h.id = `v-${i}`;
      return `<a href="#v-${i}" style="display:inline-block;margin:4px 8px 4px 0;padding:4px 10px;background:var(--surface);border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--teal);font-size:12px;transition:all 0.2s">${escapeHtml(h.textContent.trim())}</a>`;
    }).join('');
    outline.hidden = false;
  }

  $$('h2', body).forEach(h => {
    h.style.cssText = 'margin-top:28px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid var(--border);font-size:15px;color:var(--text)';
  });
  $$('h3', body).forEach(h => {
    h.style.cssText = 'margin-top:16px;margin-bottom:4px;font-size:13px;color:var(--text-2);font-weight:600';
  });
  $$('ul', body).forEach(ul => {
    ul.style.cssText = 'padding-left:18px;margin:6px 0';
  });
  $$('li', body).forEach(li => {
    li.style.cssText = 'margin:4px 0;font-size:13px;color:var(--text-2)';
  });
  $$('code', body).forEach(c => {
    c.style.cssText = 'background:var(--surface-2);border:1px solid var(--border);padding:1px 5px;border-radius:4px;font-size:11.5px;font-family:var(--font-mono,monospace)';
  });
  $$('strong', body).forEach(s => {
    s.style.cssText = 'color:var(--text);font-weight:600';
  });
}
