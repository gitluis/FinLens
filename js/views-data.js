/* ================================================================
   FINLENS — views-data.js
   Database > Import subtab — file loading, account management, manual balances
================================================================ */

/* ---------- pending file handling ---------- */
let pendingFileObjects=[];

/* ---------- module-level import result store ---------- */
// Populated after each CSV import so the Coverage/Result cards can display stats.
let _lastImportResults = [];   // [{ filename, account, importResult }]
let _importLogCache    = [];   // cached import log (refreshed on view render)
let _coverageCache     = {};   // cached coverage (refreshed on view render)

registerView('import','Import',(root)=>{

  /* ---- File Loader ---- */
  const fl=document.createElement('div'); fl.className='card';
  const hasSavedFolder=!!State.lastFolderName;
  const needsReconnect=!!State._csvNeedsReconnect;
  fl.innerHTML=`
    <h2 class="section-title">Data Source</h2>
    ${hasSavedFolder
      ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px;padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:13px;color:var(--text)">📁 ${escapeHtml(State.lastFolderName)}</div>
            <div class="muted" style="font-size:11.5px;margin-top:2px">${State.transactions.length?'✓ '+State.transactions.length+' transactions loaded':(needsReconnect?'⚠ Permission needed — click Reconnect':'No data loaded yet')}</div>
          </div>
          ${needsReconnect
            ? `<button class="btn" onclick="reloadDataFiles()">🔄 Reconnect Folder</button>`
            : `<button class="btn" onclick="reloadDataFiles()">↻ Reload</button>`}
          <button class="btn ghost sm" onclick="pickDataFolder()">Change Folder</button>
        </div>`
      : `<p class="muted" style="margin-top:6px">Pick your <strong>.CSV</strong> files and assign each one to an account before importing.</p>
         <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
           <button class="btn" onclick="pickDataFolder()">📁 Pick a Folder</button>
           <button class="btn ghost" onclick="$('#filePick').click()">📄 Pick CSV Files</button>
         </div>`}
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
      ${hasSavedFolder?`<button class="btn ghost sm" onclick="$('#filePick').click()">📄 Add individual CSV files</button>`:''}
    </div>
    ${State.lastRefresh?`<div class="muted" style="font-size:11.5px;margin-top:6px">Last refresh: ${dayjs(State.lastRefresh).format('MMM D, YYYY h:mm A')}</div>`:''}`;
  root.appendChild(fl);

  /* ---- Auto-Backup Status ---- */
  const backupCard=document.createElement('div'); backupCard.className='card';
  const hasBackupFolder=!!State.lastFolderName; // Uses same folder as CSV files
  const lastSync=State.lastFsyncTime?dayjs(State.lastFsyncTime).format('MMM D, YYYY h:mm A'):'Never';
  backupCard.innerHTML=`
    <h2 class="section-title">📦 Auto-Backup to Disk</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Your dashboard state is automatically saved to <strong>finlens-state.json</strong> in your folder every 5 seconds (when you make changes). This survives browser cache clearing.</p>
    ${hasBackupFolder
      ? `<div style="margin-top:10px;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div style="font-size:13px;color:var(--text)">✓ <strong>Backup enabled</strong></div>
          <div class="muted" style="font-size:11px;margin-top:4px">Folder: ${escapeHtml(State.lastFolderName)}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">Last saved: ${lastSync}</div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px">
          <button class="btn sm" onclick="(async()=>{await saveStateToFile(State);renderActive();})()">💾 Save Now</button>
        </div>`
      : `<div style="margin-top:10px;padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);border-color:var(--amber-soft)">
          <div style="font-size:13px;color:var(--text)">⚠ <strong>Backup disabled</strong></div>
          <div class="muted" style="font-size:11px;margin-top:4px">Pick a folder above (under "Data Source") to enable automatic backups.</div>
        </div>`}
    `;
  root.appendChild(backupCard);

  /* ---- Pending file assignment ---- */
  if (pendingFileObjects.length) {
    const assignCard=document.createElement('div'); assignCard.className='card';
    assignCard.innerHTML=`
      <h2 class="section-title">Assign Files to Accounts</h2>
      <p class="muted" style="font-size:12px;margin-top:4px">Select the account type for each file, then click Import.</p>
      <div id="fileAssignList" style="margin-top:10px"></div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn" onclick="importAssignedFiles()">▶ Import Data</button>
        <button class="btn ghost" onclick="pendingFileObjects=[];renderActive()">✕ Cancel</button>
      </div>`;
    root.appendChild(assignCard);
    renderFileAssignList();
  }

  /* ---- Loaded Files (with rename) ---- */
  if (State.fileMeta&&State.fileMeta.length) {
    const loadedCard=document.createElement('div'); loadedCard.className='card';
    loadedCard.innerHTML=`
      <h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center">
        Loaded Files
        <button class="btn ghost sm" onclick="reloadDataFiles()">↻ Refresh from folder</button>
      </h2>
      <p class="muted" style="font-size:12px;margin-top:4px">Rename any dataset — the new name appears everywhere in the dashboard.</p>
      <div class="filelist" style="margin-top:10px" id="fileMetaList"></div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="btn sm" onclick="saveDatasetNames()">💾 Save Names</button>
      </div>
      <div class="muted" style="font-size:11.5px;margin-top:10px">${State.fileMeta.length} file${State.fileMeta.length!==1?'s':''} loaded · ${State.transactions.length.toLocaleString()} transactions</div>`;
    root.appendChild(loadedCard);
    renderFileMetaList();
  }

  /* ---- Add Account ---- */
  const addCard=document.createElement('div'); addCard.className='card';
  addCard.innerHTML=`
    <h2 class="section-title">Add Manual Account</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Add an account without a CSV file (e.g., a brokerage, cash on hand).</p>
    <div class="grid grid-3" style="margin-top:10px">
      <div><label class="lbl">Account Name</label><input class="input" id="newAcctName" placeholder="e.g. Fidelity 401(k)"></div>
      <div>
        <label class="lbl">Account Type</label>
        <select class="select" id="newAcctKind">
          <option value="ally_checking">Ally Checking</option>
          <option value="ally_savings">Ally Savings</option>
          <option value="chase">Chase Credit Card</option>
          <option value="investment">Investment</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn sm" onclick="addManualAccount()">+ Add Account</button>
      </div>
    </div>`;
  root.appendChild(addCard);

  /* ---- Post-Upload Result card (shown after each import) ---- */
  if (_lastImportResults.length) {
    const resCard=document.createElement('div'); resCard.className='card';
    resCard.innerHTML=`<h2 class="section-title">Last Import Results</h2><div id="importResultsBody" style="margin-top:8px"></div>`;
    root.appendChild(resCard);
    const body=resCard.querySelector('#importResultsBody');
    body.innerHTML=_lastImportResults.map(r=>{
      const ir=r.importResult;
      if (!ir) return `<div style="margin-bottom:8px;padding:8px 12px;background:var(--surface-2);border-radius:var(--radius-sm);font-size:12.5px">
        📄 <strong>${escapeHtml(r.filename)}</strong> — imported (DB not ready for stats)</div>`;
      const fmtD=d=>d?dayjs(d).format('MMM D, YYYY'):'—';
      const coverage=_coverageCache[r.accountId];
      const gapHtml=ir.gapWarning?`
        <div class="insight warn" style="margin-top:6px;font-size:12px">
          ⚠️ Gap detected: no data for <strong>${fmtD(ir.gapWarning.from)}</strong> → <strong>${fmtD(ir.gapWarning.to)}</strong>.
          Upload a file covering this period to fill it.
        </div>`:'';
      const nextUpload=ir.dateRangeMax?dayjs(ir.dateRangeMax).add(1,'day').format('MMM D, YYYY'):'—';
      return `<div style="margin-bottom:10px;padding:10px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:13px;font-weight:600;color:var(--teal)">✓ ${escapeHtml(r.account)}</div>
        <div class="muted" style="font-size:11.5px;margin-top:2px">📄 ${escapeHtml(r.filename)}</div>
        <div style="font-size:12.5px;margin-top:6px">
          <span style="color:var(--teal);font-weight:600">${ir.inserted.toLocaleString()} new</span> transaction${ir.inserted!==1?'s':''} imported
          · <span class="muted">${ir.skipped.toLocaleString()} duplicate${ir.skipped!==1?'s':''} skipped</span>
          ${ir.removed?`· <span style="color:var(--amber);font-weight:600">${ir.removed.toLocaleString()} leftover duplicate cop${ir.removed!==1?'ies':'y'} removed</span>`:''}
        </div>
        <div class="muted" style="font-size:12px;margin-top:3px">File covered: ${fmtD(ir.dateRangeMin)} → ${fmtD(ir.dateRangeMax)}</div>
        ${coverage?`<div class="muted" style="font-size:12px;margin-top:1px">Total in DB: ${fmtD(coverage.min)} → ${fmtD(coverage.max)} (${coverage.count.toLocaleString()} transactions)</div>`:''}
        <div style="font-size:12px;margin-top:3px">Next upload: start from <strong>${nextUpload}</strong></div>
        ${gapHtml}
      </div>`;
    }).join('');
  }

  /* ---- Import Log card (collapsible history) ---- */
  const logCard=document.createElement('div'); logCard.className='card';
  logCard.innerHTML=`
    <h2 class="section-title" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" id="importLogToggle">
      Import Log
      <span style="font-size:12px;color:var(--text-3)" id="importLogChevron">▶ Show</span>
    </h2>
    <div id="importLogBody" style="display:none;margin-top:8px"></div>`;
  root.appendChild(logCard);
  const logToggle=logCard.querySelector('#importLogToggle');
  const logBody=logCard.querySelector('#importLogBody');
  const logChev=logCard.querySelector('#importLogChevron');
  logToggle.onclick=async()=>{
    if (logBody.style.display==='none') {
      logBody.style.display='block';
      logChev.textContent='▼ Hide';
      if (typeof DB!=='undefined'&&DB._db) {
        _importLogCache=await DB.getImportLog();
        renderImportLog(logBody);
      } else {
        logBody.innerHTML='<div class="muted" style="font-size:12.5px">IndexedDB not available.</div>';
      }
    } else {
      logBody.style.display='none';
      logChev.textContent='▶ Show';
    }
  };
});

/* ---- Render import log table ---- */
function renderImportLog(container) {
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

/* ---- Render loaded file list with editable name inputs + reorder buttons ---- */
function renderFileMetaList() {
  const el=$('#fileMetaList'); if (!el) return;
  // Show files in account display order so drag matches what the user sees in Overview
  const ordered=orderedAccounts()
    .map(a=>State.fileMeta.find(f=>f.name===a.sourceFile||f.account===a.name))
    .filter(Boolean);
  // Append any fileMeta entries not yet matched (manual accounts, etc.)
  State.fileMeta.forEach(f=>{ if (!ordered.includes(f)) ordered.push(f); });

  el.innerHTML=ordered.map((f,i)=>{
    const acct=Object.values(State.accounts).find(a=>a.sourceFile===f.name||a.name===f.account);
    const acctId=acct?.id||'';
    const origIdx=State.fileMeta.indexOf(f);
    return `
    <div class="filerow" style="flex-wrap:wrap;gap:8px;align-items:center">
      <div style="display:flex;flex-direction:column;gap:2px;margin-right:4px;flex-shrink:0">
        <button class="btn ghost sm" style="padding:2px 7px;font-size:11px;line-height:1" ${i===0?'disabled':''} onclick="moveAccount('${acctId}',-1)" title="Move up">▲</button>
        <button class="btn ghost sm" style="padding:2px 7px;font-size:11px;line-height:1" ${i===ordered.length-1?'disabled':''} onclick="moveAccount('${acctId}',1)" title="Move down">▼</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:200px">
        <label class="lbl" style="margin:0">Display Name</label>
        <input class="input" id="fname_${origIdx}" value="${escapeHtml(f.account)}" placeholder="Account name" style="font-size:12.5px;padding:6px 8px">
      </div>
      <div style="display:flex;flex-direction:column;justify-content:flex-end;flex-shrink:0">
        <span class="muted" style="font-size:11px;margin-bottom:2px">📄 ${escapeHtml(f.name)}</span>
        <span class="muted" style="font-size:11px">${f.rows} rows${f.dateRange?' · '+dayjs(f.dateRange[0]).format('MMM D YYYY')+' → '+dayjs(f.dateRange[1]).format('MMM D YYYY'):''}</span>
      </div>
    </div>`;
  }).join('');
}

/* ---- Move an account up (-1) or down (+1) in the display order ---- */
function moveAccount(accountId, direction) {
  if (!accountId) return;
  const order=[...State.accountOrder];
  const idx=order.indexOf(accountId);
  if (idx===-1) return;
  const newIdx=idx+direction;
  if (newIdx<0||newIdx>=order.length) return;
  [order[idx],order[newIdx]]=[order[newIdx],order[idx]];
  State.accountOrder=order;
  lsSet('accountOrder',order);
  renderActive();
}

function saveDatasetNames() {
  State.fileMeta.forEach((f,i)=>{
    const input=$(`#fname_${i}`);
    if (!input) return;
    const newName=input.value.trim()||f.account;
    const oldName=f.account;
    if (newName===oldName) return;
    // Update fileMeta display name
    f.account=newName;
    // Update the account object name that matches this file
    const acct=Object.values(State.accounts).find(a=>a.sourceFile===f.name||a.name===oldName);
    if (acct) {
      acct.name=newName;
      // Persist via accountLabels so the name survives future CSV reloads
      if (!State.accountLabels) State.accountLabels={};
      State.accountLabels[acct.id]=newName;
    }
  });
  lsSet('accountLabels', State.accountLabels);
  buildAccountFilter();
  alert('Dataset names saved.');
  renderActive();
}

