# CLAUDE.md — FinLens Architect Context

> Read this file at the start of every session. It tells you exactly what this project is, how it is built, and the rules you must follow when making any change.

---

## 1. What Is FinLens

FinLens is a **single-origin, zero-build, vanilla JavaScript personal finance dashboard** that runs entirely in the browser. There is no server, no npm, no bundler, no framework, and no TypeScript. The entry point is `index.html`; everything else is a plain `.js` file in the `js/` folder.

**Current version:** v1.9.1 (updated in `index.html` footer, `README.md`, and `CHANGELOG.md` on every release).

**What it does:** Imports CSV exports from Ally Bank (Checking + Savings) and Chase credit cards, parses and normalizes them into a unified transaction model, and renders a multi-tab financial dashboard with budgeting, debt tracking, savings forecasting, investment planning, and Claude-powered AI analysis.

---

## 2. Tech Stack

| Layer | Technology | Version / Source |
|---|---|---|
| Markup + CSS | Vanilla HTML5 / CSS custom properties | `index.html` |
| JavaScript | Vanilla ES2020+ (global scope) | `js/*.js` |
| CSV parsing | PapaParse | CDN 5.4.1 |
| Charts | Chart.js | CDN 4.4.1 |
| Date formatting | Day.js | CDN 1.11.10 |
| Markdown render | marked.js | jsDelivr 15.0.12 (pinned + SRI) |
| HTML sanitizer | DOMPurify | jsDelivr 3.4.17 (pinned + SRI) |
| AI | Anthropic Messages API (`claude-sonnet-5-5`, `AI_MODEL` in `views-ai.js`) | Direct browser fetch |
| Persistence | `finlens-state.json` via File System Access API → IndexedDB → `localStorage` (see §4.5) | Browser native |
| IndexedDB | Native — `finlens_db` (all app data, §19) and `finlens_fs` (CSV folder handle, §14) | Browser native |

Scripts that render model output (marked, DOMPurify) are version-pinned with `integrity`/`crossorigin` attributes. When bumping either, recompute the SRI hash from the exact file and update both `index.html` and this table.

**No build step.** Open `index.html` in Chrome/Edge/Arc/Brave and it just works. Safari and Firefox are supported but degrade gracefully on File System Access API features.

---

## 3. Project Structure

```
FinLens/
├── index.html              ← Single entry point: all CSS + HTML shell
├── CLAUDE.md               ← This file
├── CHANGELOG.md            ← Version history (update on every release)
├── data/                   ← CSV exports (not committed to git)
│   ├── ally_checking_transactions.csv
│   ├── ally_savings_transactions.csv
│   └── chase_transactions.csv
├── samples/                ← Synthetic CSVs (fake data) for demos and manual testing — committed
│   ├── ally_checking_sample.csv
│   ├── ally_savings_sample.csv
│   └── chase_card_sample.csv
├── docs/
│   └── archive/
│       ├── INDEXEDDB_PLAN.md         ← Completed spec (v1.4.0); retained for reference
│       └── IMPLEMENTATION_STATUS.md  ← Historical implementation notes
└── js/
    ├── core.js             ← State, helpers, CSV parsing, date range, account filter
    ├── aggregation.js      ← Pure data aggregation: sums, groupings, recurring detection
    ├── db.js               ← IndexedDB layer (finlens_db)
    ├── ui.js               ← View registry, drawer, theme, chart helpers, CRUD helpers
    ├── views-main.js       ← Overview, Transactions, Income, Bills, Spending, Transfers
    ├── views-plan.js       ← Budgeting, Savings Buckets, Debt Tracker, Trends
    ├── views-invest.js     ← Investing Ideas tab
    ├── views-forecast.js   ← Forecast Savings + Forecast Investments tabs
    ├── views-ai.js         ← AI Analysis tab (Claude integration)
    ├── views-data.js       ← Import, Accounts, Credit Cards, Categories (Settings tabs) + Import Logs
    ├── views-settings.js   ← Settings shell (tab bar) + General tab (display, Anthropic API key)
    ├── views-cleanup.js    ← Settings → Data & Reset: clean up imported data, DB, logs; start over (§20)
    ├── views-db.js         ← DB Schema diagram, DB Inspector, Changelog views (developer only)
    ├── views-database.js   ← Unused — not loaded by index.html; retained for reference
    └── init.js             ← App boot IIFE — event wiring, DB.open(), DB.loadAll(), first render
```

### Script load order (matters — no bundler enforces it)

```
core.js → aggregation.js → db.js → ui.js → views-main.js → views-plan.js → views-invest.js
       → views-forecast.js → views-ai.js → views-data.js
       → views-settings.js → views-cleanup.js → views-db.js → init.js
```

All scripts share the **global `window` scope**. A function defined in `core.js` is callable in any `views-*.js` without import statements.

---

## 4. Core Architecture

### 4.1 The State Object (`core.js`)

Single source of truth. Never bypass it.

