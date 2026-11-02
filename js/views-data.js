/* ================================================================
   FINLENS — views-data.js
   Settings tabs Import, Accounts, Credit cards and Categories (Clarity,
   v1.16.0), the CSV folder (pick, reload, reconnect, save now), the sync
   badge and folder banner, sample data, and the Import Logs view.
   Shared pieces (pageActions, appendHtml, wireLinks, ICON, plural …) are in
   views-main.js; meterHtml() is in views-plan.js.
================================================================ */

/* ---------- pending file handling ---------- */
let pendingFileObjects=[];

/* ---------- module-level import result store ---------- */
// Populated after each CSV import so the Coverage/Result cards can display stats.
let _lastImportResults = [];   // [{ filename, account, importResult }]
let _importLogCache    = [];   // cached import log (refreshed on view render)
let _coverageCache     = {};   // cached coverage (refreshed on view render)
let _saveNowMsg        = null; // { kind, text } — result of the last Save Now click
let _folderBannerMsg   = null; // { kind, text } — result of the last Reconnect click
let _settingsMsg       = null; // { tab, kind, text } — a Settings tab's one-time status line
let _importLogShowAll  = false;

const ICON_FOLDER=_svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',22);
const ICON_UP=_svg('<path d="M6 15l6-6 6 6"/>');
const ICON_DOWN=_svg('<path d="M6 9l6 6 6-6"/>');
// How a CSV file can be read ("Read as"): the import kinds, as words.
const READ_AS=[['bank_checking','Checking'],['bank_savings','Savings'],['credit_card','Credit card'],['other','Other CSV']];
// The three synthetic files in samples/ (fake data) behind "Try it with sample data".
const SAMPLE_FILES=['checking_sample.csv','savings_sample.csv','credit_card_sample.csv'];

// "Today, 2:01 PM", "Yesterday, 9:12 AM", "Oct 21, 9:12 AM"; '' for no date.
function whenText(d) {
  if (!d) return '';
  const x=dayjs(d), t=dayjs();
  if (x.isSame(t,'day')) return 'Today, '+x.format('h:mm A');
  if (x.isSame(t.subtract(1,'day'),'day')) return 'Yesterday, '+x.format('h:mm A');
  return x.format(x.year()===t.year()?'MMM D, h:mm A':'MMM D, YYYY');
}
// "May 1 – Oct 18" (the year once, at the end, when it isn't this year)
function spanText(a, b) {
  if (!a||!b) return '—';
  const y=dayjs(b).year()!==dayjs().year()?', '+dayjs(b).year():'';
  return `${dayjs(a).format('MMM D')} – ${dayjs(b).format('MMM D')}${y}`;
}
// A Settings tab's status line: shown once, after the action that set it.
function takeSettingsMsg(tab) {
  const m=_settingsMsg&&_settingsMsg.tab===tab?_settingsMsg:null;
  if (m) _settingsMsg=null;
  return m;
}
function statusLine(id, m) {
  return `<p class="status-line${m?' '+m.kind:''}" id="${id}" role="status">${m?escapeHtml(m.text):''}</p>`;
}
// Money typed in a field: "1,284.50", "$1284.5" → 1284.5; '' → null; anything else → NaN.
function parseMoneyInput(raw) {
  const s=String(raw||'').replace(/[$,\s]/g,'');
  if (s==='') return null;
  return /^-?\d*\.?\d+$/.test(s)?parseFloat(s):NaN;
}
// Files FinLens has imported, one per account that came from a CSV.
function importedFiles() {
  return orderedAccounts().filter(a=>a.sourceFile&&a.sourceFile!=='manual').map(a=>{
    const own=State.transactions.filter(t=>t.account===a.id);
    const r=accountDateRange(a.id);
    return { name:a.sourceFile, acct:a, rows:own.length, min:r.min, max:r.max };
  });
}
function readAsOptions(sel, extra) {
  return READ_AS.concat(extra||[]).map(([k,l])=>`<option value="${k}" ${k===sel?'selected':''}>${l}</option>`).join('');
}