/* ---- Save all balance inputs at once (no per-keystroke re-render) ---- */
function saveAccountBalances() {
  $$('[data-acct][data-field]').forEach(input=>{
    const id=input.dataset.acct;
    const field=input.dataset.field;
    const raw=input.value.trim();
    const val=raw===''?null:parseFloat(raw);
    if (field==='balance') State.manualBalances[id]=val;
    else if (field==='initial') State.manualBalances[id+'_initial']=val;
    else if (field==='limit') State.manualBalances[id+'_limit']=val==null?'':val;
  });
  lsSet('manualBalances',State.manualBalances);
  alert('Account balances saved.');
  renderActive();
}

/* ---- File assign list ---- */
function renderFileAssignList() {
  const el=$('#fileAssignList'); if (!el) return;
  el.innerHTML=pendingFileObjects.map((f,i)=>{
    const saved=State.fileAssignments[f.name]||guessKind(f.name);
    return `<div class="file-assign-row">
      <div class="fname">📄 ${escapeHtml(f.name)}</div>
      <select class="select" id="assign_${i}" style="font-size:12.5px">
        ${['ally_checking','ally_savings','chase','other','skip'].map(k=>{
          const labels={ally_checking:'Ally Checking',ally_savings:'Ally Savings',chase:'Chase Credit Card',other:'Other',skip:'Skip'};
          return `<option value="${k}" ${k===saved?'selected':''}>${labels[k]||k}</option>`;
        }).join('')}
      </select>
    </div>`;
  }).join('');
}