```js
const State = {
  transactions: [],          // Transaction[] — populated by loadFiles()
  accounts: {},              // { [accountId]: Account } — keyed by accountId
  budgets: [],               // Budget[] — persisted
  buckets: [],               // SavingsBucket[] — persisted
  debts: [],                 // Debt[] — persisted
  bills: [],                 // Bill[] — persisted
  recurringConfirmed: {},    // { [key]: 'confirmed' | 'dismissed' }
  txOverrides: {},           // { [txId]: TxOverride } — user edits on transactions
  manualBalances: {},        // { [accountId]: number, [accountId+'_limit']: number, [accountId+'_initial']: number }
  categoryRules: [],         // { contains: string, category: string }[]
  categories: [],            // string[] — user-editable category list
  apiKey: '',                // Anthropic API key
  aiHistory: [],             // { timestamp, question, response }[]
  scenarios: [],             // Forecast scenario saves
  investAlloc: {},           // { [ticker]: userPct }
  range: { mode, start, end }, // Active date range
  selectedAccounts: 'all',  // 'all' | string[]
  theme: 'light',
  lastRefresh: null,
  fileMeta: [],              // Metadata about loaded CSV files
  pendingFiles: [],          // Files awaiting account assignment
  lastFolderName: '',
  fileAssignments: {},       // { [filename]: kind }
  accountOrder: [],          // [accountId, ...] — user-defined display order
  currentView: 'overview',
};
```

### 4.2 The Transaction Model

Transactions are created by `mkTx()` in `core.js` and never mutated directly — edits go through `State.txOverrides[tx.id]` and are persisted via `lsSet('txOverrides', ...)`.

```js
{
  id: string,              // Deterministic hash — per-source strategy; see §10 for full rules
  date: Date,
  description: string,     // May be overridden via txOverrides
  amount: number,          // Positive = income/credit, Negative = expense/debit
  categories: string[],    // Array; first element accessed via get category()
  get category(),          // Accessor: returns categories[0] || 'Other'
  account: string,         // accountId (e.g. 'ally_checking', 'ally_savings', 'chase_...')
  type: 'debit' | 'credit' | 'transfer' | 'payment',
  isRecurring: boolean,
  isBill: boolean,
  isSubscription: boolean,
  notes: string,
  balance: null,           // Always null — Ally does NOT export running balance; balance is
                           // computed from manually entered starting balance + transactions
  _originalDesc: string,   // Immutable original CSV description
}
```

### 4.3 The Account Model

```js
{
  id: string,    // e.g. 'ally_checking', 'ally_savings', 'chase_my_card_csv'
  name: string,  // Display name (user-editable via Data tab)
  kind: 'ally_checking' | 'ally_savings' | 'chase' | 'unknown',
  balance: null, // Not used directly — use currentBalances() or periodEndBalance()
  limit: null,   // Not used directly — use State.manualBalances[id+'_limit']
  sourceFile: string,
}
```

### 4.4 View Registration Pattern

Every view is registered in one of the `views-*.js` files. The pattern is strict:

```js
// Registration (top-level, executes on script load)
registerView('viewId', 'Page Title', (root) => {
  // root is a <section class="view active"> element
  // Always build elements and appendChild to root
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `...html string...`;
  root.appendChild(card);

  // Wire events after DOM insertion
  $('#someButton').onclick = () => { ... };

  // Charts ALWAYS go in setTimeout(..., 0) — DOM must exist first
  setTimeout(() => {
    new Chart($('#myChart'), { ... });
  }, 0);
});
```

**Never use `document.getElementById` directly** — use the `$(selector)` and `$$(selector)` shorthand helpers from `core.js`.

### 4.5 Persistence Layer (Filesystem → IndexedDB → localStorage)

**Write path:**
```
User action → State.xxx = newValue → lsSet('key', value)
                                         ↓
                              localStorage.setItem('finlens_key', JSON.stringify(value))
                                         ↓ (if DB._db ready)
                              DB.setState(key, value)  [fire-and-forget]
                                         ↓
                              IndexedDB app_state store
                                         ↓ (debounced, via _saveStateDebounced)
                              File System Access API
                                         ↓
                              finlens-state.json in user's backup folder
```

**Read path (on page load — init.js):**
```
loadStateFromFile() → found?
  ↓ YES: Load from finlens-state.json, Object.assign(State, loaded)
  ↓ NO: DB.open() + DB.loadAll() → IndexedDB
           → found? YES: Populate State from IndexedDB
           → NO: Fall back to localStorage defaults
```

**Key principles:**
- **Filesystem is the source of truth** — `finlens-state.json` contains the authoritative copy of all state.
- **Debounced writes** — Every 5 seconds (or on last mutation), `lsSet()` triggers `_saveStateDebounced()` which calls `saveStateToFile(State)`. This avoids excessive file I/O.
- **Survives browser cache clearing** — If the browser clears IndexedDB/localStorage, the filesystem file remains on disk and will be restored on the next page load.
- **Fallback chain** — If filesystem load fails, IndexedDB provides a session-local cache. If IndexedDB isn't available, localStorage defaults apply.
- Always use `lsSet(key, value)` and `lsGet(key, default)` — **never** call `localStorage` directly.
- The `finlens_` prefix is applied automatically by `lsSet`/`lsGet`.
- Don't call `saveStateToFile()` directly in hot paths — it's meant to be debounced via `_saveStateDebounced()` in `lsSet()`.
- **Never use transactions straight from JSON.** `JSON.parse` turns `date` into a string and freezes the `category` getter. `loadStateFromFile()` rebuilds them with `reconstituteTx()`, as `DB.loadAll()` does; any new code that reads transactions from JSON must do the same.
- **Secrets never reach the file.** `saveStateToFile()` deliberately omits `apiKey`, and `loadStateFromFile()` strips it from files written by ≤v1.7.0 (moving it to browser storage if needed, then scheduling a re-save). Keep both behaviors when changing the serialized field list.