/* =================== SETTINGS → IMPORT =================== */
registerView('import','Import',(root)=>{
  wireLinks(root);
  const folder=State.lastFolderName;
  const linked=!!State._folderLinked;
  const needs=!!(State._csvNeedsReconnect||State._folderNeedsAccess);
  const files=importedFiles();

  /* ---- the folder ---- */
  const saveMsg=_saveNowMsg; _saveNowMsg=null;   // shown once, after the click that produced it
  const paused=State.csvAutoImportPaused&&!State.transactions.length;
  if (folder) {
    const pill=!linked?'<span class="pill warn">Not connected</span>'
      :needs?'<span class="pill warn">Needs your permission</span>'
      :'<span class="pill good">Read and write access</span>';
    const sub=linked?`${plural(files.length,'CSV file')} · backup file finlens-state.json`
      :`${plural(files.length,'CSV file')} · chosen with the file picker, so FinLens can't save to it`;
    const acts=!linked
      ?`<button type="button" class="btn lg" id="impPick">Pick a folder</button><button type="button" class="btn ghost lg" id="impChoose2">Choose CSV files</button>`
      :needs
      ?`<button type="button" class="btn lg" data-reconnect-btn>Reconnect folder</button><button type="button" class="btn ghost lg" id="impChange">Change folder</button>`
      :`<button type="button" class="btn lg" id="saveNowBtn">Save now</button><button type="button" class="btn ghost lg" id="impReload">Reload CSVs</button><button type="button" class="btn ghost lg" id="impChange">Change folder</button>`;
    const okMsg=saveMsg&&saveMsg.kind==='good';
    appendHtml(root,`<section class="panel" aria-labelledby="folderH">
      <div class="head-row">
        <span class="icon-tile lg">${ICON_FOLDER}</span>
        <div class="who"><h2 id="folderH" class="lg">${escapeHtml(folder)}</h2><p class="sub">${sub}</p></div>
        ${pill}
      </div>
      ${needs&&linked?'<p class="sub" style="margin:0">Your browser asks again after it has been closed. Changes are kept in this browser until you reconnect.</p>':''}
      ${paused?`<div class="callout warn" role="status">${ICON_ALERT}<span>You cleared your transactions, so automatic import from this folder is paused. ${linked&&!needs?'Click <strong>Reload CSVs</strong> to import again.':'Reconnect, then reload to import again.'}</span></div>`:''}
      <div class="info-tiles">
        <div><span class="l">CSVs last read</span><b id="impLastRead">${State.lastRefresh?whenText(State.lastRefresh):'Not since this page opened'}</b></div>
        <div><span class="l">Backup last saved</span><b>${!linked?'Off':State.lastFsyncTime?whenText(State.lastFsyncTime):'Not since this page opened'}</b></div>
        <div><span class="l">Auto-save</span><b>${linked&&!needs?'5 seconds after a change':'Paused'}</b></div>
      </div>
      <div class="form-row center">${acts}
        <p class="status-line${saveMsg?' '+saveMsg.kind:''}" id="saveNowMsg" role="status">${saveMsg?(okMsg?'✓ ':'')+escapeHtml(saveMsg.text):''}</p></div>
    </section>`);
  } else {
    appendHtml(root,`<section class="panel" aria-labelledby="folderH">
      <div class="head-row">
        <span class="icon-tile lg">${ICON_FOLDER}</span>
        <div class="who"><h2 id="folderH" class="lg">No folder connected</h2><p class="sub">Pick the folder that holds your CSV exports. FinLens reads them and saves your plans and edits there as finlens-state.json, so clearing the browser loses nothing.</p></div>
      </div>
      <div class="form-row"><button type="button" class="btn lg" id="impPick">${ICON_FOLDER.replace('width="22" height="22"','width="18" height="18"')}Pick a folder</button>
        <button type="button" class="btn ghost lg" id="impChoose2">Choose CSV files</button></div>
    </section>`);
  }
  const on=(id,fn)=>{ const b=$('#'+id,root); if (b) b.onclick=fn; };
  on('saveNowBtn',saveNowClick);
  on('impReload',()=>reloadDataFiles());
  on('impChange',()=>pickDataFolder());
  on('impPick',()=>pickDataFolder());
  on('impChoose2',()=>$('#filePick').click());
  $$('[data-reconnect-btn]',root).forEach(b=>b.onclick=reconnectFolderClick);

  /* ---- files waiting for "Read as" (picked with the file chooser) ---- */
  if (pendingFileObjects.length) {
    const n=pendingFileObjects.length;
    appendHtml(root,`<section class="panel form-panel" aria-labelledby="assignH">
      <div><h2 id="assignH">Choose how to read ${n===1?'this file':'these files'}</h2><p class="sub">FinLens guessed from the file names. Change any that are wrong, then import.</p></div>
      <div class="table-scroll"><table class="tbl flush">
        <thead><tr><th scope="col">File</th><th scope="col" class="w-read">Read as</th></tr></thead>
        <tbody>${pendingFileObjects.map((f,i)=>{
          const saved=State.fileAssignments[f.name]||guessKind(f.name);
          return `<tr><td><code class="fname">${escapeHtml(f.name)}</code></td>
            <td><label><span class="sr-only">Read ${escapeHtml(f.name)} as</span><select class="select" id="assign_${i}">${readAsOptions(saved,[['skip','Skip this file']])}</select></label></td></tr>`;
        }).join('')}</tbody></table></div>
      <div class="form-row"><button type="button" class="btn lg" id="impAssign">Import ${plural(n,'file')}</button><button type="button" class="btn ghost lg" id="impCancel">Cancel</button></div>
    </section>`);
    on('impAssign',()=>importAssignedFiles());
    on('impCancel',()=>{ pendingFileObjects=[]; renderActive(); });
  }

  /* ---- the last import's results ---- */
  if (_lastImportResults.length) {
    const fmtD=d=>d?dayjs(d).format('MMM D, YYYY'):'—';
    appendHtml(root,`<section class="panel" aria-labelledby="resH">
      <div class="panel-head"><h2 id="resH">Last import</h2>${State.lastRefresh?`<span class="aside">${escapeHtml(whenText(State.lastRefresh))}</span>`:''}</div>
      <div class="rows">${_lastImportResults.map(r=>{
        const ir=r.importResult;
        if (r.problem) return `<div class="r"><div class="t">${escapeHtml(r.filename)}<span class="s2">Not imported: ${escapeHtml(r.problem)}</span></div></div>`;
        if (!ir) return `<div class="r"><div class="t">${escapeHtml(r.account)}<span class="s2">${escapeHtml(r.filename)} · imported (the browser database wasn't ready, so no counts)</span></div></div>`;
        const cov=_coverageCache[r.accountId];
        const next=ir.dateRangeMax?dayjs(ir.dateRangeMax).add(1,'day').format('MMM D, YYYY'):'—';
        return `<div class="r wrap"><div class="t">${escapeHtml(r.account)}
            <span class="s2">${escapeHtml(r.filename)} · covers ${fmtD(ir.dateRangeMin)} – ${fmtD(ir.dateRangeMax)}${cov?` · ${cov.count.toLocaleString()} in FinLens`:''} · start the next export on ${next}</span></div>
          <span class="d"><b class="c-good">${ir.inserted.toLocaleString()} new</b> · ${ir.skipped.toLocaleString()} already imported${ir.removed?` · <b class="c-warn">${ir.removed.toLocaleString()} leftover duplicate cop${ir.removed!==1?'ies':'y'} removed</b>`:''}</span>
          ${ir.gapWarning?callout('warn',`No data for <strong>${fmtD(ir.gapWarning.from)}</strong> – <strong>${fmtD(ir.gapWarning.to)}</strong>. Import a file that covers those dates to fill the gap.`):''}</div>`;
      }).join('')}</div>
    </section>`);
  }

  /* ---- files in the folder ---- */
  if (files.length) {
    const m=takeSettingsMsg('import');
    appendHtml(root,`<section class="panel" aria-labelledby="filesH">
      <div><h2 id="filesH">${linked?'Files in the folder':'Imported files'}</h2><p class="sub">FinLens works out each account from the filename and columns. Change it if it guessed wrong.</p></div>
      <div class="table-scroll"><table class="tbl flush mw-560 fit-sm files-tbl">
        <thead><tr><th scope="col">File</th><th scope="col" class="w-read">Read as</th><th scope="col" class="r w-num">Rows</th><th scope="col" class="hide-sm">Dates</th></tr></thead>
        <tbody>${files.map(f=>{
          const sel=State.fileAssignments[f.name]||(f.acct.kind==='unknown'?'other':f.acct.kind);
          return `<tr><td><code class="fname">${escapeHtml(f.name)}</code><div class="sm-line">${spanText(f.min,f.max)}</div></td>
            <td><label><span class="sr-only">Read ${escapeHtml(f.name)} as</span><select class="select" data-read-as="${escapeHtml(f.name)}">${readAsOptions(sel)}</select></label></td>
            <td class="r">${f.rows.toLocaleString()}</td><td class="dim hide-sm nowrap">${spanText(f.min,f.max)}</td></tr>`;
        }).join('')}</tbody></table></div>
      ${statusLine('readAsMsg',m)}
    </section>`);
    $$('[data-read-as]',root).forEach(s=>s.onchange=()=>{
      const name=s.dataset.readAs;
      State.fileAssignments[name]=s.value;
      lsSet('fileAssignments',State.fileAssignments);
      const label=(READ_AS.find(r=>r[0]===s.value)||[])[1]||s.value;
      const msg=$('#readAsMsg');
      if (msg) { msg.className='status-line good'; msg.textContent=`Saved. FinLens reads ${name} as ${label} from the next reload. To re-read the rows already imported, use Rebuild in Data & reset.`; }
    });
  }

  /* ---- import log (fills in from IndexedDB after the render) ---- */
  appendHtml(root,`<section class="panel" aria-labelledby="logH">
    <h2 id="logH">Import log</h2>
    <div class="log-list" id="impLog"><p class="empty-note">Loading…</p></div>
  </section>`);
  // As in #18's fix for Import Logs: look the element up again after the database read,
  // and stop if the view was left in the meantime.
  setTimeout(async()=>{
    if (!$('#impLog')) return;
    const log=(typeof DB!=='undefined'&&DB._db)?await DB.getImportLog():null;
    const el=$('#impLog');
    if (!el) return;
    if (log) _importLogCache=log;
    renderImportLogList(el, log);
    const lr=$('#impLastRead');
    if (lr&&!State.lastRefresh&&log&&log.length) lr.textContent=whenText(log[0].timestamp);
  },0);

  /* ---- Safari and Firefox ---- */
  appendHtml(root,`<section class="panel dashed row-panel" aria-labelledby="upH">
    <div class="grow"><h2 id="upH">Using Safari or Firefox?</h2>
      <p class="sub">These browsers can't keep a folder connected. Choose your CSV files each time you have new exports; your data stays saved in the browser between visits.</p></div>
    <button type="button" class="btn ghost lg" id="impChoose">Choose CSV files</button>
  </section>`);
  on('impChoose',()=>$('#filePick').click());
});

// Settings → Import → Import log: one line per import (files imported together are one
// line), newest first. `log` is DB.getImportLog() (null when IndexedDB isn't available).
function renderImportLogList(el, log) {
  if (!log) { el.innerHTML='<p class="empty-note">The browser database isn\'t available, so there is no log.</p>'; return; }
  if (!log.length) { el.innerHTML='<p class="empty-note">No imports yet.</p>'; return; }
  const groups=[];
  for (const e of log) {
    const g=groups[groups.length-1];
    const t=new Date(e.timestamp).getTime();
    if (g&&Math.abs(g.t-t)<10000) g.items.push(e); else groups.push({ t, items:[e] });
  }
  const shown=_importLogShowAll?groups:groups.slice(0,8);
  el.innerHTML=shown.map(g=>{
    const sum=(k)=>g.items.reduce((s,e)=>s+(e[k]||0),0);
    const names=g.items.map(e=>e.filename||'').reverse();
    const what=g.items.length===1?`<code class="code-tag">${escapeHtml(names[0])}</code>`:`<span title="${escapeHtml(names.join(', '))}">${plural(g.items.length,'file')}</span>`;
    const removed=sum('rowsRemoved');
    return `<div class="lg-row"><span class="w">${escapeHtml(whenText(g.t))}</span><span class="t">${what}</span>
      <span class="d">${sum('rowsInserted').toLocaleString()} new · ${sum('rowsSkipped').toLocaleString()} already imported${removed?` · ${removed.toLocaleString()} duplicates removed`:''}</span></div>`;
  }).join('')+(groups.length>8?`<button type="button" class="btn text sm" id="impLogAll">${_importLogShowAll?'Show fewer':`Show all ${groups.length} imports`}</button>`:'');
  const all=el.querySelector('#impLogAll');
  if (all) all.onclick=()=>{ _importLogShowAll=!_importLogShowAll; renderImportLogList(el, log); const b=el.querySelector('#impLogAll'); if (b) b.focus(); };
}

/* ---- Render import log table ---- */
function renderImportLog(container) {
  if (!container) return;   // the view was left before the log loaded
  if (!_importLogCache.length) {
    container.innerHTML='<div class="muted" style="font-size:12.5px">No imports recorded yet. Upload CSV files to populate the log.</div>';
    return;
  }
  const fmtD=d=>d?dayjs(d).format('MMM D, YYYY'):'—';
  const rows=_importLogCache.map(e=>{
    const acct=State.accounts[e.accountId];
    const name=acct?(State.accountLabels?.[e.accountId]||acct.name):e.accountId;
    return `<tr>
      <td class="muted" style="font-size:11.5px">${dayjs(e.timestamp).format('MMM D h:mm A')}</td>
      <td>${escapeHtml(e.filename||'')}</td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(e.schemaId||'')}</td>
      <td class="num">${(e.rowsFound||0).toLocaleString()}</td>
      <td class="num" style="color:var(--teal)">${(e.rowsInserted||0).toLocaleString()}</td>
      <td class="num muted">${(e.rowsSkipped||0).toLocaleString()}</td>
      <td class="muted" style="font-size:11.5px">${fmtD(e.dateRangeMin)} → ${fmtD(e.dateRangeMax)}</td>
    </tr>`;
  }).join('');
  container.innerHTML=`<div style="overflow-x:auto">
    <table class="tbl" style="font-size:12px">
      <thead><tr><th>When</th><th>File</th><th>Account</th><th>Schema</th><th>Found</th><th>New</th><th>Skipped</th><th>File Range</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/* ---- Move an account up (-1) or down (+1) in the display order ---- */
// Works from the order as shown, so accounts missing from State.accountOrder (loaded from
// the browser database) move too.
function moveAccount(accountId, direction) {
  if (!accountId) return;
  const order=orderedAccounts().map(a=>a.id);
  const idx=order.indexOf(accountId);
  if (idx===-1) return;
  const newIdx=idx+direction;
  if (newIdx<0||newIdx>=order.length) return;
  [order[idx],order[newIdx]]=[order[newIdx],order[idx]];
  State.accountOrder=order;
  lsSet('accountOrder',order);
  buildAccountFilter();
  renderActive();
}

/* ---- Account and card fields (Settings → Accounts, Credit cards): saved as you leave each one ---- */
// The name you type is kept in State.accountLabels, which wins over the CSV's default
// name everywhere (as renaming on the Overview does). An empty name goes back to it.
function setAccountName(id, raw) {
  const a=State.accounts[id]; if (!a) return '';
  const name=String(raw||'').trim();
  if (!State.accountLabels) State.accountLabels={};
  if (name) State.accountLabels[id]=name; else delete State.accountLabels[id];
  a.name=name||a.name;
  lsSet('accountLabels',State.accountLabels);
  buildAccountFilter();
  return acctName(id);
}
// field: 'balance' (State.manualBalances[id]: today's balance; for a card, what you owe),
// 'initial' (the starting balance before the first transaction) or 'limit' (a card's credit
// limit). Returns false when the value isn't a number.
function setAccountMoney(id, field, raw) {
  const v=parseMoneyInput(raw);
  if (Number.isNaN(v)) return false;
  const key=field==='balance'?id:field==='initial'?id+'_initial':id+'_limit';
  if (field==='limit') State.manualBalances[key]=v==null?'':Math.max(0,v);
  else State.manualBalances[key]=v;
  lsSet('manualBalances',State.manualBalances);
  return true;
}
// A card's APR (%) or payment due day. A debt linked to the card (Debt tracker) holds
// its own, so it's updated too; State.cardDetails keeps them for a card with no debt yet.
function setCardDetail(id, field, raw) {
  const s=String(raw||'').trim().replace('%','');
  let v=null;
  if (s!=='') {
    v=Number(s);
    if (!Number.isFinite(v)) return false;
    if (field==='apr' && (v<0||v>100)) return false;
    if (field==='dueDay') { if (!Number.isInteger(v)||v<1||v>31) return false; }
  }
  State.cardDetails=State.cardDetails||{};
  const cd=State.cardDetails[id]={ ...(State.cardDetails[id]||{}), [field]:v };
  lsSet('cardDetails',State.cardDetails);
  const debt=(State.debts||[]).find(d=>d.account===id);
  if (debt) {
    if (field==='apr') debt.apr=v==null?0:v; else if (v!=null) debt.dueDay=v;
    lsSet('debts',State.debts);
  }
  return cd;
}
// What the Credit cards tab shows: the linked debt's values first.
function cardDetail(id, field) {
  const debt=(State.debts||[]).find(d=>d.account===id);
  if (debt&&debt[field]!=null&&debt[field]!=='') return debt[field];
  const cd=(State.cardDetails||{})[id]||{};
  return cd[field]??'';
}

/* ---- Categories (Settings → Categories) ---- */
// Always there: transactions fall back to Other, and transfers get Transfer in / out.
const FIXED_CATEGORIES=['Other','Transfer in','Transfer out'];
// Deleting a category moves its transactions to Other. The move is saved as a transaction
// edit (State.txOverrides), so it lasts across reloads; Clear transaction edits undoes it.
// Category rules that assigned it now assign Other. Returns { moved, rules }.
function deleteCategory(name) {
  if (FIXED_CATEGORIES.includes(name)) return { moved:0, rules:0 };
  State.categories=State.categories.filter(c=>c!==name);
  lsSet('categories',State.categories);
  let moved=0;
  for (const t of State.transactions) {
    if (!t.categories.includes(name)) continue;
    const next=[...new Set(t.categories.map(c=>c===name?'Other':c))];
    const ov=State.txOverrides[t.id]||{};
    ov.categories=next; State.txOverrides[t.id]=ov;
    t.categories=next; moved++;
  }
  if (moved) lsSet('txOverrides',State.txOverrides);
  let rules=0;
  (State.categoryRules||[]).forEach(r=>{ if (r.category===name) { r.category='Other'; rules++; } });
  if (rules) lsSet('catRules',State.categoryRules);
  return { moved, rules };
}
// Returns the name added, or '' when it's empty or already there (any capitalization).
function addCategory(raw) {
  const val=String(raw||'').trim();
  if (!val) return '';
  const known=[...State.categories, ...State.transactions.flatMap(t=>t.categories)];
  if (known.some(c=>c.toLowerCase()===val.toLowerCase())) return '';
  State.categories.push(val);
  lsSet('categories',State.categories);
  return val;
}

function guessKind(filename) {
  const f=filename.toLowerCase();
  if (f.includes('saving')) return 'bank_savings';
  if (f.includes('check')) return 'bank_checking';
  if (f.includes('card')||f.includes('credit')) return 'credit_card';
  return 'other';
}

async function importAssignedFiles() {
  const assignments={};
  pendingFileObjects.forEach((f,i)=>{
    const sel=$(`#assign_${i}`);
    if (sel) assignments[f.name]=sel.value;
    State.fileAssignments[f.name]=sel?sel.value:guessKind(f.name);
  });
  lsSet('fileAssignments',State.fileAssignments);
  const res=await loadFiles(pendingFileObjects,assignments);
  // Nothing imported (the alert said why): the files stay listed, so "Read as" can be changed and tried again.
  if (!res.imported) { renderActive(); return; }
  await captureImportResults(res);
  pendingFileObjects=[];
  renderActive();
}

// After an import: the "Last import" card's rows (views-data.js renders _lastImportResults).
// Files that gave no transactions are listed with the reason (v1.16.2).
async function captureImportResults(res) {
  _lastImportResults=State.fileMeta
    .filter(f=>f.importResult)
    .map(f=>({
      filename: f.name,
      account:  f.account,
      accountId: Object.values(State.accounts).find(a=>a.sourceFile===f.name||a.name===f.account)?.id||'',
      importResult: f.importResult,
    }))
    .concat(res.files.filter(f=>f.problem&&f.problem!=='skipped').map(f=>({ filename:f.name, problem:importFileProblem(f) })));
  if (typeof DB!=='undefined'&&DB._db) _coverageCache=await DB.getCoverage();
}

/* ---- Folder picker using File System Access API (stores handle for future refreshes) ---- */
async function pickDataFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      // readwrite: the same folder holds finlens-state.json, which FinLens writes to.
      const handle = await window.showDirectoryPicker({ mode:'readwrite', startIn:'documents' });
      await idbSet('csvDirHandle', handle);
      State._folderLinked = true;
      State.lastFolderName = handle.name;
      State._folderNeedsAccess = false;
      State._csvNeedsReconnect = false;
      lsSet('lastFolderName', handle.name);
      // A browser with no data of its own (new browser, cleared site data) must not
      // overwrite the folder's backup: restore it instead, as boot does.
      const restored = await _restoreStateIfBrowserEmpty();
      if (!restored || !State.transactions.length) await reloadFromDirHandle(handle);
      updateFolderBanner();
      return;
    } catch(e) {
      if (e.name !== 'AbortError') { console.error('pickDataFolder:', e); }
      return; // user cancelled — fall through to nothing
    }
  }
  // Fallback: legacy input picker
  $('#folderPick').click();
}