function guessKind(filename) {
  const f=filename.toLowerCase();
  if (f.includes('saving')) return 'ally_savings';
  if (f.includes('check')) return 'ally_checking';
  if (f.includes('chase')||f.includes('card')||f.includes('credit')) return 'chase';
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
  await loadFiles(pendingFileObjects,assignments);
  // Capture import results for the result card display
  _lastImportResults=State.fileMeta
    .filter(f=>f.importResult)
    .map(f=>({
      filename: f.name,
      account:  f.account,
      accountId: Object.values(State.accounts).find(a=>a.sourceFile===f.name||a.name===f.account)?.id||'',
      importResult: f.importResult,
    }));
  if (typeof DB!=='undefined'&&DB._db) _coverageCache=await DB.getCoverage();
  pendingFileObjects=[];
  renderActive();
}

/* ---- Folder picker using File System Access API (stores handle for future refreshes) ---- */
async function pickDataFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const handle = await window.showDirectoryPicker({ mode:'read', startIn:'documents' });
      await idbSet('csvDirHandle', handle);
      State.lastFolderName = handle.name;
      lsSet('lastFolderName', handle.name);
      await reloadFromDirHandle(handle);
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
async function reloadFromDirHandle(handle) {
  const files = [];
  for await (const [name, entry] of handle.entries()) {
    if (name.toLowerCase().endsWith('.csv') && entry.kind === 'file') {
      files.push(await entry.getFile());
    }
  }
  if (!files.length) { alert('No CSV files found in the selected folder.'); return; }
  const assignments = {};
  files.forEach(f => { assignments[f.name] = State.fileAssignments[f.name] || guessKind(f.name); });
  await loadFiles(files, assignments);
  // Capture import results for the result card
  _lastImportResults=State.fileMeta
    .filter(f=>f.importResult)
    .map(f=>({
      filename: f.name,
      account:  f.account,
      accountId: Object.values(State.accounts).find(a=>a.sourceFile===f.name||a.name===f.account)?.id||'',
      importResult: f.importResult,
    }));
  if (typeof DB!=='undefined'&&DB._db) _coverageCache=await DB.getCoverage();
}