---

## 5. Naming Conventions

| Thing | Convention | Examples |
|---|---|---|
| Functions | `camelCase` | `filteredTx()`, `byCategory()`, `detectRecurring()` |
| Constants | `UPPER_SNAKE_CASE` | `CHART_PALETTE`, `DEFAULT_RULES`, `BANK_SCHEMAS` |
| DOM element IDs | `camelCase` | `#txSearch`, `#acctFilter`, `#cfChart` |
| CSS classes | `kebab-case` | `.card`, `.amt-pos`, `.chart-wrap`, `.acct-group` |
| State keys | `camelCase` | `State.txOverrides`, `State.manualBalances` |
| localStorage keys | `camelCase` without prefix | `'budgets'`, `'txOverrides'`, `'apiKey'` |
| Account IDs | `snake_case` | `'ally_checking'`, `'ally_savings'`, `'chase_card_name'` |
| View IDs | `kebab-case` | `'overview'`, `'forecast-invest'`, `'bills'` |
| File names | `kebab-case` with module prefix | `views-plan.js`, `views-settings.js` |

---

## 6. CSS Architecture

All CSS lives in a single `<style>` block in `index.html`. There are no external CSS files.

### CSS Custom Properties (design tokens)

```css
/* Light theme (default) */
--sidebar, --sidebar-2, --sidebar-text, --sidebar-text-active, --sidebar-muted
--bg, --surface, --surface-2, --border
--text, --text-2, --text-3
--teal (#00C49A), --teal-soft
--amber (#F59E0B), --amber-soft
--red (#EF4444), --red-soft
--blue (#3B82F6), --purple (#8B5CF6)
--shadow, --radius (12px), --radius-sm (8px)
```

Dark mode is applied by setting `data-theme="dark"` on `<html>` and overriding the surface/text tokens only. **Never hard-code colors** — always use a CSS variable.

**Text contrast:** every text token must reach at least 4.5:1 (WCAG AA) on `--surface`, `--bg` and `--surface-2` in both themes. `--text-3` is the lightest allowed text color, so never fade text below it with `opacity`. Chart.js labels follow `--text-2` through `applyTheme()`.

### Key CSS component classes

```
.card          — white surface with border, shadow, padding
.btn           — teal primary button; .btn.ghost, .btn.danger, .btn.sm variants
.pill          — status badge; .pill.good (teal), .pill.warn (amber), .pill.bad (red)
.chip          — inline tag; .chip.sub, .chip.debit, .chip.credit
.tbl           — styled table (thead uppercase, hover row highlight)
.insight       — left-bordered callout; .insight.warn, .insight.bad
.input .select .textarea  — form fields
.progress      — progress bar; .progress.warn, .progress.bad
.chart-wrap    — Chart.js container (must have explicit height!)
.chart-wrap.tall (340px), .chart-wrap.short (160px), .chart-wrap.sm (200px)
.spark-wrap    — sparkline container (64px height)
.drawer        — right-side slide-in panel
.empty         — dashed placeholder when no data
.grid-4 .grid-3 .grid-2  — responsive grid layouts
.mono .num     — DM Mono font (tabular numbers)
```

---

## 7. Chart.js Rules

These rules exist because Chart.js will cause infinite layout loops if violated.

1. **Always** set `responsive: true, maintainAspectRatio: false`.
2. **Always** wrap `<canvas>` in a `.chart-wrap` div (or `.spark-wrap` for sparklines).
3. **Always** initialize charts inside `setTimeout(() => { new Chart(...) }, 0)` — the canvas must be in the DOM first.
4. **Always** destroy a chart before recreating it on the same canvas — or use a unique canvas ID per render.
5. **Never** let a chart container have `height: auto` — always an explicit pixel height.

```js
// Correct pattern
const card = document.createElement('div');
card.className = 'card';
card.innerHTML = `<div class="chart-wrap"><canvas id="myChart"></canvas></div>`;
root.appendChild(card);

setTimeout(() => {
  new Chart($('#myChart'), {
    type: 'bar',
    data: { ... },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      // ...
    }
  });
}, 0);
```

---

## 8. Key Helper Functions (core.js)