/* ---- Read all CSVs from a FileSystemDirectoryHandle and load them ---- */
// opts go to loadFiles(): quiet (no alerts; the caller reports) and beforeImport.
// Returns loadFiles()'s result ({ imported, reason, transactions, files }).
async function reloadFromDirHandle(handle, opts = {}) {
  const files = [], unopened = [];
  for await (const [name, entry] of handle.entries()) {
    if (name.toLowerCase().endsWith('.csv') && entry.kind === 'file') {
      // A CSV the browser can't open (another program has it locked, say) is reported
      // with the others instead of stopping the whole reload (v1.16.2).
      try { files.push(await entry.getFile()); }
      catch(e) { console.warn('[FinLens] could not open', name, '—', e.message); unopened.push({ name, error: e.message }); }
    }
  }
  if (!files.length && !unopened.length) {
    if (!opts.quiet) alert('No CSV files found in the selected folder.');
    return { imported: false, reason: 'no-csv', transactions: 0, files: [] };
  }
  const assignments = {};
  files.forEach(f => { assignments[f.name] = State.fileAssignments[f.name] || guessKind(f.name); });
  const res = await loadFiles(files, assignments, { ...opts, unopened });
  // Capture import results for the result card. loadFiles() rendered before they were
  // ready, so render again: Last import showed the previous import until the next render.
  if (res.imported) { await captureImportResults(res); renderActive(); }
  return res;
}