/* ---- Reload from stored handle (sidebar Refresh button + Data tab refresh) ---- */
async function reloadDataFiles() {
  // Try the stored CSV directory handle first
  const handle = await idbGet('csvDirHandle');
  if (handle) {
    try {
      let perm = await handle.queryPermission({ mode:'read' });
      if (perm !== 'granted') perm = await handle.requestPermission({ mode:'read' });
      if (perm === 'granted') { await reloadFromDirHandle(handle); return; }
    } catch(e) { /* permission revoked — fall through */ }
  }
  // No stored handle or permission denied — open picker
  await pickDataFolder();
}

function addManualAccount() {
  const name=$('#newAcctName').value.trim();
  const kind=$('#newAcctKind').value;
  if (!name){ alert('Account name required.'); return; }
  const id='manual_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_');
  State.accounts[id]={id,name,kind,balance:null,limit:null,sourceFile:'manual'};
  alert(`Account "${name}" added.`);
  renderActive();
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

/* ---- Database > Accounts subtab ---- */
function _renderAccountsTable(root, title, kinds, emptyMsg) {
  const card=document.createElement('div'); card.className='card';
  const BANK_KINDS=['ally_checking','ally_savings','unknown'];
  const accts=Object.values(State.accounts).filter(a=>kinds.includes(a.kind));
  if (!accts.length) {
    card.innerHTML=`<h2 class="section-title">${title}</h2><p class="muted" style="margin-top:8px">${emptyMsg}</p>`;
    root.appendChild(card);
    return;
  }
  const rows=accts.map(a=>{
    const range=accountDateRange(a.id);
    const fmtD=d=>d?dayjs(d).format('MMM D, YYYY'):'—';
    const txCount=State.transactions.filter(t=>t.account===a.id).length;
    const bal=State.manualBalances[a.id];
    return `<tr>
      <td><strong>${escapeHtml(a.name)}</strong></td>
      <td class="num">${txCount.toLocaleString()}</td>
      <td class="num">${fmtD(range.min)}</td>
      <td class="num">${fmtD(range.max)}</td>
      <td class="num">${bal!=null?fmt(bal):'—'}</td>
    </tr>`;
  }).join('');
  card.innerHTML=`
    <h2 class="section-title">${title}</h2>
    <div style="overflow-x:auto;margin-top:10px">
      <table class="tbl">
        <thead><tr><th>Account</th><th>Transactions</th><th>First</th><th>Latest</th><th>Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  root.appendChild(card);
}

registerView('accounts','Accounts',(root)=>{
  _renderAccountsTable(root,'Bank Accounts',['ally_checking','ally_savings','unknown'],'No bank accounts loaded yet. Import CSV files in Settings → Import.');
  _renderAccountBalances(root);
});

/* ---- Simplified Account Balances card (shown in Accounts tab) ---- */
function _renderAccountBalances(root) {
  const accts=Object.values(State.accounts);
  if (!accts.length) return;

  const card=document.createElement('div'); card.className='card';
  card.innerHTML=`
    <h2 class="section-title">Account Balances</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Set current balances and credit limits. Click <strong>Save</strong> when done.</p>
    <div style="margin-top:14px;display:flex;flex-direction:column;gap:10px" id="acctBalList"></div>
    <div style="margin-top:14px">
      <button class="btn" onclick="saveAccountBalances()">💾 Save</button>
    </div>`;
  root.appendChild(card);

  const list=card.querySelector('#acctBalList');
  accts.forEach(a=>{
    const isChase=a.kind==='chase';
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm)';
    row.innerHTML=`
      <div style="flex:0 0 auto;min-width:130px">
        <div style="font-weight:500;font-size:13px;color:var(--text)">${escapeHtml(a.name)}</div>
        <div class="muted" style="font-size:11px;margin-top:2px">${a.kind.replace('_',' ')}</div>
      </div>
      <div style="flex:1;min-width:120px">
        <label class="lbl">Current Balance</label>
        <input class="input" type="number" step="0.01"
          data-acct="${a.id}" data-field="balance"
          value="${State.manualBalances[a.id]!=null?State.manualBalances[a.id]:''}"
          placeholder="e.g. 1250.00">
      </div>
      ${isChase?`
      <div style="flex:1;min-width:120px">
        <label class="lbl">Credit Limit</label>
        <input class="input" type="number" step="1"
          data-acct="${a.id}" data-field="limit"
          value="${State.manualBalances[a.id+'_limit']||''}"
          placeholder="e.g. 23000">
      </div>`:''}`;
    list.appendChild(row);
  });
}

registerView('credit-cards','Credit Cards',(root)=>{
  _renderAccountsTable(root,'Credit Cards',['chase'],'No credit card accounts loaded yet. Import a Chase CSV in Settings → Import.');
});

/* ---- Database > Categories subtab ---- */
registerView('categories','Categories',(root)=>{
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=`
    <h2 class="section-title">Categories</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">Click × to remove a category. Add new ones below.</p>
    <div style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px" id="catChips"></div>
    <div style="margin-top:16px;display:flex;gap:8px;align-items:flex-end;max-width:360px">
      <div style="flex:1"><label class="lbl">New category</label><input class="input" id="newCatInput" placeholder="e.g. Healthcare"></div>
      <button class="btn sm" onclick="addCategory()">+ Add</button>
    </div>`;
  root.appendChild(card);
  renderDbCategories();
});

function renderDbCategories() {
  const cont=$('#catChips'); if (!cont) return;
  cont.innerHTML=State.categories.map((cat,i)=>`
    <span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:20px;font-size:13px">
      ${escapeHtml(cat)}
      <button onclick="deleteCategory(${i})" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:14px;line-height:1;padding:0 2px" title="Remove">×</button>
    </span>`).join('');
}

function deleteCategory(i) {
  State.categories.splice(i,1);
  lsSet('categories', State.categories);
  renderDbCategories();
}

function addCategory() {
  const input=$('#newCatInput'); if (!input) return;
  const val=input.value.trim();
  if (!val) return;
  if (!State.categories.includes(val)) {
    State.categories.push(val);
    lsSet('categories', State.categories);
  }
  renderDbCategories();
  input.value='';
}

/* ---- Database > Import Logs subtab ---- */
registerView('db-logs','Import Logs',(root)=>{
  const card=document.createElement('div'); card.className='card';
  card.innerHTML=`
    <h2 class="section-title">Import Logs</h2>
    <p class="muted" style="font-size:12px;margin-top:4px">History of all data imports.</p>
    <div id="importLogsBody" style="margin-top:10px"></div>`;
  root.appendChild(card);

  setTimeout(async()=>{
    if (typeof DB==='undefined'||!DB._db) {
      $('#importLogsBody').innerHTML='<div class="muted">IndexedDB not available.</div>';
      return;
    }
    _importLogCache=await DB.getImportLog();
    renderImportLog($('#importLogsBody'));
  },0);
});