```js
// DOM
$(selector, root?)         // querySelector shorthand
$$(selector, root?)        // querySelectorAll → Array

// Formatting
fmt(n)                     // '$1,234.56' (2 decimals)
fmt0(n)                    // '$1,235' (0 decimals)
pct(n, decimals?)          // '12.3%'

// Persistence
lsGet(key, default)        // Read from localStorage (auto-prefixed)
lsSet(key, value)          // Write to localStorage + mirror to IndexedDB app_state + auto-save to filesystem (debounced)
loadStateFromFile()        // Read finlens-state.json from backup folder; returns loaded state or null if not found
saveStateToFile(state)     // Write state to finlens-state.json in backup folder (fire-and-forget async)
_saveStateDebounced()      // Debounced wrapper (5s) — called by lsSet()

// Data (core.js)
filteredTx()               // State.transactions filtered by active range + selected accounts
orderedAccounts()          // Object.values(State.accounts) in user-defined display order
autoCategory(description)  // Returns category string based on rules + DEFAULT_RULES

// Aggregation (aggregation.js — loaded after core.js)
byCategory(txs, filter)    // { category, amount }[] sorted by amount desc
byMonth(txs)               // { month, income, expense, transfer }[] sorted by month
sumIncome(txs)             // Sum of positive non-transfer, non-payment amounts
sumExpense(txs)            // Sum of abs(negative non-transfer amounts)
sumTransfers(txs)          // Sum of transfer amounts / 2 (to avoid double-counting)
currentBalances()          // { [accountId]: number } — best available current balances
periodEndBalance(accountId) // Balance at end of the active date range
detectRecurring()          // Recurring charge detection across all transactions
detectRecurringDeposits()  // Recurring income detection
accountDateRange(accountId) // { min: Date, max: Date } — earliest and latest transaction dates for an account

// Utilities
hash(str)                  // Deterministic 'tx' + base36 hash for transaction IDs
escapeHtml(str)            // Escape HTML entities for safe innerHTML insertion
escapeAttr(str)            // Escape for use in HTML attribute strings
renderMarkdown(md)         // marked → DOMPurify (no images/styles/forms) → safe HTML string; escaped-text fallback
lsClearAll()               // Remove every finlens_* localStorage key — only "Start over" should call it
deleteIndexedDB(name)      // Delete a whole IndexedDB database → 'deleted' | 'blocked' | 'error'

// Folder + state-file maintenance (call from a click handler — permission prompts need a user gesture)
folderWithWriteAccess()    // Connected folder handle with read-write access, or null
saveStateNow()             // Write finlens-state.json immediately → 'saved' | 'no-folder' | 'denied'
retireStateFile(mode)      // 'archive' (→ finlens-state-backup-DDMMYYYY[-n].json, key stripped) | 'delete'
forgetDataFolder()         // Forget the folder handle + name; nothing on disk changes
downloadFile(name, content, mime)  // Trigger browser file download
debounce(fn, ms)           // Returns debounced function
parseDate(s)               // Parse date string/object → Date | null
monthKey(d)                // 'YYYY-MM' string
describeRange()            // Human-readable date range label
```

---

## 9. UI Helpers (ui.js)

```js
// Views
registerView(id, title, renderFn)   // Register a view (called at module load time)
showView(id)                         // Navigate to a view — re-renders from scratch
renderActive()                       // Re-render current view (call after state mutations)

// Drawer (single shared drawer #txDrawer)
openDrawer(htmlString)               // Open right-side drawer with HTML content
closeDrawer()                        // Close drawer

// Theme
applyTheme()                         // Set data-theme attribute from State.theme

// Chart
CHART_PALETTE                        // 12-color array, use for multi-series charts
CHART_DEFAULTS                       // { responsive, maintainAspectRatio, legend: false }
mergeChartOpts(extra)                // Merge extra options into CHART_DEFAULTS

// Rendering utilities
emptyCard(message)                   // Returns HTML string for empty-state card
renderHeatmap(holder, txs)          // Render spending heatmap into a DOM element
renderUpcomingCal(holder)            // Render bills mini-calendar
renderTransferFlow(holder, paths)    // Render account flow SVG

// CRUD helpers for Bills, Budgets, Buckets, Debts (all in ui.js)
showBillForm(existing?), saveBill()
editBudget(i), saveBudget(i), deleteBudget(i), seedBudgets()
editBucket(i), saveBucket(i), deleteBucket(i)
editDebt(i), saveDebt(i), deleteDebt(i), simulatePayoff(debts, extra)
confirmRecurring(...), dismissRecurring(key)
addCatRule(), delCatRule(i), recategorizeAll()
exportAllData(), importJsonFile(ev)
clearAllData()                       // = DataCleanup.startOver('archive') — full reset + reload (§20)
```

---

## 10. CSV Parsing Rules

### Supported file formats

| Account | Kind | Detection |
|---|---|---|
| Ally Checking | `ally_checking` | Filename contains `check` OR has `Type`+`Amount` columns |
| Ally Savings | `ally_savings` | Filename contains `saving` |
| Chase Credit Card | `chase` | Filename contains `chase`/`card`/`credit` OR has `Transaction Date` column |

### Actual CSV column structure

**Ally Checking & Savings** — columns: `Date`, `Time`, `Amount`, `Type`, `Description`

| Column | Format | Notes |
|---|---|---|
| `Date` | YYYY-MM-DD | Transaction date |
| `Time` | HH:MM:SS | Bank-assigned timestamp — real and meaningful, not zeros |
| `Amount` | number | Negative = withdrawal, Positive = deposit |
| `Type` | string | `Withdrawal` or `Deposit` |
| `Description` | string | Payee / memo text |