/* ---- Reload from stored handle (Settings → Import Reload button) ---- */
async function reloadDataFiles() {
  // Try the stored CSV directory handle first
  const handle = await idbGet('csvDirHandle');
  if (handle) {
    try {
      // Ask for readwrite (not just read) so the reload also resumes backups.
      if (await folderWithWriteAccess()) {
        State._csvNeedsReconnect = false;
        updateFolderBanner();
        await reloadFromDirHandle(handle);
        return;
      }
      // Write refused but reading still allowed: reload anyway; backups stay paused.
      if ((await folderPermission(handle, 'read')) === 'granted') { await reloadFromDirHandle(handle); return; }
    } catch(e) { /* permission revoked — fall through */ }
  }
  // No stored handle or permission denied — open picker
  await pickDataFolder();
}

/* ---- Folder access: Reconnect banner, Reconnect + Save Now click handlers ---- */

// When this browser has no data of its own (no transactions: a new browser, or site
// data cleared), the folder's finlens-state.json is the only copy. Load it, exactly as
// boot does, rather than letting the next save overwrite it with an empty state.
// Needs read access already granted. Returns true if state was restored.
async function _restoreStateIfBrowserEmpty() {
  // After "Clear transactions & accounts" the browser is empty on purpose: keep it.
  if (State.transactions.length || State.csvAutoImportPaused) return false;
  const fsState = await loadStateFromFile();
  if (!fsState) return false;
  Object.assign(State, fsState);
  buildAccountFilter();
  renderActive();
  console.log('[FinLens] Browser had no data; restored', State.transactions.length, 'transactions from finlens-state.json');
  return true;
}

