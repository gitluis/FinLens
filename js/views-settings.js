/* ================================================================
   FINLENS — views-settings.js
   Settings shell (tab bar) + General tab: Display, Anthropic API key.
   The other tabs are views of their own: Import, Accounts, Credit cards and
   Categories in views-data.js, Data & reset in views-cleanup.js (Clarity, v1.16.0).
================================================================ */

let settingsTab='general';

const SETTINGS_TABS=[
  ['general',   'General'],
  ['import',    'Import'],
  ['accounts',  'Accounts'],
  ['credit-cards','Credit cards'],
  ['categories','Categories'],
  ['data-cleanup','Data & reset'],
];

registerView('settings','Settings',(root)=>{
  if (!SETTINGS_TABS.some(t=>t[0]===settingsTab)) settingsTab='general';
  pageActions(root,'Everything here stays on this computer','');
  const tabBar=document.createElement('div');
  tabBar.className='tabs';
  tabBar.setAttribute('role','tablist');
  tabBar.setAttribute('aria-label','Settings sections');
  tabBar.innerHTML=SETTINGS_TABS.map(([k,l])=>
    `<button type="button" role="tab" id="setTab-${k}" aria-selected="${settingsTab===k}" aria-controls="setPanel" tabindex="${settingsTab===k?0:-1}" data-tab="${k}">${escapeHtml(l)}</button>`
  ).join('');
  root.appendChild(tabBar);
  // On a phone the tab bar scrolls sideways, and each render starts it at the left. Bring the
  // selected tab into view (Data & reset, the last one, was off-screen at 390px).
  const selTab=$('[aria-selected="true"]',tabBar);
  if (selTab) {
    const b=tabBar.getBoundingClientRect(), s=selTab.getBoundingClientRect();
    if (s.right>b.right||s.left<b.left) tabBar.scrollLeft+=s.left-b.left-(b.width-s.width)/2;
  }
  // Arrow keys, Home and End move between tabs (as on Forecast).
  const pick=(k)=>{ settingsTab=k; renderActive(); const t=$(`#setTab-${k}`); if (t) t.focus(); };
  const tabs=$$('[role="tab"]',tabBar);
  tabs.forEach((b,i)=>{
    b.onclick=()=>pick(b.dataset.tab);
    b.onkeydown=(e)=>{
      const n=e.key==='ArrowRight'?i+1:e.key==='ArrowLeft'?i-1:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
      if (n==null) return;
      e.preventDefault(); pick(tabs[(n+tabs.length)%tabs.length].dataset.tab);
    };
  });

  const panel=document.createElement('div');
  panel.id='setPanel';
  panel.className='tab-panel';
  panel.setAttribute('role','tabpanel');
  panel.setAttribute('aria-labelledby',`setTab-${settingsTab}`);
  root.appendChild(panel);
  if (settingsTab==='general') _renderGeneralSettings(panel);
  else VIEWS[settingsTab].render(panel);
});

function _renderGeneralSettings(root) {
  /* ---- Display ---- */
  appendHtml(root,`<section class="panel" aria-labelledby="dispH">
    <h2 id="dispH">Display</h2>
    <div class="set-row">
      <div><div class="t" id="themeLbl">Theme</div><div class="d">Light is the default. Dark is optional.</div></div>
      <div class="seg" role="radiogroup" aria-labelledby="themeLbl">
        ${[['light','Light'],['dark','Dark'],['system','Match system']].map(([v,l])=>
          `<button type="button" role="radio" aria-checked="${(State.theme||'light')===v}" tabindex="${(State.theme||'light')===v?0:-1}" data-theme-opt="${v}">${l}</button>`).join('')}
      </div>
    </div>
    <div class="set-row line"><span class="t">Version</span><span class="v">FinLens v1.16.2</span></div>
  </section>`);
  const opts=$$('[data-theme-opt]',root);
  opts.forEach((b,i)=>{
    b.addEventListener('click',()=>{ setTheme(b.dataset.themeOpt); const f=$(`[data-theme-opt="${b.dataset.themeOpt}"]`); if (f) f.focus(); });
    // a radio group: arrow keys choose the next option
    b.addEventListener('keydown',e=>{
      const n=e.key==='ArrowRight'||e.key==='ArrowDown'?i+1:e.key==='ArrowLeft'||e.key==='ArrowUp'?i-1:null;
      if (n==null) return;
      e.preventDefault();
      const next=opts[(n+opts.length)%opts.length].dataset.themeOpt;
      setTheme(next); const f=$(`[data-theme-opt="${next}"]`); if (f) f.focus();
    });
  });

  /* ---- Anthropic API key ---- */
  // The key value is never rendered back into the DOM; only whether one is saved.
  const has=!!State.apiKey;
  const m=takeSettingsMsg('general');
  appendHtml(root,`<section class="panel" aria-labelledby="keyH">
    <div class="panel-head center"><h2 id="keyH">Anthropic API key</h2>${has?'<span class="pill good">Key saved</span>':'<span class="pill warn">No key saved</span>'}</div>
    <p class="sub" style="margin:0">Needed only for AI Analysis. The key is kept in this browser and is never written to finlens-state.json, exports or logs. Get one at console.anthropic.com.</p>
    <div class="form-row">
      <label class="field grow">${has?'Replace key':'API key'}<input class="input" type="password" id="apiKeyInput" autocomplete="off" spellcheck="false" placeholder="sk-ant-…"></label>
      <button type="button" class="btn lg" id="apiKeySave">Save key</button>
      ${has?'<button type="button" class="btn ghost lg danger-text danger-outline" id="apiKeyRemove">Remove</button>':''}
    </div>
    ${statusLine('apiKeyMsg',m)}
  </section>`);
  $('#apiKeySave').addEventListener('click',saveApiKey);
  $('#apiKeyInput').addEventListener('keydown',e=>{ if (e.key==='Enter') saveApiKey(); });
  // Remove asks for a second click, like Data & reset (no confirm() dialog).
  const rm=$('#apiKeyRemove');
  if (rm) rm.addEventListener('click',()=>{
    if (rm.dataset.armed!=='1') {
      rm.dataset.armed='1'; rm.textContent='Click again to remove';
      setTimeout(()=>{ if (rm.isConnected&&rm.dataset.armed==='1') { rm.dataset.armed=''; rm.textContent='Remove'; } },4000);
      return;
    }
    removeApiKey();
  });
}

/* ---- API key (browser storage only — saveStateToFile() excludes it) ---- */
function saveApiKey() {
  const inp=$('#apiKeyInput');
  const v=(inp?.value||'').trim();
  if (!v) {
    const el=$('#apiKeyMsg');
    if (el) { el.className='status-line bad'; el.textContent='Paste your Anthropic API key first.'; }
    if (inp) { inp.setAttribute('aria-invalid','true'); inp.focus(); }
    return;
  }
  State.apiKey=v;
  lsSet('apiKey',v);
  if (inp) inp.value='';
  _settingsMsg={ tab:'general', kind:'good', text:'Key saved in this browser. AI Analysis is ready.' };
  renderActive();
}
function removeApiKey() {
  State.apiKey='';
  lsSet('apiKey','');
  _settingsMsg={ tab:'general', kind:'good', text:'Key removed from this browser.' };
  renderActive();
}

/* Transfer keyword helpers (addTransferKeyword, removeTransferKeyword,
   reapplyTransferKeywords) live in views-main.js alongside the Transfers screen
   that owns the keyword editor. */