**Chase Credit Card** — columns: `Transaction Date`, `Post Date`, `Description`, `Category`, `Type`, `Amount`, `Memo`

| Column | Format | Notes |
|---|---|---|
| `Transaction Date` | YYYY-MM-DD | Date charge occurred — no time component |
| `Post Date` | MM/DD/YYYY | Date charge settled — may differ by 1–3 days; **different format from Transaction Date in the same file** |
| `Description` | string | Merchant name |
| `Category` | string | Chase-assigned category — used for initial auto-categorization |
| `Type` | string | `Sale`, `Payment`, or `Return` |
| `Amount` | number | Negative = charge, Positive = payment/refund |
| `Memo` | string | Always empty in practice — **ignored entirely** |

### Critical: Ally CSV headers have leading spaces

Ally exports headers like `" Date", " Time", " Amount", " Type", " Description"` — each header has a leading space. PapaParse is configured with `transformHeader: h => h.trim()`. **Do not remove this.**

### Amount sign convention

- **Negative** = money leaving the account (withdrawal for Ally; charge for Chase)
- **Positive** = money entering the account (deposit for Ally; payment/refund for Chase)

This is consistent across all account types.

### Transaction ID hash strategy (deduplication)

The deterministic `id` for each transaction is computed per source to survive re-uploads without creating duplicates:

| Source | Hash inputs | Tiebreaker rationale |
|---|---|---|
| Ally Checking | `date \| time \| description \| amount \| accountId` | `Time` is bank-assigned (HH:MM:SS), always meaningful — collision risk is near zero |
| Ally Savings | `date \| time \| description \| amount \| accountId` | Same as checking |
| Chase | `transactionDate \| postDate \| description \| amount \| accountId` | No timestamp; post date disambiguates most cases |

**Identical rows (occurrence suffix):** Truly identical Chase rows (same transaction date, post date, description, and amount) do occur in practice — e.g. multiple TAXMANIA charges on the same day for the same amount. `parseCsvFile()` counts them **within the file**: the first keeps the base hash, the 2nd gets `_2`, the 3rd `_3` (via the `occurrence` argument of `normalizeRow()` → `mkTx()`). The suffix is part of the ID everywhere — memory, IndexedDB and `txOverrides`. Because identical rows are interchangeable, file order is enough to make the suffix stable across re-uploads.

- Suffixes are allowed when `schema.allowOccurrenceSuffix` is true, or when it's unset and the schema has no `time` column (custom schemas). Ally sets it to `false`: with a bank-assigned `Time`, an identical row is a true duplicate and only the first copy is kept.
- **Never assign suffixes on a database collision.** Up to v1.8.0, `DB.importTransactions()` did, which re-inserted every row of a re-uploaded Chase file as an `_2` copy.

**Re-upload safety:** IDs are final when they reach `DB.importTransactions()`, which reads the stored keys once and skips any ID it already holds. Re-uploading a file — or a newer export with rows appended — inserts only genuinely new rows. On each import it also deletes leftover copies from the old bug: a suffixed row whose base transaction is in the file but whose exact ID is not. Same-day identical rows always appear together in a bank export, so the file is authoritative for how many copies exist. The import results card reports these as "leftover duplicate copies removed".

---

## 11. Transfer Detection

`detectTransfers()` runs after every `loadFiles()`. It does two passes:

1. **Paired match:** Finds transactions across different accounts with equal-and-opposite amounts within 2 days. Sets `type='transfer'`, `categories=['Transfer out']` (negative) or `categories=['Transfer in']` (positive).
2. **Keyword match:** Marks unmatched transactions whose description matches `/transfer|zelle|ach|venmo|paypal|coinbase|savings booster/i` by direction.

**Both legs of a transfer are kept.** There is no deduplication. The `Transfers` view pairs them visually.

**Transfer keywords** are now editable in the Transfers tab (bottom section) instead of Settings. The `reapplyTransferKeywords()` helper reruns `detectTransfers()` after a keyword change.

---

## 11.1 Payment Type

`type='payment'` is set in `normalizeRow()` when `rawType` equals `"Payment"` (case-insensitive). This occurs on Chase credit card uploads where a payment toward the card balance is recorded as a positive-amount transaction with Chase `Type = "Payment"`. Payment transactions are **excluded from income sums** (`sumIncome()` filters them out) to avoid double-counting. They are distinct from `'credit'` (which represents purchase refunds/credits) and `'transfer'` (which represents inter-account moves).

---

## 12. Coding Standards

### HTML generation

- Use template literals for HTML strings in `innerHTML`. Always call `escapeHtml()` on any user-supplied string before inserting it.
- Use `escapeAttr()` for strings inserted into HTML attribute values.
- Never use `eval()` or `new Function()`.
- Render Markdown **only** through `renderMarkdown()` — never call `marked.parse()` directly. Model output and anything derived from CSV text is untrusted.

```js
// CORRECT
td.innerHTML = `<span>${escapeHtml(t.description)}</span>`;

// WRONG — XSS risk
td.innerHTML = `<span>${t.description}</span>`;
```

### Event wiring

- **Prefer** `element.addEventListener` or `element.onclick = fn` **after** inserting the element into the DOM.
- Use `data-*` attributes instead of inline `onclick` strings when the value could contain special characters (e.g., category names with quotes).