// Click handler (banner + Import tab). Asks for read-write access to the stored folder.
// Decision (Luis, 2026-10-24): after reconnecting, the browser copy wins. It overwrites
// finlens-state.json; the file is not loaded over the browser data. The one exception
// is a browser with no data at all (see _restoreStateIfBrowserEmpty).
// Returns 'saved' | 'restored' | 'no-folder' | 'denied' | 'error'.
async function reconnectDataFolder() {
  const dir = await idbGet('csvDirHandle');
  if (!dir) return 'no-folder';
  if (!(await folderWithWriteAccess())) return 'denied';
  State._folderNeedsAccess = false;
  let restored = false;
  if (!State.transactions.length) {
    restored = await _restoreStateIfBrowserEmpty();
    // Boot skipped the CSV auto-import for lack of access; do it now, unless the user
    // cleared their transactions on purpose (Data & Reset) and import is paused.
    if (!State.transactions.length && !State.csvAutoImportPaused) await reloadFromDirHandle(dir);
  }
  State._csvNeedsReconnect = false;
  if (restored) return 'restored';
  return (await saveStateToFile(State)) ? 'saved' : 'error';
}

async function reconnectFolderClick() {
  $$('[data-reconnect-btn]').forEach(b => { b.disabled = true; });
  const r = await reconnectDataFolder();
  const name = State.lastFolderName || 'your folder';
  _folderBannerMsg = {
    saved:      { kind:'good', text:`Reconnected to “${name}”. This browser's data was saved to finlens-state.json, and backups are back on.` },
    restored:   { kind:'good', text:`Reconnected to “${name}”. This browser had no data, so it was restored from finlens-state.json.` },
    'no-folder':{ kind:'warn', text:'No folder is connected. Pick one in Settings → Import.' },
    denied:     { kind:'bad',  text:`Access to “${name}” wasn't granted, so backups are still paused. Click Reconnect folder and choose Allow. If no prompt appears, file access for this site is blocked in your browser's site settings.` },
    error:      { kind:'bad',  text:`Reconnected, but saving finlens-state.json failed: ${State._lastSaveError || 'unknown error'}.` },
  }[r];
  updateFolderBanner();
  renderActive();
  if (_folderBannerMsg && _folderBannerMsg.kind === 'good') {
    const shown = _folderBannerMsg;
    setTimeout(() => { if (_folderBannerMsg === shown) { _folderBannerMsg = null; updateFolderBanner(); } }, 8000);
  }
}

// Settings → Import → Save Now. Asks for read-write access if needed (the click
// allows the prompt), saves right away, and reports the outcome either way.
async function saveNowClick() {
  const btn = $('#saveNowBtn');
  if (btn) btn.disabled = true;
  const r = await saveStateNow();
  const name = State.lastFolderName || 'your folder';
  _saveNowMsg = {
    saved:      { kind:'good', text:`Saved to finlens-state.json in “${name}” at ${dayjs().format('h:mm A')}.` },
    'no-folder':{ kind:'warn', text:'Not saved: no folder is connected. Pick a folder first.' },
    denied:     { kind:'bad',  text:`Not saved: FinLens doesn't have permission to write to “${name}”. Click Save now again and choose Allow. If no prompt appears, file access for this site is blocked in your browser's site settings.` },
    error:      { kind:'bad',  text:`Not saved: ${State._lastSaveError || 'unknown error'}.` },
  }[r];
  renderActive();
}

