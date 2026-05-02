/* ================================================================
   FINLENS — views-database.js
   Database section sub-views: Import, Accounts, Categories, Logs, Inspector
   Loaded after views-ai.js, before views-data.js
================================================================ */

// Sub-views registry for Database section
const dbSubviews = {
  'db-import': 'Import',
  'db-accounts': 'Accounts',
  'db-categories': 'Categories',
  'db-logs': 'Import Logs',
  'db-inspector': 'Database',
};

// Register the Database section routing
registerView('database', 'Database', (root) => {
  const currentSubview = State.currentDbView || 'db-import';

  // Sub-nav buttons
  const subnav = document.createElement('div');
  subnav.className = 'card';
  subnav.style.display = 'grid';
  subnav.style.gridTemplateColumns = 'repeat(5, 1fr)';
  subnav.style.gap = '6px';
  subnav.style.padding = '10px';

  for (const [viewId, label] of Object.entries(dbSubviews)) {
    const btn = document.createElement('button');
    btn.className = `btn sm ${viewId === currentSubview ? '' : 'ghost'}`;
    btn.textContent = label;
    btn.style.borderRadius = '6px';
    btn.onclick = () => {
      State.currentDbView = viewId;
      lsSet('currentDbView', viewId);
      showView(viewId);
    };
    subnav.appendChild(btn);
  }

  root.appendChild(subnav);

  // Determine which subtab to load
  let subtabView = null;
  if (currentSubview === 'db-import') {
    subtabView = 'data';  // maps to existing data view
  } else if (currentSubview === 'db-accounts') {
    subtabView = 'db-accounts';
  } else if (currentSubview === 'db-categories') {
    subtabView = 'db-categories';
  } else if (currentSubview === 'db-logs') {
    subtabView = 'db-logs';
  } else if (currentSubview === 'db-inspector') {
    subtabView = 'db-inspector';
  }

  // Render the selected subtab (delegate to individual view handlers)
  if (subtabView && window['render' + subtabView.charAt(0).toUpperCase() + subtabView.slice(1)]) {
    window['render' + subtabView.charAt(0).toUpperCase() + subtabView.slice(1)](root);
  }
});

// Initialize currentDbView in State
if (!State.currentDbView) {
  State.currentDbView = lsGet('currentDbView', 'db-import');
}