```js
// PREFERRED — no string escaping issues
el.dataset.spCatIdx = i;
el.addEventListener('click', () => { spendingDrillCategory = cats[+el.dataset.spCatIdx].category; });

// AVOID for dynamic string values (ok for static integer indexes)
el.innerHTML = `<button onclick="editBudget(${i})">Edit</button>`;
```

### State mutations

- **Always** call `lsSet(key, value)` after mutating a State array or object — State is in-memory and not a proxy.
- **Always** call `renderActive()` after mutations that should update the UI.
- Do not mutate transaction `amount` or `date` — these are immutable source-of-truth values.
- Edits to transaction fields (description, categories, type, notes, flags) go into `State.txOverrides[tx.id]`.

### Adding a new persisted field

1. Add the field to `State` with `lsGet('myKey', defaultValue)`.
2. That's it — `lsSet` automatically mirrors to IndexedDB `app_state` and localStorage.

### Sidebar Navigation Structure (v1.6.0)

```
Finances:  overview, transactions
           └─ Transactions has filter pills: All · Income · Spending · Bills · Payments · Transfers
Plan:      budgets, buckets, debt, investments, forecast
           └─ Forecast has sub-tabs: Savings · Investments
Insights:  trends, ai
⚙️ Settings  ← standalone nav link, no section wrapper, no sub-items in sidebar
           └─ Settings page has internal tabs: General · Import · Accounts · Credit Cards · Categories · Data & Reset
              (General holds Display and Anthropic API Key; all clearing/reset lives in Data & Reset)
```

View registrations by file:
- `views-main.js` — overview, transactions (income/spending/bills/payments/transfers are filter pills, not separate views)
- `views-plan.js` — budgets, buckets, debt, trends
- `views-invest.js` — investments (`_renderForecastInvest` is a helper, not a registered view)
- `views-forecast.js` — forecast (tabbed: calls `_renderForecastSavings` / `_renderForecastInvest`)
- `views-ai.js` — ai
- `views-data.js` — import, accounts, credit-cards, categories
- `views-settings.js` — settings (internal use only, not in nav)
- `views-cleanup.js` — data-cleanup (Settings → Data & Reset tab)
- `views-db.js` — db-inspector, db-schema, changelog (not in nav; developer reference only)

The `data-section` attribute values are `finances`, `plan`, `insights` — the toggle JS derives section IDs as `ns-{data-section}`. Settings is a standalone `<a class="nav">` link at the bottom of the sidebar (no section wrapper, no sub-items).

### Nav icon rule

**Use emojis as icons for sidebar nav items. Never use `<span class="ic">` symbol characters.** Emojis only — no mixing of symbol icons and emojis. Section group headers (Finances, Plan, Insights) are plain text with no icon. Current emoji assignments:

| View | Emoji |
|---|---|
| Overview | 🏠 |
| Transactions | 💳 |
| Budget | 📊 |
| Buckets | 🪣 |
| Debt | 📉 |
| Investments | 📈 |
| Forecast | 🔮 |
| Trends | 🔍 |
| AI Analysis | ✨ |
| Settings | ⚙️ |

When adding a new nav item, pick a distinct emoji that hasn't been used above and add it to this table.

### Filters vs sub-tabs

- Use **filter pills** when it is the same underlying data viewed through different lenses (e.g. Transactions filtered by Income / Spending / Bills).
- Use **sub-tabs** when the content is meaningfully different — different inputs, charts, or logic (e.g. Forecast Savings vs Forecast Investments).

### Adding a new view

1. Create or extend the appropriate `views-*.js` file.
2. Call `registerView('myViewId', 'Page Title', (root) => { ... })`.
3. Add a `<a class="nav" data-view="myViewId">` in `index.html`'s sidebar — plain text label, no icon.
4. Views are always re-rendered from scratch on `showView()` — do not cache DOM across renders.

### Rendering approach

Views build a fresh DOM on every `showView()` call. This is intentional. Do not store references to view DOM nodes between renders — they will be garbage-collected.

---

## 13. AI Integration (views-ai.js)