// The banner above every view (#folderBanner in index.html). Shown while access to
// the stored folder has lapsed, briefly after a Reconnect click with its result, and
// while the sample data is loaded (v1.16.0).
function updateFolderBanner() {
  updateSyncBadge();
  const el = $('#folderBanner');
  if (!el) return;
  const msg = _folderBannerMsg;
  const needs = !!State._folderNeedsAccess;
  const sample = !!State.sampleData && State.transactions.length > 0;
  if (!needs && !msg && !sample) { el.hidden = true; el.innerHTML = ''; return; }
  const name = escapeHtml(State.lastFolderName || 'your folder');
  const body = needs
    ? `<strong>Backups paused.</strong> FinLens needs your permission again to use “${name}”, so changes aren't being saved to finlens-state.json. Your data is safe in this browser.`
    : '';
  const kind = msg ? msg.kind : 'warn';
  el.hidden = false;
  el.innerHTML = (needs || msg ? `<div class="insight ${kind==='good'?'':kind} folder-banner">
      <div style="flex:1;min-width:0">${msg ? escapeHtml(msg.text) : body}</div>
      ${needs ? `<button class="btn sm" data-reconnect-btn>Reconnect folder</button>` : ''}
      ${!needs ? `<button class="btn ghost sm" data-banner-close title="Dismiss">✕</button>` : ''}
    </div>` : '')
    + (sample ? `<div class="insight folder-banner" data-sample-note>
      <div style="flex:1;min-width:0"><strong>You're trying FinLens with sample data.</strong> These are made-up transactions from the samples folder. Importing your own files replaces them.</div>
      <button class="btn sm" data-sample-exit>Use my own files</button>
    </div>` : '');
  const rb = el.querySelector('[data-reconnect-btn]');
  if (rb) rb.onclick = reconnectFolderClick;
  const cb = el.querySelector('[data-banner-close]');
  if (cb) cb.onclick = () => { _folderBannerMsg = null; updateFolderBanner(); };
  const sx = el.querySelector('[data-sample-exit]');
  if (sx) sx.onclick = () => DataCleanup.clearSampleData();
}

// The sync badge in the app bar (#syncBadge). "Synced" while finlens-state.json in the
// connected folder is kept up to date; "Not synced" when no folder is connected, access
// has lapsed (State._folderNeedsAccess) or the last save failed. Changes are always kept
// in this browser either way. The tooltip says which case it is.
function updateSyncBadge() {
  const b = $('#syncBadge');
  if (!b) return;
  // A folder chosen with the file picker (Safari, Firefox) has a name but no handle, so
  // nothing is ever written back to it: only a stored handle counts as connected.
  const hasFolder = !!State._folderLinked;
  const needs = !!State._folderNeedsAccess;
  const failed = !!State._lastSaveError && !needs;
  const synced = hasFolder && !needs && !failed;
  const name = State.lastFolderName || '';
  const when = State.lastFsyncTime ? `, last saved ${dayjs(State.lastFsyncTime).format('h:mm A')}` : '';
  const tip = synced ? `Synced to finlens-state.json in “${name}”${when}.`
    : !hasFolder ? 'Not synced: no folder is connected, so changes are saved in this browser only. Click to pick a folder.'
    : needs ? `Not synced: FinLens needs your permission again to use “${name}”. Your data is safe in this browser. Click to reconnect.`
    : `Not synced: the last save to “${name}” failed (${State._lastSaveError}). Click for details.`;
  b.classList.toggle('ok', synced);
  b.classList.toggle('off', !synced);
  const lbl = $('#syncLabel'); if (lbl) lbl.textContent = synced ? 'Synced' : 'Not synced';
  b.title = tip;
  b.setAttribute('aria-label', tip);
}

// Clicking the badge: when access lapsed, reconnect right away (the click allows the
// permission prompt); otherwise open Settings → Import, where the folder is managed.
function syncBadgeClick() {
  if (State._folderLinked && State._folderNeedsAccess) { reconnectFolderClick(); return; }
  settingsTab = 'import';
  showView('settings');
}

/* ---- Sample data: "Try it with sample data" on the Welcome ---- */
// Imports the three synthetic CSVs in samples/ through the normal import (loadFiles), and
// sets State.sampleData so your own files replace them later instead of joining their
// accounts. Served over HTTP the files are fetched; opened as a file (file://) the browser
// won't allow that, so the file picker opens for you to choose them.
// Call it from a click handler (the picker needs the click).
async function loadSampleData(statusEl) {
  const say=(t)=>{ if (statusEl) statusEl.textContent=t; };
  if (location.protocol==='file:') {
    say('FinLens is open as a file, so your browser won\'t let it read the samples folder by itself. Choose the three CSV files in FinLens\'s samples folder.');
    $('#samplePick').click();
    return;
  }
  say('Loading the sample files…');
  try {
    const files=await Promise.all(SAMPLE_FILES.map(async n=>{
      const res=await fetch('samples/'+n,{ cache:'no-store' });
      if (!res.ok) throw new Error(`samples/${n}: HTTP ${res.status}`);
      return new File([await res.text()], n, { type:'text/csv' });
    }));
    await importSampleFiles(files);
  } catch(e) {
    console.warn('[FinLens] sample data:', e.message);
    say('Couldn\'t read the samples folder. Choose its three CSV files instead.');
    $('#samplePick').click();
  }
}
// The picker for samples (#samplePick in index.html): only the three sample files are read.
function handleSamplePick(fileList) {
  const files=Array.from(fileList).filter(f=>SAMPLE_FILES.includes(f.name));
  if (!files.length) { alert('Those aren\'t the sample files. Choose checking_sample.csv, savings_sample.csv and credit_card_sample.csv in FinLens\'s samples folder.'); return; }
  importSampleFiles(files);
}
async function importSampleFiles(files) {
  State.sampleData=true; lsSet('sampleData',true);
  const assignments={};
  files.forEach(f=>{ assignments[f.name]=guessKind(f.name); });
  await loadFiles(files, assignments, { sample:true });
  // the samples cover May–Oct 2026: show all of it
  setRange('all');
  updateFolderBanner();
  showView('overview');
  window.scrollTo(0,0);
}

/* ---------- hook folder/file pickers ---------- */
function handleFilePick(fileList) {
  const csvs=Array.from(fileList).filter(f=>f.name.toLowerCase().endsWith('.csv'));
  if (!csvs.length){ alert('No .CSV files found. Only .CSV files are supported.'); return; }
  const firstRelPath=fileList[0]?.webkitRelativePath||'';
  if (firstRelPath) {
    const folderName=firstRelPath.split('/')[0]||'Selected folder';
    State.lastFolderName=folderName;
    lsSet('lastFolderName',folderName);
  }
  pendingFileObjects=csvs;
  // The Import view is a Settings tab ('db-import' no longer exists, so this used to
  // fall back to Overview and hide the file-assignment card).
  settingsTab='import';
  showView('settings');
}

