/* ================================================================
   FINLENS — views-db.js
   Database views: Schema Diagram, DB Inspector, Changelog
================================================================ */

/* ══════════════════════════════════════════════════════════════
   1. DB SCHEMA DIAGRAM
   Visual ERD of all 5 IndexedDB stores with fields and relationships
══════════════════════════════════════════════════════════════ */

registerView('db-schema', 'DB Schema', (root) => {

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h2 class="section-title">Database Schema & Inspector</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">
      All data stored locally in your browser. No server, no cloud. Five object stores with relationships shown below.
    </p>`;
  root.appendChild(card);

  const diagramCard = document.createElement('div');
  diagramCard.className = 'card';
  diagramCard.style.padding = '0';
  diagramCard.style.overflow = 'hidden';

  // Build the diagram as an SVG embedded in HTML
  diagramCard.innerHTML = `<div id="dbDiagram" style="width:100%;overflow-x:auto;padding:24px"></div>`;
  root.appendChild(diagramCard);

  setTimeout(() => {
    const holder = document.getElementById('dbDiagram');
    if (!holder) return;

    // ── Store definitions ──────────────────────────────────────
    const stores = [
      {
        id: 'transactions',
        label: 'transactions',
        color: 'var(--teal)',
        colorSoft: 'var(--teal-soft)',
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
        id: 'tx_overrides',
        label: 'tx_overrides',
        color: 'var(--amber)',
        colorSoft: 'var(--amber-soft)',
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
        id: 'accounts',
        label: 'accounts',
        color: 'var(--blue)',
        colorSoft: 'rgba(59,130,246,.08)',
        fields: [
          { name: 'id',            type: 'string',    key: 'PK', note: 'e.g. bank_checking' },
          { name: 'name',          type: 'string',    key: '' },
          { name: 'kind',          type: 'string',    key: '', note: 'checking|savings|credit|…' },
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
        id: 'import_log',
        label: 'import_log',
        color: 'var(--purple)',
        colorSoft: 'rgba(139,92,246,.08)',
        fields: [
          { name: 'id',            type: 'number',    key: 'PK', note: 'auto-increment' },
          { name: 'timestamp',     type: 'Date',      key: '' },
          { name: 'filename',      type: 'string',    key: '' },
          { name: 'accountId',     type: 'string',    key: '', note: '→ accounts.id' },
          { name: 'schemaId',      type: 'string',    key: '' },
          { name: 'rowsFound',     type: 'number',    key: '' },
          { name: 'rowsInserted',  type: 'number',    key: '' },
          { name: 'rowsSkipped',   type: 'number',    key: '' },
          { name: 'dateRangeMin',  type: 'Date',      key: '' },
          { name: 'dateRangeMax',  type: 'Date',      key: '' },
        ],
      },
      {
        id: 'app_state',
        label: 'app_state',
        color: 'var(--text-2)',
        colorSoft: 'var(--surface-2)',
        fields: [
          { name: 'key',           type: 'string',    key: 'PK', note: 'lsSet() key' },
          { name: 'value',         type: 'any',       key: '', note: 'JSON-serializable' },
        ],
        note: 'budgets · bills · debts · buckets · categories · apiKey · aiHistory · scenarios · investAlloc · debtPlan · manualBalances · txOverrides · accountOrder · accountLabels · categoryRules · txRules · transferKeywords · customSchemas · fileAssignments · theme',
      },
    ];

    // ── Layout: 3-column grid ──────────────────────────────────
    // Col 0: transactions (tall)
    // Col 1: tx_overrides, accounts
    // Col 2: import_log, app_state
    const COL_W = 260;
    const COL_GAP = 80;
    const ROW_H = 28;
    const HDR_H = 40;
    const FIELD_PAD = 8;

    function storeHeight(s) {
      return HDR_H + s.fields.length * ROW_H + FIELD_PAD * 2 + (s.note ? 32 : 0);
    }

    const layout = {
      transactions:  { col: 0, row: 0 },
      tx_overrides:  { col: 1, row: 0 },
      accounts:      { col: 1, row: 1 },
      import_log:    { col: 2, row: 0 },
      app_state:     { col: 2, row: 1 },
    };

    // Compute X positions
    const colX = [0, COL_W + COL_GAP, (COL_W + COL_GAP) * 2];

    // Compute Y positions per (col, row)
    const colRowY = { '1_0': 0, '1_1': 0, '2_0': 0, '2_1': 0 };
    const txH = storeHeight(stores[0]);
    colRowY['1_0'] = 0;
    colRowY['1_1'] = storeHeight(stores[1]) + 32;
    colRowY['2_0'] = 0;
    colRowY['2_1'] = storeHeight(stores[3]) + 32;

    function boxPos(storeId) {
      const l = layout[storeId];
      const x = colX[l.col];
      let y = 0;
      if (l.col === 0) y = 0;
      else y = colRowY[`${l.col}_${l.row}`];
      return { x, y };
    }

    const totalW = COL_W * 3 + COL_GAP * 2;
    const totalH = Math.max(
      storeHeight(stores[0]),
      storeHeight(stores[1]) + 32 + storeHeight(stores[2]),
      storeHeight(stores[3]) + 32 + storeHeight(stores[4])
    );

    // ── SVG builder ──────────────────────────────────────────────
    let svg = `<svg viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg" style="font-family:var(--font-mono,monospace);display:block;min-width:${totalW}px">`;

    // Draw each store box
    stores.forEach(s => {
      const { x, y } = boxPos(s.id);
      const h = storeHeight(s);

      // Box shadow / background
      svg += `<rect x="${x}" y="${y}" width="${COL_W}" height="${h}" rx="10" ry="10"
        fill="var(--surface)" stroke="${s.color}" stroke-width="1.5"/>`;

      // Header band
      svg += `<rect x="${x}" y="${y}" width="${COL_W}" height="${HDR_H}" rx="10" ry="10"
        fill="${s.colorSoft}"/>`;
      // Mask bottom corners of header
      svg += `<rect x="${x}" y="${y + HDR_H - 10}" width="${COL_W}" height="10" fill="${s.colorSoft}"/>`;

      // Header divider
      svg += `<line x1="${x}" y1="${y + HDR_H}" x2="${x + COL_W}" y2="${y + HDR_H}"
        stroke="${s.color}" stroke-width="1" opacity="0.5"/>`;

      // Store name
      svg += `<text x="${x + 14}" y="${y + 25}" font-size="13" font-weight="700" fill="${s.color}">${s.label}</text>`;
      svg += `<text x="${x + 14}" y="${y + 37}" font-size="10" fill="var(--text-3)">IndexedDB Object Store</text>`;

      // Fields
      s.fields.forEach((f, i) => {
        const fy = y + HDR_H + FIELD_PAD + i * ROW_H;
        const isKey = f.key === 'PK' || f.key === 'IDX';

        // Row hover band (every other)
        if (i % 2 === 0) {
          svg += `<rect x="${x + 1}" y="${fy}" width="${COL_W - 2}" height="${ROW_H}"
            fill="var(--surface-2)" opacity="0.5"/>`;
        }

        // Key badge
        if (f.key) {
          const badgeColor = f.key === 'PK' ? s.color : 'var(--text-3)';
          svg += `<rect x="${x + 14}" y="${fy + 7}" width="${f.key.length * 7 + 6}" height="14"
            rx="3" fill="${badgeColor}" opacity="${f.key === 'PK' ? '1' : '0.3'}"/>`;
          svg += `<text x="${x + 17}" y="${fy + 18}" font-size="9" font-weight="700"
            fill="${f.key === 'PK' ? 'white' : 'var(--text-2)'}">${f.key}</text>`;
        }

        const nameX = f.key ? x + 14 + (f.key.length * 7 + 14) : x + 14;
        svg += `<text x="${nameX}" y="${fy + 19}" font-size="11.5" fill="var(--text)"
          font-family="var(--font-mono,'DM Mono',monospace)">${f.name}</text>`;

        // Type (right-aligned)
        const typeStr = f.type + (f.note ? '' : '');
        svg += `<text x="${x + COL_W - 10}" y="${fy + 19}" font-size="10" fill="var(--text-3)"
          text-anchor="end" font-style="italic">${typeStr}</text>`;

        // Note tooltip (small below type)
        if (f.note) {
          svg += `<text x="${x + COL_W - 10}" y="${fy + 19}" font-size="9" fill="${s.color}"
            text-anchor="end" dy="11" opacity="0.7">${f.note}</text>`;
        }
      });

      // Store note (description of keys)
      if (s.note) {
        const noteY = y + HDR_H + FIELD_PAD + s.fields.length * ROW_H + 6;
        // Wrap note text
        const words = s.note.split(' · ');
        const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' · ');
        const line2 = words.slice(Math.ceil(words.length / 2)).join(' · ');
        svg += `<text x="${x + 14}" y="${noteY + 10}" font-size="9" fill="var(--text-3)"
          font-style="italic">${escapeHtml(line1)}</text>`;
        svg += `<text x="${x + 14}" y="${noteY + 21}" font-size="9" fill="var(--text-3)"
          font-style="italic">${escapeHtml(line2)}</text>`;
      }
    });

    // ── Relationship arrows ──────────────────────────────────────
    // transactions.id  ←→  tx_overrides.txId
    {
      const from = boxPos('transactions');
      const to   = boxPos('tx_overrides');
      // transactions right edge, vertically at 'id' field
      const x1 = from.x + COL_W;
      const y1 = from.y + HDR_H + FIELD_PAD + 0 * ROW_H + 14;
      const x2 = to.x;
      const y2 = to.y + HDR_H + FIELD_PAD + 0 * ROW_H + 14;
      const mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"
        stroke="var(--teal)" stroke-width="1.5" fill="none" stroke-dasharray="5,3" opacity="0.7"/>`;
      // Arrow head
      svg += `<polygon points="${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}"
        fill="var(--teal)" opacity="0.7"/>`;
      // Label
      svg += `<text x="${mx}" y="${Math.min(y1, y2) - 6}" font-size="9" fill="var(--teal)"
        text-anchor="middle" opacity="0.9">1:N  id → txId</text>`;
    }

    // transactions.account  →  accounts.id
    {
      const from = boxPos('transactions');
      const to   = boxPos('accounts');
      const accountFieldIdx = stores[0].fields.findIndex(f => f.name === 'account');
      const x1 = from.x + COL_W;
      const y1 = from.y + HDR_H + FIELD_PAD + accountFieldIdx * ROW_H + 14;
      const x2 = to.x;
      const y2 = to.y + HDR_H + FIELD_PAD + 0 * ROW_H + 14;
      const mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"
        stroke="var(--blue)" stroke-width="1.5" fill="none" stroke-dasharray="5,3" opacity="0.7"/>`;
      svg += `<polygon points="${x2},${y2} ${x2 - 8},${y2 - 4} ${x2 - 8},${y2 + 4}"
        fill="var(--blue)" opacity="0.7"/>`;
      svg += `<text x="${mx}" y="${(y1 + y2) / 2 - 6}" font-size="9" fill="var(--blue)"
        text-anchor="middle" opacity="0.9">N:1  account → id</text>`;
    }

    // import_log.accountId  →  accounts.id
    {
      const from = boxPos('import_log');
      const to   = boxPos('accounts');
      const acctFieldIdx = stores[3].fields.findIndex(f => f.name === 'accountId');
      const x1 = from.x;
      const y1 = from.y + HDR_H + FIELD_PAD + acctFieldIdx * ROW_H + 14;
      const x2 = to.x + COL_W;
      const y2 = to.y + HDR_H + FIELD_PAD + 0 * ROW_H + 14;
      const mx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"
        stroke="var(--purple)" stroke-width="1.5" fill="none" stroke-dasharray="5,3" opacity="0.7"/>`;
      svg += `<polygon points="${x2},${y2} ${x2 + 8},${y2 - 4} ${x2 + 8},${y2 + 4}"
        fill="var(--purple)" opacity="0.7"/>`;
      svg += `<text x="${mx}" y="${(y1 + y2) / 2 - 6}" font-size="9" fill="var(--purple)"
        text-anchor="middle" opacity="0.9">N:1  accountId → id</text>`;
    }

    svg += `</svg>`;
    holder.innerHTML = svg;

    // ── Legend card ──────────────────────────────────────────────
    const legend = document.createElement('div');
    legend.className = 'card';
    legend.style.marginTop = '0';
    legend.innerHTML = `
      <h2 class="section-title">Legend</h2>
      <div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:10px;font-size:12.5px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;padding:2px 8px;background:var(--teal);color:white;border-radius:3px;font-size:10px;font-weight:700">PK</span>
          Primary Key (keyPath)
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="display:inline-block;padding:2px 8px;background:var(--text-3);opacity:.6;color:white;border-radius:3px;font-size:10px;font-weight:700">IDX</span>
          Indexed field (fast queries)
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <svg width="32" height="12"><path d="M0,6 C8,6 24,6 32,6" stroke="var(--text-2)" stroke-width="1.5" fill="none" stroke-dasharray="5,3"/><polygon points="32,6 24,3 24,9" fill="var(--text-2)"/></svg>
          Foreign key relationship
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-3);font-style:italic">type?</span>
          Optional field (may be null)
        </div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:var(--text-3)">
        Database: <code>finlens_db</code> · Version: <code>1</code> · Storage: IndexedDB (browser-native) · All data stays on your device.
      </div>`;
    root.appendChild(legend);
  }, 0);
});


/* ══════════════════════════════════════════════════════════════
   2. DB INSPECTOR
   Browse any IndexedDB store — select store, search, paginate
══════════════════════════════════════════════════════════════ */

const DB_INSPECTOR_STORES = ['transactions', 'tx_overrides', 'accounts', 'import_log', 'app_state'];

let _inspectorStore = 'transactions';
let _inspectorPage  = 0;
let _inspectorSearch = '';
let _inspectorRows  = [];
const INSPECTOR_PAGE_SIZE = 50;

registerView('db-inspector', 'DB Inspector', (root) => {

  const ctrl = document.createElement('div');
  ctrl.className = 'card';
  ctrl.innerHTML = `
    <h2 class="section-title">DB Inspector</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Browse the raw contents of any IndexedDB store. Read-only.</p>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px">
      <div>
        <label class="lbl">Store</label>
        <select class="select" id="inspStoreSelect" style="min-width:160px">
          ${DB_INSPECTOR_STORES.map(s=>`<option value="${s}" ${s===_inspectorStore?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div style="flex:1;min-width:200px">
        <label class="lbl">Search (key or value contains)</label>
        <input class="input" id="inspSearch" placeholder="Filter records…" value="${escapeHtml(_inspectorSearch)}">
      </div>
      <div style="display:flex;align-items:flex-end;gap:6px">
        <button class="btn sm" id="inspLoad">Load</button>
        <button class="btn ghost sm" id="inspClear">Clear</button>
      </div>
    </div>
    <div style="margin-top:8px;font-size:12px;color:var(--text-3)" id="inspMeta"></div>`;
  root.appendChild(ctrl);

  const tableCard = document.createElement('div');
  tableCard.className = 'card';
  tableCard.innerHTML = `<div id="inspTable"><div class="empty"><p>Select a store and click Load.</p></div></div>`;
  root.appendChild(tableCard);

  const pagCtrl = document.createElement('div');
  pagCtrl.style.display = 'flex';
  pagCtrl.style.gap = '8px';
  pagCtrl.style.alignItems = 'center';
  pagCtrl.style.flexWrap = 'wrap';
  pagCtrl.innerHTML = `
    <button class="btn ghost sm" id="inspPrev">◀ Prev</button>
    <span id="inspPageInfo" style="font-size:12px;color:var(--text-3)"></span>
    <button class="btn ghost sm" id="inspNext">Next ▶</button>`;
  root.appendChild(pagCtrl);

  // Load data
  async function loadStore() {
    _inspectorStore = $('#inspStoreSelect').value;
    _inspectorSearch = ($('#inspSearch').value||'').trim().toLowerCase();
    _inspectorPage = 0;
    await _fetchAndRender();
  }

  async function _fetchAndRender() {
    if (typeof DB === 'undefined' || !DB._db) {
      $('#inspTable').innerHTML = '<div class="insight warn" style="margin:0">IndexedDB not available.</div>';
      return;
    }
    const store = _inspectorStore;
    const rows = await new Promise(res => {
      const req = DB._db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => res(req.result || []);
      req.onerror   = () => res([]);
    });

    // Filter
    _inspectorRows = _inspectorSearch
      ? rows.filter(r => JSON.stringify(r).toLowerCase().includes(_inspectorSearch))
      : rows;

    const meta = document.getElementById('inspMeta');
    if (meta) meta.textContent = `${_inspectorRows.length.toLocaleString()} record${_inspectorRows.length!==1?'s':''} found (${rows.length.toLocaleString()} total in store)`;

    _renderPage();
  }

  function _renderPage() {
    const start = _inspectorPage * INSPECTOR_PAGE_SIZE;
    const pageRows = _inspectorRows.slice(start, start + INSPECTOR_PAGE_SIZE);
    const totalPages = Math.ceil(_inspectorRows.length / INSPECTOR_PAGE_SIZE);

    const pageInfo = document.getElementById('inspPageInfo');
    if (pageInfo) pageInfo.textContent = _inspectorRows.length
      ? `Page ${_inspectorPage + 1} of ${totalPages} (${start + 1}–${Math.min(start + INSPECTOR_PAGE_SIZE, _inspectorRows.length)} of ${_inspectorRows.length})`
      : '';

    const prev = document.getElementById('inspPrev');
    const next = document.getElementById('inspNext');
    if (prev) prev.disabled = _inspectorPage === 0;
    if (next) next.disabled = _inspectorPage >= totalPages - 1;

    const tbl = document.getElementById('inspTable');
    if (!tbl) return;

    if (!pageRows.length) {
      tbl.innerHTML = '<div class="empty"><p>No records found.</p></div>';
      return;
    }

    // Collect all keys across all rows for columns
    const allKeys = [];
    const keySeen = new Set();
    pageRows.forEach(r => Object.keys(r).forEach(k => { if (!keySeen.has(k)){ keySeen.add(k); allKeys.push(k); } }));

    const thead = `<thead><tr>${allKeys.map(k => `<th>${escapeHtml(k)}</th>`).join('')}</tr></thead>`;
    const tbody = `<tbody>${pageRows.map(r => `<tr>${allKeys.map(k => {
      const v = r[k];
      let disp;
      if (v === null || v === undefined) disp = '<span style="color:var(--text-3);font-style:italic">null</span>';
      else if (v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)))
        disp = `<span style="color:var(--teal);font-size:11px">${dayjs(v).format('MMM D YYYY, h:mm A')}</span>`;
      else if (Array.isArray(v))
        disp = `<span style="color:var(--purple);font-size:11px">[${v.map(x=>escapeHtml(String(x))).join(', ')}]</span>`;
      else if (typeof v === 'object')
        disp = `<span style="color:var(--text-3);font-size:10.5px">${escapeHtml(JSON.stringify(v).slice(0,80))}</span>`;
      else if (typeof v === 'boolean')
        disp = v ? '<span style="color:var(--teal)">true</span>' : '<span style="color:var(--text-3)">false</span>';
      else if (typeof v === 'number')
        disp = `<span class="num" style="color:var(--amber)">${v.toLocaleString()}</span>`;
      else disp = escapeHtml(String(v).slice(0, 100));
      return `<td style="font-size:11.5px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${disp}</td>`;
    }).join('')}</tr>`).join('')}</tbody>`;

    tbl.innerHTML = `<div style="overflow-x:auto"><table class="tbl" style="font-size:11.5px">${thead}${tbody}</table></div>`;
  }

  // Wire events after DOM is ready
  const loadBtn  = document.getElementById('inspLoad');
  const clearBtn = document.getElementById('inspClear');
  const prevBtn  = document.getElementById('inspPrev');
  const nextBtn  = document.getElementById('inspNext');

  if (loadBtn) loadBtn.onclick = loadStore;
  if (clearBtn) {
    clearBtn.onclick = () => {
      const si = document.getElementById('inspSearch');
      if (si) si.value = '';
      _inspectorSearch = '';
      _inspectorPage = 0;
      _inspectorRows = [];
      const tbl = document.getElementById('inspTable');
      if (tbl) tbl.innerHTML = '<div class="empty"><p>Select a store and click Load.</p></div>';
      const meta = document.getElementById('inspMeta');
      if (meta) meta.textContent = '';
    };
  }
  if (prevBtn) prevBtn.onclick = () => { _inspectorPage = Math.max(0, _inspectorPage - 1); _renderPage(); };
  if (nextBtn) nextBtn.onclick = () => {
    const totalPages = Math.ceil(_inspectorRows.length / INSPECTOR_PAGE_SIZE);
    _inspectorPage = Math.min(totalPages - 1, _inspectorPage + 1);
    _renderPage();
  };

  // Auto-load on render if we have previous data
  setTimeout(async () => {
    if (_inspectorRows.length) { _renderPage(); return; }
    await loadStore();
  }, 0);
});


/* ══════════════════════════════════════════════════════════════
   3. CHANGELOG
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