- Uses the model in `AI_MODEL` (currently `claude-sonnet-5-5`) via direct browser fetch to `https://api.anthropic.com/v1/messages`. `claude-sonnet-4-20250514` was retired 2026-06-15 — check Anthropic's model deprecations page before changing models.
- Requires `anthropic-dangerous-direct-browser-access: true` header (CORS bypass).
- API key is stored in `State.apiKey` (localStorage + IndexedDB `app_state` only — **never** in `finlens-state.json`, see §4.5). It is entered in **Settings → General → Anthropic API Key**; the settings card never renders the stored value back into the DOM. **Never log or expose it.**
- `buildFinancialSummary()` assembles a plain-text snapshot of current State. It is sent inside `<financial_data>` tags, and the system prompt tells the model to treat that content as data, not instructions (account names and merchant descriptions come from CSVs and are untrusted).
- Responses are read from every `text` content block (don't assume `content[0]` is text) and rendered with `renderMarkdown()` — never `marked.parse()`.
- AI history is capped at 50 entries (`State.aiHistory`).
- If updating the Claude model string, update `AI_MODEL` in `views-ai.js` and mention it in CHANGELOG.md.

---

## 14. File System Access — CSV Folder + State File

The old `FileStorage` object and `finlens-data.json` were removed in v1.4.1.

`views-data.js` stores the user's selected CSV folder handle in `idbGet`/`idbSet('csvDirHandle')`. That one handle is used for two things:

1. **Auto-reloading CSVs** after a page refresh when IndexedDB has no transactions.
2. **The state file** — `loadStateFromFile()` / `saveStateToFile()` read and write `finlens-state.json` in the same folder (the primary persistence source, §4.5).

The handle lives in a separate `finlens_fs` database (distinct from `finlens_db`), accessed through the lightweight `_idbOpen`/`idbGet`/`idbSet`/`idbDel` helpers in `core.js`. `finlens-state.json` is git-ignored by name, wherever the folder is.

---

## 15. What NOT to Do

- **Do not add npm, a bundler, or a build step.** The project is intentionally zero-dependency local.
- **Do not use ES module `import/export`** — all files share global scope by design.
- **Do not use `async`/`await` in view render functions** — renders are synchronous. Async work (API calls, file I/O) belongs in handler functions, not in the `registerView` callback.
- **Do not add new CDN scripts without adding them to `index.html`** and documenting the version in this file.
- **Do not call `localStorage` directly** — always use `lsSet`/`lsGet`.
- **Do not create CSS files** — all CSS belongs in the `<style>` block in `index.html`.
- **Do not hard-code colors** — use CSS custom properties.
- **Do not mutate `tx.amount` or `tx.date`** — immutable source values.
- **Do not create new global variables** — use `const`/`let` at module scope where possible, or attach to an existing namespace object.
- **Do not write secrets to disk** — `apiKey` must never appear in `finlens-state.json`, exports, or logs.
- **Do not call `marked.parse()` directly** — use `renderMarkdown()`.
- **Do not commit real financial data** — use `samples/` (synthetic) for demos; `data/`, `finlens-state.json` (and its `finlens-state-backup-*` copies) and exports are git-ignored.
- **Do not add a new place that stores data without updating §20** — "Start over" must erase it, or a reset silently leaves data behind.
- **Do not modify the user's CSV files** — cleanup and reset only ever touch FinLens's own storage and `finlens-state.json`.

---

## 16. Common Patterns Quick Reference

### Filter transactions for a view
```js
const txs = filteredTx();                            // respects date range + account filter
const expenses = txs.filter(t => t.amount < 0 && t.type !== 'transfer');
const income = txs.filter(t => t.amount > 0 && t.type !== 'transfer');
```

### Render a KPI card row
```js
const m = document.createElement('div');
m.className = 'grid grid-4';
m.innerHTML = `
  <div class="card"><h3>Label</h3><div class="big num">${fmt(value)}</div><div class="footnote">context</div></div>`;
root.appendChild(m);
```

### Open transaction edit drawer
```js
// Already implemented globally — just call:
showTxDrawer(txId);
```

### Save a state mutation and re-render
```js
State.bills.push(newBill);
lsSet('bills', State.bills);
renderActive();
```

### Format a date with Day.js
```js
dayjs(t.date).format('MMM D, YYYY')   // 'Apr 26, 2026'
dayjs(t.date).format('YYYY-MM-DD')    // '2026-04-26'
dayjs(t.date).format('MMM D')         // 'Apr 26'
```

---

## 17. Changelog Discipline

Every change — no matter how small — must have an entry in `CHANGELOG.md` following the existing format:

```markdown
## [X.Y.Z] — YYYY-MM-DD

### Category (View affected or "Technical")
- **Feature name** — what changed and why, referencing affected functions/files.
```

Bump the patch version for bug fixes, minor version for new features, major version for architectural changes.

**On every version bump, all four of these must be updated — no exceptions:**

1. `CHANGELOG.md` — new entry at the top with the new version number and date.
2. `index.html` — version string in the sidebar footer (search for `· FinLens`); currently on line ~326:
   ```html
   <div style="color:var(--text-3);font-size:11px">vX.Y.Z · FinLens</div>
   ```
3. `README.md` — version string in the header badge and the footer line.
4. `js/views-settings.js` — the `FinLens vX.Y.Z` line in the General tab's Display card.

Also update **Current version** in §1 of this file. Never close out a change without updating all of these.

---

## 18. Supported Account Types

| Kind | Description | Balance source |
|---|---|---|
| `ally_checking` | Ally Bank Checking | Computed from transactions + manually entered starting balance (Ally does not export running balance) |
| `ally_savings` | Ally Bank Savings | Computed from transactions + manually entered starting balance (Ally does not export running balance) |
| `chase` | Chase credit card(s) | Manual override in Data tab |
| `unknown` | Any other CSV | Computed from transactions + initial balance |

Multiple Chase card files can be loaded simultaneously. Each gets a unique `accountId` derived from the filename: `chase_` + sanitized filename.

---

*Last updated: v1.9.1 — 2026-10-23 (§4.5 rehydrate transactions loaded from JSON; v1.9.0: §20 Data & Reset added; v1.8.1: §10 re-upload dedup rewritten for the occurrence-suffix fix; v1.8.0: AI Analysis restored with API-key and output hardening; `renderMarkdown()` added; `samples/` added; §1–3, §13, §14, §17 corrected to match the code)*

---

## 19. IndexedDB Architecture (v1.4.0) + Database Views (v1.4.1)

The full IndexedDB implementation is live. See **`docs/archive/INDEXEDDB_PLAN.md`** for the original spec.

### What changed
- **`js/db.js`** — new file, loaded after `core.js`. Exposes the `DB` object and `reconstituteTx()` helper.
- **`DB.open()`** — opens `finlens_db` v1, creates all 5 object stores, migrates `localStorage → app_state` on first run.
- **`DB.loadAll()`** — called at boot in `init.js`. Restores all State from IndexedDB (including transactions). Users do not need to re-upload CSVs after a page refresh.
- **`lsSet(k, v)`** — now also calls `DB.setState(k, v)` fire-and-forget when DB is ready. All existing `lsSet` call sites work unchanged.
- **`State.transactions`** remains the in-memory working array. All views use `filteredTx()` unchanged.
- **Bank Schema Registry** — `BANK_SCHEMAS` (global in `core.js`) drives CSV parsing. `detectSchema()` + `normalizeRow()` replace the old hardcoded normalizers.
- **Transfer Keywords** — `State.transferKeywords` is user-editable from Settings. `detectTransfers()` builds its regex from this list.

### Adding a new bank
Add a new object to `BANK_SCHEMAS` in `core.js`. No other code changes needed if the bank follows standard column conventions (`date`, `amount`, `description`). For non-standard conventions use: `amountSign: 'inverted'`, custom `columns` map, `dateFormat` (`'YYYY-MM-DD'` | `'MM/DD/YYYY'` | `'DD/MM/YYYY'`), and `postDateFormat` if the post-date column uses a different format than the primary date column (see Chase schema).

### Deferred
- Column Mapping UI for truly unknown CSV formats (show a modal when `detectSchema()` returns null).
- Forecast Savings account-driven inputs (see §4 in INDEXEDDB_PLAN.md — separate task).

---

## 20. Data Cleanup & Reset (views-cleanup.js)

**Settings → 🧹 Data & Reset** is the only place that clears data. All actions live on the `DataCleanup` namespace object.

### Where FinLens keeps data

| Place | What | Cleared by |
|---|---|---|
| Memory | `State` | every action (then `renderActive()`) |
| `localStorage` | `finlens_*` keys via `lsSet`/`lsGet` (plus `finlens_navCollapsed`) | per-item `lsSet(key, [])`; Start over → `lsClearAll()` |
| IndexedDB `finlens_db` | `DB.STORES`: transactions, tx_overrides, accounts, import_log, app_state | `DB.clearStores([...])`; Start over → `DB.destroy()` |
| IndexedDB `finlens_fs` | `csvDirHandle` (the connected folder) | Disconnect → `forgetDataFolder()`; Start over → `deleteIndexedDB('finlens_fs')` |
| Disk | `finlens-state.json` in the connected folder | rewritten by `saveStateNow()` after clears; Start over → `retireStateFile()` |

CSV files on disk are **never** modified.

### Actions

| Action | Does | Keeps |
|---|---|---|
| Clear transactions & accounts | Empties memory + `transactions`/`accounts` stores | Plans, edits, account labels/balances, settings |
| Clear import log | Empties `import_log` | Everything else |
| Clear transaction edits | `txOverrides` + `tx_overrides` store; rebuilds loaded transactions with `reconstituteTx(raw, {})` | — |
| Clear budgets / bills / buckets / debts / AI history | `State[key] = []` + `lsSet` | — |
| Rebuild from folder | Clears transactions, accounts, import log, then `reloadFromDirHandle()` | Plans, edits, settings |
| Disconnect folder | `forgetDataFolder()` — stops CSV auto-reload and state-file writes | Files on disk |
| Start over | `retireStateFile()` → forget handle → `DB.destroy()` → delete `finlens_fs` → `lsClearAll()` → alert → reload | CSV files (and a backup copy of the state file, if chosen) |

### Rules

- **Rewrite the state file after clearing anything it holds.** `finlens-state.json` is the first thing loaded at boot, so a stale file would restore cleared data. `_finish()` calls `saveStateNow()` and warns if write access was refused.
- **A connected folder re-imports its CSVs** at boot whenever no transactions are loaded (§14). Clearing transactions without disconnecting is effectively "re-import on next load"; the tab says so.
- **Permission prompts need a fresh user gesture.** Destructive buttons use click-again-to-confirm (no `confirm()` dialog, which can outlast the ~5 s activation window), and actions ask for folder access before doing slow work.
- **Start over must leave nothing behind.** It sets `State._resetInProgress` so a pending debounced save can't re-create the file, and `DB.open()` registers `onversionchange` so other tabs release the database. `idbGet`/`idbSet`/`idbDel` close their connections so `finlens_fs` can be deleted.
- `clearAllData()` is kept as a wrapper for `DataCleanup.startOver('archive')`. Up to v1.8.1 it only cleared `localStorage`, which IndexedDB and the state file then restored on reload.