/* =================== SETTINGS → ACCOUNTS =================== */
registerView('accounts','Accounts',(root)=>{
  wireLinks(root);
  const accts=orderedAccounts();
  if (!accts.length) {
    appendHtml(root,`<section class="panel" aria-labelledby="acctH"><h2 id="acctH">Accounts</h2>
      <p class="empty-note">No accounts yet. <a href="#settings" data-goto="settings" data-tab="import">Import your CSV files</a> and each one becomes an account here.</p></section>`);
    return;
  }
  const m=takeSettingsMsg('accounts');
  appendHtml(root,`<section class="panel" aria-labelledby="acctH">
    <div><h2 id="acctH">Accounts</h2><p class="sub">Bank exports don't include a running balance, so FinLens adds your transactions to the starting balance you enter here. Use the arrows to set the display order.</p></div>
    <div class="acct-rows">${accts.map((a,i)=>{
      const id=escapeHtml(a.id), name=acctName(a.id), n=escapeHtml(name);
      const own=State.transactions.filter(t=>t.account===a.id).length;
      const r=accountDateRange(a.id);
      const card=a.kind==='credit_card';
      const field=card?'balance':'initial';
      const val=State.manualBalances[card?a.id:a.id+'_initial'];
      const label=card?'Balance owed today ($)':`Starting balance${r.min?', '+dayjs(r.min).subtract(1,'day').format('MMM D'):''} ($)`;
      const cur=!card&&State.manualBalances[a.id]!=null&&State.manualBalances[a.id]!==''?Number(State.manualBalances[a.id]):null;
      return `<div class="acct-row" data-row="${id}">
        <div class="order-btns">
          <button type="button" class="icon-btn sm" data-move="${id}" data-dir="-1" aria-label="Move ${n} up" title="Move up" ${i===0?'disabled':''}>${ICON_UP}</button>
          <button type="button" class="icon-btn sm" data-move="${id}" data-dir="1" aria-label="Move ${n} down" title="Move down" ${i===accts.length-1?'disabled':''}>${ICON_DOWN}</button>
        </div>
        <label class="field">Display name · ${KIND_LABEL[a.kind]||'Account'}<input class="input strong" data-acct-name="${id}" value="${n}" autocomplete="off"></label>
        <label class="field">${label}<input class="input" inputmode="decimal" data-acct-money="${id}" data-field="${field}" value="${val==null||val===''?'':escapeHtml(String(val))}" placeholder="0.00" autocomplete="off"></label>
        <div class="acct-meta"><b>${plural(own,'row')}</b><span>${spanText(r.min,r.max)}</span></div>
        ${cur!=null?`<p class="row-note">A current balance of ${fmt(cur)} is set for this account (Settings before v1.16.0), and it takes the place of the starting balance. <button type="button" class="btn text sm" data-clear-cur="${id}">Use the starting balance instead</button></p>`:''}
      </div>`;
    }).join('')}</div>
    ${statusLine('acctMsg',m)}
  </section>`);
  const say=(kind,text)=>{ const el=$('#acctMsg'); if (el) { el.className='status-line '+kind; el.textContent=text; } };
  $$('[data-move]',root).forEach(b=>b.onclick=()=>{
    const id=b.dataset.move, dir=+b.dataset.dir;
    moveAccount(id,dir);
    // keep focus on the same arrow (or the other one at the ends)
    const same=$(`[data-move="${CSS.escape(id)}"][data-dir="${dir}"]`), other=$(`[data-move="${CSS.escape(id)}"][data-dir="${-dir}"]`);
    (same&&!same.disabled?same:other)?.focus();
  });
  $$('[data-acct-name]',root).forEach(inp=>inp.addEventListener('change',()=>{
    const shown=setAccountName(inp.dataset.acctName, inp.value);
    inp.value=shown;
    say('good',`Saved the name “${shown}”.`);
  }));
  $$('[data-acct-money]',root).forEach(inp=>inp.addEventListener('change',()=>{
    if (!setAccountMoney(inp.dataset.acctMoney, inp.dataset.field, inp.value)) {
      inp.setAttribute('aria-invalid','true'); say('bad','Enter an amount such as 1500.00.'); return;
    }
    inp.removeAttribute('aria-invalid');
    say('good',`Saved the ${inp.dataset.field==='initial'?'starting balance':'balance'} for ${acctName(inp.dataset.acctMoney)}.`);
  }));
  $$('[data-clear-cur]',root).forEach(b=>b.onclick=()=>{
    const id=b.dataset.clearCur;
    State.manualBalances[id]=null; lsSet('manualBalances',State.manualBalances);
    _settingsMsg={ tab:'accounts', kind:'good', text:`${acctName(id)} now uses its starting balance plus its transactions.` };
    renderActive();
  });
});

/* =================== SETTINGS → CREDIT CARDS =================== */
registerView('credit-cards','Credit cards',(root)=>{
  wireLinks(root);
  const cards=orderedAccounts().filter(a=>a.kind==='credit_card');
  if (!cards.length) {
    appendHtml(root,`<section class="panel" aria-labelledby="ccH"><h2 id="ccH">Credit cards</h2>
      <p class="empty-note">No credit cards yet. Put a card's CSV export in your folder, or <a href="#settings" data-goto="settings" data-tab="import">choose it in Import</a>, and it shows up here.</p></section>`);
    return;
  }
  const bal=currentBalances();
  cards.forEach(a=>{
    const id=escapeHtml(a.id), name=acctName(a.id);
    const own=State.transactions.filter(t=>t.account===a.id).length;
    const manual=State.manualBalances[a.id];
    const lim=State.manualBalances[a.id+'_limit'];
    const debt=(State.debts||[]).find(d=>d.account===a.id);
    const v=(x)=>x==null||x===''?'':escapeHtml(String(x));
    appendHtml(root,`<section class="panel" aria-labelledby="cc_${id}" data-card="${id}">
      <div class="head-row">
        <span class="icon-tile lg t-card">${ICON.card.replace('width="18" height="18"','width="22" height="22"')}</span>
        <div class="who"><h2 id="cc_${id}" class="lg">${escapeHtml(name)}</h2><p class="sub">From ${escapeHtml(a.sourceFile||'your CSV')} · ${plural(own,'transaction')}</p></div>
      </div>
      <p class="sub" style="margin:0">Card exports don't include your balance. Enter it from your latest statement or your card's app.${manual==null||manual===''?` Until you do, FinLens uses your transactions: ${fmt(debtOf(bal[a.id]))}.`:''}</p>
      <div class="cc-grid">
        <label class="field">Current balance ($)<input class="input" inputmode="decimal" data-cc="balance" value="${v(manual)}" placeholder="${debtOf(bal[a.id]).toFixed(2)}" autocomplete="off"></label>
        <label class="field">Credit limit ($)<input class="input" inputmode="decimal" data-cc="limit" value="${v(lim)}" placeholder="e.g. 5000" autocomplete="off"></label>
        <label class="field">APR (%)<input class="input" inputmode="decimal" data-cc="apr" value="${v(cardDetail(a.id,'apr'))}" placeholder="e.g. 24.99" autocomplete="off"></label>
        <label class="field">Payment due day<input class="input" type="number" min="1" max="31" step="1" data-cc="dueDay" value="${v(cardDetail(a.id,'dueDay'))}" placeholder="1–31"></label>
      </div>
      <div class="util-line" data-util></div>
      ${debt?`<p class="sub" style="margin:0">APR and due day are shared with “${escapeHtml(debt.name)}” in the <a href="#debt" data-goto="debt">Debt tracker</a>.</p>`:''}
      <p class="status-line" data-cc-msg role="status"></p>
    </section>`);
  });
  appendHtml(root,`<p class="trend-note">Have more than one card? Put each card's CSV in the folder. Each becomes its own card here.</p>`);

  // The bar under the fields follows the balance and limit as you type.
  const drawUtil=(sec)=>{
    const id=sec.dataset.card;
    const typed=parseMoneyInput($('[data-cc="balance"]',sec).value);
    const owed=typed!=null&&!Number.isNaN(typed)?Math.abs(typed):debtOf(currentBalances()[id]);
    const lim=parseMoneyInput($('[data-cc="limit"]',sec).value);
    const el=$('[data-util]',sec);
    if (!(lim>0)) { el.innerHTML='<span class="sub">Add a credit limit to see how much of it you\'re using.</span>'; return; }
    const p=owed/lim*100;
    el.innerHTML=`${meterHtml(p,'card',`${acctName(id)} credit used`,`${Math.round(p)}% of ${fmt0(lim)} used`,'lg')}<span class="sub">${Math.round(p)}% of your limit used · ${fmt(owed)} of ${fmt0(lim)}</span>`;
  };
  $$('[data-card]',root).forEach(sec=>{
    drawUtil(sec);
    const id=sec.dataset.card, msg=$('[data-cc-msg]',sec);
    const say=(kind,text)=>{ msg.className='status-line '+kind; msg.textContent=text; };
    $$('[data-cc]',sec).forEach(inp=>{
      const f=inp.dataset.cc;
      if (f==='balance'||f==='limit') inp.addEventListener('input',()=>drawUtil(sec));
      inp.addEventListener('change',()=>{
        const ok=f==='balance'||f==='limit'?setAccountMoney(id,f,inp.value):!!setCardDetail(id,f,inp.value);
        if (!ok) {
          inp.setAttribute('aria-invalid','true');
          say('bad',f==='dueDay'?'Enter a day from 1 to 31.':f==='apr'?'Enter an APR from 0 to 100.':'Enter an amount such as 1284.50.');
          return;
        }
        inp.removeAttribute('aria-invalid');
        drawUtil(sec);
        say('good',`Saved the ${{balance:'balance',limit:'credit limit',apr:'APR',dueDay:'due day'}[f]}.`);
      });
    });
  });
});

/* =================== SETTINGS → CATEGORIES =================== */
registerView('categories','Categories',(root)=>{
  wireLinks(root);
  const count={};
  State.transactions.forEach(t=>t.categories.forEach(c=>{ count[c]=(count[c]||0)+1; }));
  // Your list, then categories your transactions use that aren't on it (from the card
  // export's Category column, say), most used first; the fixed ones last.
  const extra=Object.keys(count).filter(c=>!State.categories.includes(c)&&!FIXED_CATEGORIES.includes(c)).sort((a,b)=>count[b]-count[a]||a.localeCompare(b));
  const list=[...State.categories.filter(c=>!FIXED_CATEGORIES.includes(c)), ...extra, ...FIXED_CATEGORIES.filter(c=>State.categories.includes(c)||count[c])];
  const m=takeSettingsMsg('categories');
  appendHtml(root,`<section class="panel" aria-labelledby="catsH">
    <div><h2 id="catsH">Categories</h2><p class="sub">The list used across Transactions, Spending and Budget. Matching rules live on the <a href="#spending" data-goto="spending" data-pill="spending">Spending page</a>.</p></div>
    <ul class="cat-chips" aria-label="Categories">${list.map((c,i)=>`<li class="cat-chip"><span class="n">${escapeHtml(c)}</span><span class="c" title="${plural(count[c]||0,'transaction')}">${count[c]||0}</span>${FIXED_CATEGORIES.includes(c)
      ?''
      :`<button type="button" data-cat-del="${i}" aria-label="Delete category ${escapeHtml(c)}" title="Delete">×</button>`}</li>`).join('')}</ul>
    <div class="form-row">
      <label class="field grow">New category<input class="input" id="newCatInput" placeholder="e.g. Pets" autocomplete="off"></label>
      <button type="button" class="btn lg" id="catAdd">Add category</button>
    </div>
    <p class="sub" style="margin:0">Deleting a category moves its transactions to Other. Other, Transfer in and Transfer out can't be deleted.</p>
    ${statusLine('catMsg',m)}
  </section>`);
  $$('[data-cat-del]',root).forEach(b=>b.onclick=()=>{
    const name=list[+b.dataset.catDel];
    const r=deleteCategory(name);
    _settingsMsg={ tab:'categories', kind:'good', text:`Deleted “${name}”.`+(r.moved?` ${plural(r.moved,'transaction')} moved to Other.`:'')+(r.rules?` ${plural(r.rules,'rule')} now ${r.rules===1?'assigns':'assign'} Other.`:'') };
    renderActive();
    const next=$$('[data-cat-del]')[Math.min(+b.dataset.catDel, $$('[data-cat-del]').length-1)];
    (next||$('#newCatInput')).focus();
  });
  const add=()=>{
    const inp=$('#newCatInput');
    const v=addCategory(inp.value);
    if (!v) {
      inp.setAttribute('aria-invalid','true');
      const el=$('#catMsg'); el.className='status-line bad'; el.textContent=inp.value.trim()?`“${inp.value.trim()}” is already a category.`:'Type a name for the new category.';
      inp.focus(); return;
    }
    _settingsMsg={ tab:'categories', kind:'good', text:`Added “${v}”.` };
    renderActive();
    $('#newCatInput').focus();
  };
  $('#catAdd').onclick=add;
  $('#newCatInput').addEventListener('keydown',e=>{ if (e.key==='Enter') { e.preventDefault(); add(); } });
});

/* ---- Database > Import Logs subtab ---- */
registerView('db-logs','Import Logs',(root)=>{
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=`
    <h2 class="section-title">Import Logs</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">History of all data imports.</p>
    <div id="importLogsBody" style="margin-top:10px"></div>`;
  root.appendChild(card);

  // Fills in after the render, from IndexedDB. If you've left the view by then (a quick
  // click elsewhere), #importLogsBody is gone: look it up again and stop if it's missing.
  setTimeout(async()=>{
    if (!$('#importLogsBody')) return;
    if (typeof DB==='undefined'||!DB._db) {
      $('#importLogsBody').innerHTML='<div class="muted">IndexedDB not available.</div>';
      return;
    }
    _importLogCache=await DB.getImportLog();
    const body=$('#importLogsBody');
    if (body) renderImportLog(body);
  },0);
});
