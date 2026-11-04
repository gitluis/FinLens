# CLAUDE.md — FinLens Architect Context

> Read this file at the start of every session. It tells you exactly what this project is, how it is built, and the rules you must follow when making any change.

---

## 0. Workflow — Branches, Pull Requests and Approvals (read first)

Nothing reaches `master` except through a reviewed pull request. This is the owner's (Luis's) standing rule.

### One branch and one PR per change

- **New features, bug fixes and major feature changes each get their own branch and their own PR.** Don't bundle a bug fix into a feature PR, or two features into one PR.
- **Minor changes may be grouped** into a single branch and PR — typos, doc wording, small refactors, version or changelog housekeeping.
- **Revisions requested in review go on that PR's own branch** (new commits), not into a new PR.
- **Never commit directly to `master`.** Never force-push a branch that has an open PR.
- **Branch names:** short, kebab-case, describing the change, e.g. `fix-card-reimport-duplicates`, `data-cleanup-and-reset`, `docs-branch-pr-workflow`.

### What every PR includes

- **CHANGELOG and version** bumped per §17.
- **A description** with a summary, the cause (for bugs), what changed, how it was tested, and a "please check before merging" list.
- **Tests run** before opening the PR (headless browser checks against `samples/`). Report results honestly, including anything not verified.

### Stacked PRs

- **When a change depends on an unmerged PR,** branch from that PR's branch and set it as the new PR's base. Say so at the top of the description.
- **When an earlier PR in the stack gets new commits,** merge it forward into every later branch so the stack stays consistent.
- **Merge in order.** After a base PR merges, retarget the next PR to `master` if GitHub doesn't do it automatically.

### Approval before merging

A PR is merged only after Luis approves it, in one of two ways:

1. **On GitHub** — he merges the PR himself, or leaves a comment approving it. (PRs are opened under his own account, and GitHub doesn't let an author formally approve their own PR, so a comment or merge is the GitHub form of approval.)
2. **In chat** — he tells Claude it's approved. **Before merging, Claude posts a comment on the PR recording that approval** as evidence:
   - who approved;
   - the date;
   - his exact words, quoted;
   - a link to the chat or session.

   Only then does Claude merge. No recorded approval means no merge, even if the PR looks ready.

An approval covers that PR at the commit it was given for. New commits pushed afterwards need a fresh approval.

### GitHub enforcement (pending)

Branch protection isn't available yet: GitHub Free only offers it on public repositories, and this one is private. Once the repo is public, or on GitHub Pro, protect `master` with:

- **Require a pull request before merging**, with **0 required approvals**. Approvals can't be required, because the author can't approve their own PR, and chat approvals are recorded as comments instead.
- **Block force pushes and branch deletion.**
- **Apply the rule to admins too**, so nobody bypasses it.

Until then, this section is the rule.

---

## 1. What Is FinLens

FinLens is a **single-origin, zero-build, vanilla JavaScript personal finance dashboard** that runs entirely in the browser. There is no server, no npm, no bundler, no framework, and no TypeScript. The entry point is `index.html`; everything else is a plain `.js` file in the `js/` folder.

**Current version:** v1.16.16 (updated in `index.html` footer, `README.md`, and `CHANGELOG.md` on every release).

**What it does:** Imports CSV exports from a bank (checking + savings) and credit cards, parses and normalizes them into a unified transaction model, and renders a multi-tab financial dashboard with budgeting, debt tracking, savings forecasting, investment planning, and Claude-powered AI analysis.

**Desktop only** (Luis, 2026-11-02): FinLens targets desktop browsers; don't spend work on phone layouts. A separate mobile app is planned. The existing responsive CSS stays.

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
│   ├── checking_transactions.csv
│   ├── savings_transactions.csv
│   └── credit_card_transactions.csv
├── samples/                ← Synthetic CSVs (fake data) for demos, manual testing and the AI eval — committed
│   ├── checking_sample.csv
│   ├── savings_sample.csv
│   └── credit_card_sample.csv
├── docs/
│   ├── EVAL.md                       ← AI Analysis grounding eval: method + results (exported by the AI Eval view) + hand-written Runs table
│   ├── eval-results.json             ← Raw answers + per-figure classifications for that run
│   ├── eval-runs/vX.Y.Z/             ← Earlier runs: each one's EVAL.md + eval-results.json, as published
│   └── archive/
│       ├── INDEXEDDB_PLAN.md         ← Completed spec (v1.4.0); retained for reference
│       └── IMPLEMENTATION_STATUS.md  ← Historical implementation notes
└── js/
    ├── core.js             ← State, helpers, CSV parsing, date range, account filter
    ├── aggregation.js      ← Pure data aggregation: sums, groupings, recurring detection
    ├── db.js               ← IndexedDB layer (finlens_db)
    ├── migrate.js          ← Rewrites data saved by older versions: account codes, plan links (§22)
    ├── ui.js               ← View registry, drawer, theme, chart helpers, CRUD helpers
    ├── views-main.js       ← Overview, Transactions, Income, Bills, Spending, Transfers
    ├── views-plan.js       ← Budget, Savings buckets, Debt tracker (Plan, v1.15.0); Trends (v1.16.0)
    ├── views-invest.js     ← Investing ideas + the Forecast → Investments tab (_renderForecastInvest)
    ├── views-forecast.js   ← Forecast: Savings and Investments tabs, saved scenarios
    ├── views-ai.js         ← AI Analysis tab (Claude integration): quick analyses, your own question, history
    ├── views-data.js       ← Settings tabs Import, Accounts, Credit cards, Categories; folder + sync badge; sample data; Import Logs
    ├── views-settings.js   ← Settings shell (tab bar) + General tab (display, Anthropic API key)
    ├── views-cleanup.js    ← Settings → Data & reset: what's stored, clean up, JSON export/import, start over (§20)
    ├── views-db.js         ← DB Schema diagram, DB Inspector, Changelog views (developer only; Changelog reads CHANGELOG.md)
    ├── views-eval.js       ← AI Eval: grounding eval for AI Analysis (developer only, §21)
    └── init.js             ← App boot IIFE — event wiring, DB.open(), DB.loadAll(), first render
```

### Script load order (matters — no bundler enforces it)

```
core.js → aggregation.js → db.js → migrate.js → ui.js → views-main.js → views-plan.js → views-invest.js
       → views-forecast.js → views-ai.js → views-data.js
       → views-settings.js → views-cleanup.js → views-db.js → views-eval.js → init.js
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
  bills: [],                 // Bill[] — persisted (shape below)
  recurringConfirmed: {},    // { [recurringKey]: 'confirmed' | 'dismissed' } — Bills → Spotted recurring charges; Undo deletes the key
  txOverrides: {},           // { [txId]: TxOverride } — user edits on transactions (shape below)
  manualBalances: {},        // { [accountId]: number, [accountId+'_limit']: number, [accountId+'_initial']: number }
  categoryRules: [],         // { contains: string, category: string }[]
  categories: [],            // string[] — user-editable category list
  apiKey: '',                // Anthropic API key
  aiHistory: [],             // { timestamp, question, response, truncated?, model? }[] — model since v1.16.0
  scenarios: [],             // Scenario[] — Forecast → Savings, up to 10 (shape below)
  investAlloc: {},           // { [ticker]: userPct } — Investing ideas "My %" (0 / missing = not in the mix)
  debtPlan: { strategy, extra }, // Debt payoff plan: 'avalanche' | 'snowball' | 'minimum', extra $ a month (v1.15.0)
  cardDetails: {},           // { [cardAccountId]: { apr, dueDay } } — Settings → Credit cards (v1.16.0); a linked debt's own apr/dueDay win
  sampleData: false,         // true while the transactions are the samples/ files ("Try it with sample data", v1.16.0)
  range: { mode, start, end }, // Active date range
  selectedAccounts: 'all',  // 'all' | string[]
  theme: 'light',             // saved and loaded but unused: light only for now (dark theme taken out in v1.13.0)
  lastRefresh: null,
  fileMeta: [],              // Metadata about loaded CSV files
  pendingFiles: [],          // Files awaiting account assignment
  lastFolderName: '',
  csvAutoImportPaused: false, // true after "Clear transactions & accounts" with a folder connected (§20)
  fileAssignments: {},       // { [filename]: kind }
  accountOrder: [],          // [accountId, ...] — user-defined display order; keeps ids of accounts not loaded (§18)
  accountLabels: {},         // { [accountId]: name you typed } — acctName() shows it first; an empty name removes it (§18)
  currentView: 'overview',
};
```

**Bill** (an entry of `State.bills`, v1.14.0):

```js
{
  merchant: string,          // the name shown
  amount: number,
  category: string,
  frequency: 'Monthly' | 'Bi-weekly' | 'Weekly' | 'Quarterly' | 'Annual' | 'One-time',   // BILL_FREQS
  dueDate: 'YYYY-MM-DD',     // the stored due date; billNextDue() moves it on past repeats already paid
  paid: boolean,
  source: 'auto' | 'manual',
  account?: string,          // "Pays from" — an accountId, '' when not set
  subscription?: boolean,    // unset on older bills: billIsSubscription() guesses from category/name
  recurringKey?: string,     // recurringKey() of the charge it was confirmed from; finds its payments
}
```

The optional fields live inside `bills`, so they're saved, loaded, exported and cleared with it. "Last paid" and "Next due" are computed from the transactions (`billLastPaid()`, `billNextDue()`), never stored.

**Plan records (v1.15.0).** New fields live inside the existing arrays; only `debtPlan` is a new top-level key.

**Ids (v1.16.7).** Every budget, bucket and debt has a stable `id`: `'bud_'`, `'bkt_'` or `'dbt_'` plus 10 random base-36 characters (`newPlanId()`, core.js). It's given when the item is created (the drawers, + New bucket, Use starter budget, a debt started from a card) and kept when it's edited. Items saved before v1.16.7 get `'<prefix>_m<n>'` from the migration (§22). An id is a name, not a position: never derive one from the list order.

```js
// Budget (State.budgets)
{ id, name, limit: number /* a month */, categories: string[], color?: '#hex' /* before v1.15.0; kept, not shown */ }
// Bucket (State.buckets)
{ id, name, goal, current, targetDate: 'YYYY-MM-DD' | '',
  icon?: 'shield'|'plane'|'laptop'|'wrench'|'home'|'gift'|'heart'|'book'|'star',   // BUCKET_ICONS
  hue?: 'accent'|'pink'|'sky'|'card'|'good'|'violet'|'teal'|'warn' }               // BUCKET_HUES
  // older buckets have an emoji icon and a hex color: they show an icon guessed from the name and a hue by position
// Debt (State.debts)
{ id, name, type: 'Credit Card'|'Personal Loan'|'Student Loan'|'Auto Loan'|'Mortgage'|'Other',
  balance, apr /* % */, minPayment, limit, dueDay,
  account?: string }   // a credit card account: balance and limit then come from it (debtBalance(), debtLimit());
                       // `balance` keeps the value at the last save; the limit is State.manualBalances[account+'_limit']
// Scenario (State.scenarios)
{ name, kind: 'savings', inputs: { checking, savings, debt, monthly, rate /* APY % */, tax /* % */, years } }
  // scenarios from before v1.15.0 have the old simulator's inputs; scenarioInputs() converts them for display
```

**TxOverride** (an entry of `State.txOverrides`, keyed by transaction id). Every field is optional; only the ones the user changed are there.

```js
{ description, categories: string[], type, notes, isBill, isRecurring, isSubscription,
  accountOverride?: string,  // an accountId
  link?: { type: 'budget' | 'bucket' | 'debt', id: string } }  // the transaction drawer's "Link to"; id = the item's id (v1.16.7)
```

- **Links point at an item's `id`, never its position.** Up to v1.16.6 a link was `{ type, idx }`, so deleting an item left the links of the items after it pointing at the wrong one. `PLAN_LINK_TYPES` (core.js) maps a link type to its State key and id prefix.
- **Read links through the helpers** (ui.js, §9): `planItem(type, id)` finds the item; `linkedTransactions(type, id)` lists its transactions. A link whose item is gone matches nothing, and the drawer shows it as None.
- **Deleting an item removes the links to it** (`unlinkPlanItems(type, id)`, saved as `txOverrides`). So does clearing its list in Data & reset (§20). An edit left with nothing else in it is removed.
- **The drawers store only what the user changes (v1.16.16).** `showTxDrawer()` reads its fields back from the form when it opens. On save, a description, category list, type or note that differs from that is stored; an untouched one stores nothing. That matters because a stored `type` wins over the transfer keywords (`reapplyTransferKeywords()` doesn't reset it and `undoTransferDetection()` keeps it, §11), and stored `categories` win over the category rules (Re-categorize all, `recategorizeAll()`, skips them; an import's `mkTx()` uses them). The flags follow the same rule (§4.2); the link is stored as the drawer shows it.
  - **Changing the type to Transfer** also stores its direction (`Transfer out` / `Transfer in`) as the category, when the categories don't have one.
  - **A description changed back to the original, or a note emptied,** is removed from the edit: it would show the same as no edit. An edit left empty is removed, so a save that changes nothing stores nothing.
  - **`showTransferDrawer()`** stores each leg's description and note the same way (`storeChangedText()`, shared with `showTxDrawer()`). Bulk edits store only the field they set.
  - **Up to v1.16.15 every drawer save stored all four fields**, so a transfer saved for a note stopped following the keywords and a category stopped following the rules. Those edits are kept: they can't be told apart from deliberate ones. Clear transaction edits removes them.

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
  account: string,         // accountId (e.g. 'bank_checking', 'bank_savings', 'card_...')
  type: 'debit' | 'credit' | 'transfer' | 'payment',
  isRecurring: boolean,    // the three flags: worked out on every build and load, never read from storage — see below
  isBill: boolean,
  isSubscription: boolean,
  notes: string,
  balance: null,           // Always null — checking/savings exports have no running balance; balance is
                           // computed from manually entered starting balance + transactions
  _originalDesc: string,   // Immutable original CSV description
  _originalCategories?: string[], // The CSV's category and type, before edits and transfer detection (v1.16.1).
  _originalType?: string,  //   Set by mkTx(); DB.loadAll() takes them from the row; finlens-state.json keeps them.
                           //   Missing on transactions from a file written by ≤v1.16.0 (see §20, Clear transaction edits)
}
```

**What a transaction keeps of its CSV row:** the description (`_originalDesc`), the category and type (`_originalCategories`, `_originalType`), the amount and the date. Notes and plan links (`link`) exist only in its edit, and the flags without an edit come from the transaction rules (`txRuleFlag()`). Together these rebuild it without its edit, from memory alone (`DataCleanup._unedited()`).

**Flags (v1.16.8).** `isRecurring`, `isBill` and `isSubscription` come from `txFlags(desc, ov, rules?)` in `core.js`. An edit in `txOverrides` (the drawer's checkboxes, or bulk **Mark as bill / subscription**) wins. Otherwise a transaction rule (`State.txRules`: `{ contains, flag: 'bill' | 'recurring' | 'subscription' }`) matching `_originalDesc` sets the flag.
- **They are worked out whenever a transaction is built or loaded:** `mkTx()` (CSV import), `reconstituteTx()` (`DB.loadAll()`, `loadStateFromFile()`, Clear transaction edits) and `applyTxRulesToAll()` (after a rule is added or removed).
- **Never read them from storage.** The IndexedDB row and the state file hold the flags as they were when written. Before v1.16.8 `reconstituteTx()` read them from there, so a rule added after the import was lost on reload and a removed one came back.
- **`loadStateFromFile()` passes the file's own `txRules`** to `reconstituteTx()`, because State gets them only after it returns.
- **Store a flag only when the user changes it (v1.16.9).** `showTxDrawer()` remembers what its three boxes showed on opening. On save, a box changed from that is stored, ticked or unticked. An untouched box stores nothing, so it keeps following the rules, or keeps an edit already stored. Bulk **Mark as bill / subscription** stores only that one flag. Up to v1.16.8 every drawer save stored all three, so a transaction saved for its category alone stopped following the rules. Those stored flags are kept: they can't be told apart from deliberate ones.

### 4.3 The Account Model

```js
{
  id: string,    // e.g. 'bank_checking', 'bank_savings', 'card_my_card_csv'
  name: string,  // Default name (§18), never the name you typed: that's State.accountLabels[id]. Show acctName(id)
  kind: 'bank_checking' | 'bank_savings' | 'credit_card' | 'unknown',
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
- **Two keys have older storage names (v1.16.4).** Browser storage (localStorage and IndexedDB `app_state`) keeps `State.recurringConfirmed` as `recurring` and `State.categoryRules` as `catRules`; every other key is stored under its State name. `STORAGE_KEYS` / `storageKey(stateKey)` in `core.js` is the one mapping. Code that saves or loads keys by State name in a loop must go through it: JSON import, Data & reset's plan clears, `DB.loadAll()` and the new-database copy (`DB.APP_STATE_KEYS`, v1.16.5), `migrate.js`. Up to v1.16.3 the JSON import didn't, and its values were lost on reload. Don't rename the storage keys: existing data lives under them. `finlens-state.json` and JSON exports use State names.
- Don't call `saveStateToFile()` directly in hot paths — it's meant to be debounced via `_saveStateDebounced()` in `lsSet()`.
- **Never use transactions straight from JSON.** `JSON.parse` turns `date` into a string and freezes the `category` getter. `loadStateFromFile()` rebuilds them with `reconstituteTx()`, as `DB.loadAll()` does; any new code that reads transactions from JSON must do the same.
- **IndexedDB may not hold the loaded transactions.** After a boot or restore from `finlens-state.json` (a new browser, cleared site data, `_restoreStateIfBrowserEmpty()`), the `transactions` store can be empty or hold only some of them. Code that changes the loaded transactions works from `State.transactions`, never by replacing them with the store's rows: a store row may only fill in a value a transaction lacks. Up to v1.16.0, Clear transaction edits replaced them and wiped every transaction (§20).
- **An import never drops loaded transactions** (v1.16.3). `loadFiles()` adds the files' transactions to the loaded ones (`mergeImported()`): the same id is replaced by the file's, every other loaded transaction stays, as `DB.importTransactions()` keeps every row (§10). Up to v1.16.2 it replaced all of them with the files' ones, so importing only the card file left only the card's in memory, and the autosave wrote that to the file that boot loads first. Removing rows is Rebuild from your folder's job (§20).
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
| Account IDs | `snake_case` | `'bank_checking'`, `'bank_savings'`, `'card_file_name'` |
| View IDs | `kebab-case` | `'overview'`, `'forecast-invest'`, `'bills'` |
| File names | `kebab-case` with module prefix | `views-plan.js`, `views-settings.js` |

---

## 6. CSS Architecture

All CSS lives in a single `<style>` block in `index.html`. There are no external CSS files.

### CSS Custom Properties (design tokens)

The visual system is **Clarity** (v1.13.0): indigo accent, Inter type, white cards with 16px corners and no shadow. **Light only for now:** the tokens live in `:root`. The dark theme (a `[data-theme="dark"]` token set plus a Light / Dark / Match system choice in Settings) was taken out of v1.13.0 and will come back in its own PR; the removed set is in commit `ff459fe`.

```css
/* surfaces */   --bg, --surface, --surface-2, --muted (chips, tracks), --divider (rows in cards),
                 --border, --border-strong (inputs, ghost buttons), --scrim, --track (a meter on --surface-2)
/* text */       --text, --text-body, --text-2, --text-3 (lightest allowed), --inverse,
                 --on-solid (text on --accent-solid / --danger fills)
/* accent */     --accent (marks, borders), --accent-solid (button fill), --accent-text (links, active nav),
                 --accent-hover, --accent-strong-text, --accent-soft, --accent-border, --accent-dim (an unfinished period's bar)
/* status */     --good, --good-text, --good-strong-text, --good-dot, --good-soft, --good-border
                 --warn, --warn-text, --warn-strong-text, --warn-soft, --warn-soft-2, --warn-border
                 --danger, --danger-text, --danger-strong-text, --danger-soft, --danger-border
/* hues */       --teal-2, --teal-text (v1.15.0), --sky, --sky-text, --violet, --violet-text, --pink, --card, --card-soft, --card-border
/* charts */     --chart-in, --chart-out, --chart-save, --chart-debt, --chart-card, --chart-neutral, --chart-grid
/* heatmap */    --heat-1 … --heat-5
/* tiles */      --t0 … --t5, --t-ink (on t0–t3), --t-ink-hi (on t4–t5) — Trends' category tiles (v1.16.0); --border-dash (a dashed panel)
/* shape */      --shadow (none), --popover-shadow, --radius (16px), --radius-sm (10px)
/* legacy */     --teal, --teal-soft, --amber, --amber-soft, --red, --red-soft, --blue, --purple
                 — aliases kept so pre-v1.13.0 inline styles keep working; new code uses the names above
```

**Never hard-code colors** — always use a CSS variable. Chart.js can't read variables, so it calls `chartColor('--token', alpha?)` when it draws (§7, §9). Inline SVG built by FinLens (the Finances, Plan and Trends charts, v1.14.0–v1.16.0) colors its shapes through CSS classes instead (`.lc-*`, `.spark`, `.hue-*`), which read the tokens directly without a redraw.

Use `--on-solid` for text on any solid fill, never `#fff`, so a dark theme can swap it later.

**Text contrast:** every text token must reach at least 4.5:1 (WCAG AA) on `--surface`, `--bg`, `--surface-2` and `--muted`. `--text-3` (`#5d6a7e`) is the lightest allowed text color, so never fade text below it with `opacity`. Chart.js labels follow `--text-2` and grid lines `--chart-grid` through `applyTheme()`.

### Key CSS component classes

```
.card          — surface with border, 16px corners, padding (no shadow)
.btn           — indigo primary button; .btn.ghost, .btn.danger, .btn.sm variants
.pill          — status badge; .pill.good (green), .pill.warn (amber), .pill.bad (red)
.chip          — inline tag; .chip.sub, .chip.debit, .chip.income, .chip.credit, .chip.xfer-in, .chip.xfer-out
.tbl           — styled table (thead uppercase, hover row highlight)
.insight       — tinted callout box; .insight.warn, .insight.bad
.tabs          — underlined tab bar (Settings); buttons carry role="tab" + aria-selected
.seg           — segmented control; buttons carry role="radio" + aria-checked
.input .select .textarea  — form fields
.progress      — progress bar; .progress.warn, .progress.bad
.chart-wrap    — Chart.js container (must have explicit height!)
.chart-wrap.tall (340px), .chart-wrap.short (160px), .chart-wrap.sm (200px)
.spark-wrap    — sparkline container (64px height)
.drawer        — right-side slide-in panel
.empty         — dashed placeholder when no data
.grid-4 .grid-3 .grid-2  — responsive grid layouts
.num           — tabular numbers (Inter); .mono — DM Mono for code-like text
.sr-only       — visually hidden text for screen readers
[hidden]       — always display:none (beats a class that sets display)
```

**Finances screens (v1.14.0)** — Overview, Transactions and its pill screens are built from these:

```
.page-actions  — row under the shell's title: .note on the left, .acts (buttons) on the right
.fpills/.fpill — Transactions filter pills; the current one has aria-current="page"
.kpis/.kpi     — KPI tiles (.k-label, .k-val, .k-sub); 4 → 2 columns below 900px
.panel         — section card (24px 28px padding, h2 15px); .panel-head (title + .aside), .panel.flush (no padding)
.cols-3 + .span-2 — 3-column row with a wide panel; one column below 1000px
.hue-*         — sets --c for a series: accent, good, warn, card, teal, pink, sky, violet, neutral, dim
.sw .legend .stack .bars/.bars-x — swatches, legends, stacked bar, box bar charts
.rows/.r       — list rows in a panel; .date-block (MON / day)
.tbl.flush     — table without side padding; .table-scroll (overflow-x box, positioned); .mw-520…860 min-widths
.fit-sm .hide-sm .w-date .w-amt .w-num — below 600px: fixed layout, hidden columns, set widths
.tag .flag .pill.accent .code-tag — category tag, flag chip, accent pill, rule keyword
.field .field-row .form-row .check-chip .flag-set — form fields (label wraps its control)
.dform .sum-box .drawer-note — drawer bodies; .drawer-head/.drawer-body/.drawer-foot are the drawer itself
```

**Plan screens (v1.15.0)** — Budget, Buckets, Debt, Investments and Forecast add:

```
.callout(.bad/.warn/.good/.plain) — tinted box with an icon: budget alerts, the savings-pace note, the payoff summary, the advice note
.slider (.sm)  — a range input with its value label (.top b) and end labels (.ends)
.month-nav     — Budget's ‹ month › switcher; .icon-btn:disabled
.meter .progress.lg/.xs .hue-danger — progress bars (role="progressbar", aria-valuenow, aria-valuetext)
.bud-tbl .bud-hist(.ref) .bud-x — budget table and the budget-vs-actual bars with the dashed budget line
.bucket-grid .bucket .tile .bk-grid .form-panel .form-foot — bucket cards and the inline New bucket form
.choice-set .choice — icon / color radio tiles in a drawer; .form-err — a drawer form's error
.debt-tbl .lim-cell .plan-head .plan-cards .plan-card[aria-pressed] .mini-bars .order-list .num-badge
.stack.lg .mix-list .split3 .fund-tbl .alloc-input .pct-field .ref-cards .ref-card — Investing ideas
.seg.tabs-seg [role=tab][aria-selected] .fc-form .fc-out .big-stats .ybars(.yb .c .g / .ov .n .r, .nominal) .preset-set .preset[aria-pressed] .toggle-row .scroll-y .tbl.sticky .scen
.sm-line .compact-sm — phones: a line under a table's first cell replaces its hidden columns; tighter cells
.strong .c-bad .c-warn .c-dim .c-teal .axis-ends .sw.dash .mw-640 .mw-720
```

**Insights, Settings and the Welcome (v1.16.0)** add:

```
.status-line(.good/.bad/.warn) — a one-line result under a form (role="status"; takes no space while empty)
.head-row .icon-tile.lg .panel h2.lg — a panel header with a 48px icon tile (the folder, a credit card)
.panel.dashed .panel.row-panel(.grow .acts) .panel.danger-panel(.body) — dashed / one-row / Start over panels
.cols-2 .cols-3.top .col-stack — two columns; three with tops aligned; a column of panels
.btn.xl .btn.danger-outline .inline-link — the Welcome's 52px buttons; Remove key; a button that looks like a link
.bars.wide-gap .hue-teal-text .sw.line .lc-line.avg .bal-rows/.bal-row .heat-tbl .ht.l0…l5 — Trends
.key-pill(.ok/.off) .quick[aria-pressed] .hist-list/.hist-row .ask-box .ask-foot .ai-answer .ans-head .ai-md .ans-foot .thinking .skel .err-detail — AI Analysis
.tab-panel .set-row(.line) .info-tiles .fname .lg-row .acct-rows/.acct-row .order-btns .acct-meta .row-note .cc-grid .util-line .cat-chips/.cat-chip .kv-rows .clean-rows/.clean-row .clean-btn(.armed/.done) .radio-set .reset-in — Settings
.welcome(.lead .hint) .hero-acts .steps .step-num .features — the Welcome; .pagebar.hero — its centered headline
body[data-view="settings"], body.first-run — Settings and the Welcome are 1000px wide; a first run hides the app bar's nav and tools
```

Prefer these over inline styles. Keep touch targets ≥ 44px where feasible (`@media (pointer:coarse)` raises pills and remove buttons).

---

## 7. Chart.js Rules

These rules exist because Chart.js will cause infinite layout loops if violated.

1. **Always** set `responsive: true, maintainAspectRatio: false`.
2. **Always** wrap `<canvas>` in a `.chart-wrap` div (or `.spark-wrap` for sparklines).
3. **Always** initialize charts inside `setTimeout(() => { new Chart(...) }, 0)` — the canvas must be in the DOM first.
4. **Always** destroy a chart before recreating it on the same canvas — or use a unique canvas ID per render. `ui.js` enforces this: `Chart` is a guard subclass that destroys any chart already on the canvas, and any chart whose canvas has left the page, before drawing. Keep it. Without it, two renders in a row throw "Canvas is already in use" and every render leaks its charts.
5. **Never** let a chart container have `height: auto` — always an explicit pixel height.
6. **Colors come from the theme:** `chartColor('--chart-in')`, `chartColor('--chart-out', .12)` and so on, read when the chart is created, never hex literals. `CHART_PALETTE` is for multi-series charts with no meaning per color.
7. **The Finances, Plan and Trends screens don't use Chart.js (v1.14.0–v1.16.0).** Trends' bars are `.bars` boxes, its savings-rate chart is inline SVG (`rateChartSvg()` in views-plan.js, two series: the rate and a dashed 3-month average), its balances are `sparkSvg()` and its category grid is a table of tiles (`.heat-tbl`). The Plan screens' budget, debt and forecast bars are plain boxes (`.bud-hist`, `.mini-bars`, `.ybars`). Their line charts, sparklines, bars and heatmap are inline SVG or plain boxes (`svgLineChart()`, `sparkSvg()`, `dailyHeatmapHtml()` in `ui.js`; `.bars` in CSS). Give each one `role="img"` and an `aria-label` that says what it shows. `svgLineChart()` takes the width it should draw at: measure the holder (`clientWidth`, the view is already in the page when it renders) so its 11px labels stay 11px.

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
storageKey(stateKey)       // The lsSet/lsGet key for a State key: 'recurring', 'catRules', else the State name (STORAGE_KEYS, §4.5)
loadStateFromFile()        // Read finlens-state.json from backup folder; returns loaded state or null if not found
saveStateToFile(state)     // Write state to finlens-state.json in backup folder (fire-and-forget async)
_saveStateDebounced()      // Debounced wrapper (5s) — called by lsSet()

// Data (core.js)
filteredTx()               // State.transactions filtered by active range + selected accounts
orderedAccounts()          // Object.values(State.accounts) in user-defined display order (ids with no account are skipped)
autoCategory(description)  // Returns category string based on rules + DEFAULT_RULES
txRuleFlag(desc, flag, rules?) // true if a transaction rule for that flag matches; rules default to State.txRules
txFlags(desc, ov, rules?)  // { isRecurring, isBill, isSubscription }: the edit in ov, else the rules (§4.2)
applyTxRulesToAll()        // re-works out every loaded transaction's flags (after a rule changes)
defaultAccountName(a)      // 'Bank Checking' | 'Bank Savings' | 'Bank Credit Card (<file>)' | the file name, from a.kind + a.sourceFile

// Aggregation (aggregation.js — loaded after core.js)
byCategory(txs, filter)    // { category, amount }[] sorted by amount desc
byMonth(txs)               // { month, income, expense, transfer }[] sorted by month
sumIncome(txs)             // Sum of positive non-transfer, non-payment amounts
sumExpense(txs)            // Sum of abs(negative non-transfer amounts)
sumTransfers(txs)          // Sum of transfer amounts / 2 (to avoid double-counting)
currentBalances()          // { [accountId]: number } — today's balances: an override, else starting balance + every transaction (§18)
periodEndBalance(accountId) // Balance at end of the active date range; All time = currentBalances()
startingBalance(accountId) // manualBalances[id+'_initial'], or 0 — shared by the three balance helpers (v1.16.10)
detectRecurring()          // Recurring charge detection across all transactions
detectRecurringDeposits()  // Recurring income detection
recurringKey(desc), depositKey(desc) // the grouping keys the two detectors use
accountDateRange(accountId) // { min: Date, max: Date } — earliest and latest transaction dates for an account
// v1.14.0 (the Finances screens) — new helpers; the ones above give the same output as before
balanceAt(accountId, date) // balance at the end of a day (manual balance minus later rows, or start + rows so far)
dataSpan(txs)              // { first, last, days, months } — months = days ÷ 30.44, as the AI summary states
monthlyFlow(txs)           // [{ key, date, income, expense, net, txs }] per month, sumIncome/sumExpense rules
isCardPayment(t)           // a payment toward a credit card (its "Payment" row, or the card leg of a paired transfer)
transferPairs(txs)         // [{ date, from, to, amount, description, outId, inId, paired }]; null from/to = outside FinLens
recurringDepositsDetail(txs) // detectRecurringDeposits() + count, account, next expected, confidence, steady
BILL_FREQS, billFreq(b), billOccurrence(b, k), billDatesBetween(b, from, to)
billPayments(b), billLastPaid(b), billNextDue(b) // a bill's payments and its next due date, from the transactions
// v1.15.0 (the Plan screens)
budgetSpent(b, from, to)   // charges (not transfers) in any of a budget's categories, each counted in full
starterBudgetList()        // a budget per category: average of up to 3 recent complete months, rounded up to $10
bucketPlan(b)              // { goal, saved, left, due, months (calendar months, ≥ 1 while ahead; 0 once passed), monthly }
savingsPace()              // { total, perMonth, since }: paired transfers into savings − out of them (= Transfers "Saved to savings")
debtLinked(d), debtIsCard(d), debtBalance(d), debtLimit(d) // a debt linked to a card account reads its balance/limit from it
payoffPlan(debts, extra, strategy) // 'avalanche' | 'snowball' | 'minimum' → { months, interest, paidOff, order, left, rows }
                           //   interest = balance × APR/12 monthly; minimums, then extra + freed minimums to one debt at a time; 600-month cap
monthlyRateFromYearly(pct) // (1 + pct)^(1/12) − 1: twelve months compound to exactly the yearly rate
growthByYear(start, monthly, yearlyPct, years) // [{ year, balance, putIn }], deposits at the end of each month

// Utilities
hash(str)                  // Deterministic 'tx' + base36 hash for transaction IDs
PLAN_LINK_TYPES            // { budget: ['budgets','bud'], bucket: ['buckets','bkt'], debt: ['debts','dbt'] } — link type → State key, id prefix (v1.16.7)
newPlanId(type, list?)     // a new budget/bucket/debt id: prefix + '_' + 10 random base-36 characters, not already in list (default: the State list)
escapeHtml(str)            // Escape HTML entities for safe innerHTML insertion
escapeAttr(str)            // Escape for use in HTML attribute strings
renderMarkdown(md)         // marked → DOMPurify (no images/styles/forms) → safe HTML string; escaped-text fallback; only ~~double~~ tildes strike through
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
loadFiles(files, assignments, { sample, quiet, beforeImport, unopened }?) // the import. Reads every file first and changes nothing
                           //   (memory, storage, IndexedDB, sample data, the import pause) unless a transaction was read (v1.16.2).
                           //   Then: without `sample`, it clears sample data (State.sampleData) so your files replace it.
                           //   The files' transactions join the loaded ones, none dropped (mergeImported(), v1.16.3).
                           //   quiet: no alert, the caller reports; beforeImport(result): runs after the read, false stops it;
                           //   unopened: [{ name }] files the caller couldn't open. Returns { imported, reason, transactions, files }
parseCsvFile(file, kind)   // reads one CSV → { accountId, rows, txs, problem, … } and writes nothing; importParsedCsv(p) imports it
importProblemText(res)     // why a loadFiles() result's files gave no transactions, in words (importFileProblem(f) for one)
reloadFromDirHandle(handle, opts?) // (views-data.js) the folder's CSVs → loadFiles(); opts as loadFiles()'s; returns its result
mergeImported(loaded, fresh) // loaded + the files' transactions by id, leftover copies out, kept transfers undetected (v1.16.3)
undoTransferDetection(t, row?) // a detected transfer back to its CSV type and category, with its edit, before detectTransfers()
```

---

## 9. UI Helpers (ui.js)

```js
// Views
registerView(id, title, renderFn)   // Register a view (called at module load time)
showView(id)                         // Navigate to a view — re-renders from scratch
renderActive()                       // Re-render current view (call after state mutations)
shellHero(title, firstRun)           // The Welcome: rewords the shell's title as a centered headline; firstRun hides the app bar's
                                     //   nav and tools (body.first-run). showView() undoes both (v1.16.0)
NO_RANGE_VIEWS                       // PLAN_VIEWS + trends + settings: showView() hides #rangeLabel there

// Drawer (single shared drawer #txDrawer: title row, scrolling body, optional pinned footer, scrim)
// A modal dialog (v1.16.14): role="dialog", aria-modal, named by #drawerTitle. While open, every other
// child of <body> except its scrim is `inert`, Tab / Shift+Tab wrap inside it, and app bar popups are closed.
openDrawer(bodyHtml, { title, footer }?) // A body starting with <h3> (older forms) uses it as the title.
                                     //   Focuses the first field (× when there is none). Called while open, it
                                     //   swaps the contents and keeps the original opener and inert set
closeDrawer()                        // Close it and lift inert; focus returns to whatever opened it, or to its
                                     //   re-rendered copy (same id or data-* attributes) when Save / Delete or a
                                     //   render while open replaced it. New drawers: use these two, no own focus code

// Theme — light only for now (dark taken out of v1.13.0)
applyTheme()                         // Point Chart.js defaults (labels, grid, font) at the theme tokens

// Colors for Chart.js / inline SVG (they can't read CSS variables)
cssVar('--token')                    // Current value of a token
chartColor('--token', alpha?)        // Same, as rgba() when alpha is given — call it when the chart draws

// App bar (index.html .appbar)
PLAN_VIEWS                           // The views under the Plan menu; #planBtn is underlined on them
TX_VIEWS                             // transactions + its pill screens; the Transactions link stays underlined
                                     //   (aria-current="true") on income, spending, bills and transfers
toggleAppBarPopup(btn, panel)        // Open/close the Plan menu, a filter popover or the ☰ menu (☰ shows × and "Close menu" while open)
closeAppBarPopups(focusBtn?)         // Close whatever is open (Escape returns focus to its button)
updateRangeUI(), updateAcctUI()      // Sync the date / accounts popovers, their dots and tooltips
updateSyncBadge()                    // (views-data.js) "Synced" / "Not synced" from State._folderLinked,
                                     //   _folderNeedsAccess and _lastSaveError; called on every render and save

// Chart
CHART_PALETTE                        // 12-color array, use for multi-series charts
CHART_DEFAULTS                       // { responsive, maintainAspectRatio, legend: false }
mergeChartOpts(extra)                // Merge extra options into CHART_DEFAULTS

// Rendering utilities
emptyCard(message)                   // Returns HTML string for empty-state card
fmtSigned(n, zero?) / fmtShort(v)    // "+$2,450.00" / "−$65.00" (real minus sign); axis labels "$12.5k"
acctName(id), ordinal(n)             // account display name (the name you typed, else defaultAccountName(); null → "Outside FinLens"); "3rd"
svgLineChart(pts, opts)              // inline-SVG line chart: pts [{ v, tip }]; opts { w, h, hue, xLabels, valueAt, hollowLast, ariaLabel }
sparkSvg(values, hue, label)         // stretchy sparkline
dailyHeatmapHtml(txs, start, end)    // weeks × days heatmap, six shades by quartile
// (renderHeatmap, renderUpcomingCal, renderTransferFlow and drawSpark were removed in v1.14.0)

// CRUD helpers for Bills, Budgets, Buckets, Debts (all in ui.js)
showBillForm(i?), saveBill(i?)       // edit bill i in the drawer, or add one (i < 0); addBill(bill) adds and marks "Just added"
billIsSubscription(b), deleteBill(i), toggleBillPaid(i)
// Plan forms (v1.15.0) open in the drawer: fields, an inline error (#planFormErr), Delete (two clicks, _armTwoClick)
editBudget(i), saveBudget(i), setBudgetLimit(i, v), deleteBudget(i)  // i < 0 adds; setBudgetLimit = the row's inline edit
seedBudgets(), starterBudgetsToAdd()  // "Use starter budget": adds only categories no budget covers; SUGGESTED_BUDGETS without spending
editBucket(i), saveBucket(i), addBucket(b), deleteBucket(i)   // BUCKET_ICONS, BUCKET_HUES, bucketIconKey(), bucketHue(), guessBucketIcon(), bucketIconSvg()
editDebt(i, account?), saveDebt(i), deleteDebt(i), debtCardChoices(current)  // account: start a new debt linked to a card
setPayoffStrategy(s), setPayoffExtra(v)  // save State.debtPlan
simulatePayoff(debts, extra)         // older payoff model, kept unchanged and unused (extra to the first debt only, no rollover)
// deleteBudget/Bucket/Debt no longer confirm(): the drawer's Delete asks for a second click
// Every create path gives the item an id (newPlanId) and every save keeps it; each delete removes the links to it (v1.16.7)
planItem(type, id)                   // the budget / bucket / debt a link points at, or null (v1.16.7)
linkedTransactions(type, id)         // transactions linked to it, newest first (the bucket drawer's "Linked transactions")
unlinkPlanItems(type, ids)           // remove links to those items (an id or a list; a missing id removes nothing), or ids 'all': every item of the type; saves txOverrides; returns the count
ensurePlanIds()                      // give an item without an id one (the transaction drawer calls it before listing items)
confirmRecurring(r), dismissRecurring(key), undoDismissRecurring(key)   // r: a detectRecurring() entry
addCatRule(), delCatRule(i), recategorizeAll()
exportAllData(), importJsonFile(ev)  // Settings → Data & reset → Export / Import JSON (v1.16.0; before, no button called them)
                                     //   JSON_EXPORT_KEYS: what's in the file, version 1.2 (v1.16.6, §20)
clearAllData()                       // = DataCleanup.startOver('archive') — full reset + reload (§20)
```

---

## 10. CSV Parsing Rules

### Supported file formats

| Account | Kind | Detection |
|---|---|---|
| Bank Checking | `bank_checking` | Filename contains `check` OR has `Time`+`Type`+`Amount` columns |
| Bank Savings | `bank_savings` | Filename contains `saving` |
| Bank Credit Card | `credit_card` | Filename contains `card`/`credit` OR has `Transaction Date`+`Post Date` columns |

FinLens names no bank in the UI, the code, sample data or current docs. Describe a format by its columns, not by who exports it. History stays as written: earlier CHANGELOG entries, published eval results and `docs/archive/`. Data saved before v1.12.0 used bank-named codes; only `migrate.js` lists them (§22).

### Actual CSV column structure

**Bank Checking & Savings** — columns: `Date`, `Time`, `Amount`, `Type`, `Description`

| Column | Format | Notes |
|---|---|---|
| `Date` | YYYY-MM-DD | Transaction date |
| `Time` | HH:MM:SS | Bank-assigned timestamp — real and meaningful, not zeros |
| `Amount` | number | Negative = withdrawal, Positive = deposit |
| `Type` | string | `Withdrawal` or `Deposit` |
| `Description` | string | Payee / memo text |

**Bank Credit Card** — columns: `Transaction Date`, `Post Date`, `Description`, `Category`, `Type`, `Amount`, `Memo`

| Column | Format | Notes |
|---|---|---|
| `Transaction Date` | YYYY-MM-DD | Date charge occurred — no time component |
| `Post Date` | MM/DD/YYYY | Date charge settled — may differ by 1–3 days; **different format from Transaction Date in the same file** |
| `Description` | string | Merchant name |
| `Category` | string | Bank-assigned category — used for initial auto-categorization |
| `Type` | string | `Sale`, `Payment`, or `Return` |
| `Amount` | number | Negative = charge, Positive = payment/refund |
| `Memo` | string | Always empty in practice — **ignored entirely** |

### Critical: checking/savings CSV headers have leading spaces

The checking/savings export has headers like `" Date", " Time", " Amount", " Type", " Description"` — each header has a leading space. PapaParse is configured with `transformHeader: h => h.trim()`. **Do not remove this.**

### Amount sign convention

- **Negative** = money leaving the account (withdrawal from checking/savings; charge on a card)
- **Positive** = money entering the account (deposit to checking/savings; payment/refund on a card)

This is consistent across all account types.

### Transaction ID hash strategy (deduplication)

The deterministic `id` for each transaction is computed per source to survive re-uploads without creating duplicates:

| Source | Hash inputs | Tiebreaker rationale |
|---|---|---|
| Bank Checking | `date \| time \| description \| amount \| accountId` | `Time` is bank-assigned (HH:MM:SS), always meaningful — collision risk is near zero |
| Bank Savings | `date \| time \| description \| amount \| accountId` | Same as checking |
| Credit Card | `transactionDate \| postDate \| description \| amount \| accountId` | No timestamp; post date disambiguates most cases |

The account id comes last on purpose: `migrate.js` relies on it to rename account ids without the original rows (§22).

**Identical rows (occurrence suffix):** Truly identical credit card rows (same transaction date, post date, description, and amount) do occur in practice — e.g. multiple TAXMANIA charges on the same day for the same amount. `parseCsvFile()` counts them **within the file**: the first keeps the base hash, the 2nd gets `_2`, the 3rd `_3` (via the `occurrence` argument of `normalizeRow()` → `mkTx()`). The suffix is part of the ID everywhere — memory, IndexedDB and `txOverrides`. Because identical rows are interchangeable, file order is enough to make the suffix stable across re-uploads.

- Suffixes are allowed when `schema.allowOccurrenceSuffix` is true, or when it's unset and the schema has no `time` column (custom schemas). The checking and savings schemas set it to `false`: with a bank-assigned `Time`, an identical row is a true duplicate and only the first copy is kept.
- **Never assign suffixes on a database collision.** Up to v1.8.0, `DB.importTransactions()` did, which re-inserted every row of a re-uploaded credit card file as an `_2` copy.

**Re-upload safety:** IDs are final when they reach `DB.importTransactions()`, which reads the stored keys once and skips any ID it already holds. Re-uploading a file — or a newer export with rows appended — inserts only genuinely new rows. On each import it also deletes leftover copies from the old bug: a suffixed row whose base transaction is in the file but whose exact ID is not. Same-day identical rows always appear together in a bank export, so the file is authoritative for how many copies exist. The import results card reports these as "leftover duplicate copies removed".

**Memory follows the same rules** (v1.16.3). `loadFiles()` puts the files' transactions into `State.transactions` the way `DB.importTransactions()` puts them into the store (`mergeImported()`): an id it already has is replaced by the file's, a new one is added, a leftover copy as above is removed, and every other loaded transaction stays. So importing one file, or a newer export that starts later, keeps the other accounts and the older rows, and `finlens-state.json` gets them all.

**A stored row holds the CSV's values, never an edit.** `DB.importTransactions()` stores the transaction's `_originalDesc`, `_originalCategories` and `_originalType` as the row's `description`, `categories` and `type`, and the flags from the rules (`txRuleFlag()`), not what `mkTx()` shows. An import can run while edits exist (Rebuild from your folder, importing again after Clear transactions). Up to v1.16.0 the row took the edited category, type and flags, so they came back after Clear transaction edits. Rows stored that way by older versions keep them until Rebuild from your folder rewrites them.

---

## 11. Transfer Detection

`detectTransfers()` runs after every `loadFiles()`. It only looks at transactions that aren't transfers yet, so `loadFiles()` first puts the transfers it keeps back to their CSV type and category (`undoTransferDetection()`, v1.16.3): a kept leg then pairs with its partner re-read from a file, exactly as in a full import. It does two passes:

1. **Paired match:** Finds transactions across different accounts with equal-and-opposite amounts within 2 days. Sets `type='transfer'`, `categories=['Transfer out']` (negative) or `categories=['Transfer in']` (positive).
2. **Keyword match:** Marks unmatched transactions whose description matches `/transfer|zelle|ach|venmo|paypal|coinbase|savings booster/i` by direction.

**Both legs of a transfer are kept.** There is no deduplication. The `Transfers` view pairs them visually.

**Transfer keywords** are edited on the Transfers screen. Adding or removing one re-runs detection right away (`addTransferKeyword()` / `removeTransferKeyword()` → `reapplyTransferKeywords()`, which puts transfers without a stored `type` back to income/expense and calls `detectTransfers()`). The drawer stores a type only when the user changes it (§4.1), so a transaction saved for its note or category still follows the keywords. There's no separate Re-apply button any more (v1.14.0).

**Pairs for display:** `transferPairs(txs)` (aggregation.js) pairs the two legs for the Transfers screen and the Overview's card footnotes. A leg with no partner has `to` (or `from`) = null: money that left (or came from) outside FinLens.

---

## 11.1 Payment Type

`type='payment'` is set in `normalizeRow()` when `rawType` equals `"Payment"` (case-insensitive). This occurs on credit card uploads where a payment toward the card balance is recorded as a positive-amount transaction with `Type = "Payment"`. Payment transactions are **excluded from income sums** (`sumIncome()` filters them out) to avoid double-counting. They are distinct from `'credit'` (which represents purchase refunds/credits) and `'transfer'` (which represents inter-account moves).

A card payment that `detectTransfers()` pairs with the bank's autopay becomes `type='transfer'` (category `Transfer in`). `isCardPayment(t)` counts both kinds; the Transactions **Payments** pill and its KPIs use it (v1.14.0).

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
- Edits to transaction fields (description, categories, type, notes, flags) go into `State.txOverrides[tx.id]`. A field or flag goes in only when the user changes it (§4.1, §4.2).

### Adding a new persisted field

1. Add the field to `State` with `lsGet('myKey', defaultValue)`. Use the State name as the storage key; only the two older keys in `STORAGE_KEYS` differ (§4.5).
2. `lsSet` mirrors it to IndexedDB `app_state` and localStorage.
3. Add it to `DB.APP_STATE_KEYS` (`db.js`), with the default `DB.loadAll()` uses when it's missing. A new database copies the same keys from localStorage (v1.16.5).
4. Add it to `saveStateToFile()`'s list, unless it's browser-only like `csvAutoImportPaused` (§20). Never the API key.
5. If the user entered or chose it, add it to `JSON_EXPORT_KEYS` (`ui.js`), so the JSON export carries it (§20).
6. Update §20, so Start over and the clean-up actions cover it.

### App Bar Navigation (v1.13.0)

One row at the top of every page (`<header class="appbar">` in `index.html`); the sidebar is gone.

```
FinLens · Overview · Transactions · Plan ▾ · Trends · AI Analysis      [Synced] [📅] [🏦] [⚙]
                                    └─ menu: Budget · Buckets · Debt · Investments · Forecast
           Transactions has filter pills: All · Income · Spending · Bills · Payments · Transfers
           (All and Payments filter the list; the other four open registered views — see below)
           Forecast has sub-tabs: Savings · Investments
Gear → Settings, with tabs: General · Import · Accounts · Credit cards · Categories · Data & reset
       (General holds About (the version) and Anthropic API key; all clearing/reset lives in Data & reset)
```

- **Right side:** the sync badge, then the date-range and accounts icon buttons (each opens a popover), then the Settings gear. There is no theme button or theme setting (light only for now).
- **Below 1000px** the nav moves into the **☰** menu (`#mobileMenu`), with the same grouping. **Below 720px** the gear moves into it too.
- **Links** are `<a href="#id" data-view="id">`; `init.js` wires every `.appbar [data-view]`, and `showView()` marks the current one (`.active` + `aria-current`).

- **Page title:** the shell renders it (`#pageTitle` from the registered title, `#rangeLabel` the range). Views never render their own H1. On screens that ignore the date range (`NO_RANGE_VIEWS`: the five Plan screens, Trends and Settings) `showView()` hides `#rangeLabel` (v1.15.0, v1.16.0). The Welcome rewords the title with `shellHero()` instead of adding an H1.
- **The Welcome (v1.16.0)** is the Overview with no transactions (`renderWelcome()` in views-main.js). On a true first run (`isFirstRun()`: no folder, plans, AI history or key) the app bar shows only the brand. Its buttons call the existing import paths from their click: `pickDataFolder()` (`reloadDataFiles()` when a folder is connected), `loadSampleData()`, and `#filePick`.
- **Settings (v1.16.0)** is a `role="tablist"` (arrow keys, Home, End) and one `role="tabpanel"`; each tab is a registered view rendered into it. Fields save when you leave them (`change`) and report in a `.status-line`; destructive buttons ask for a second click. A screen's buttons and one-line note go in a `.page-actions` row at the top (`pageActions()` in views-main.js).

**Transactions pills (v1.14.0).** `renderTxPills(root, current)` draws the row on all five screens. **All** and **Payments** set `txPillFilter` and show the `transactions` view, which lists one or the other. **Income**, **Spending**, **Bills** and **Transfers** set `txPillFilter` and open the registered views `income`, `spending`, `bills`, `transfers` (titles "Income", "Spending", "Bills & subscriptions", "Transfers"). The Transactions view treats any other `txPillFilter` as All, so the app bar link always lands on the list. `TX_VIEWS` (ui.js) keeps Transactions underlined on all five.

View registrations by file:
- `views-main.js` — overview, transactions (All / Payments), income, spending, bills, transfers
- `views-plan.js` — budgets, buckets, debt (titles "Budget", "Savings buckets", "Debt tracker"), trends ("Trends")
- `views-invest.js` — investments ("Investing ideas"; `_renderForecastInvest` is a helper, not a registered view)
- `views-forecast.js` — forecast: a `role="tablist"` with Savings / Investments (`forecastTab`, arrow keys move between them), one `role="tabpanel"` filled by `_renderForecastSavings` / `_renderForecastInvest`
- `views-ai.js` — ai
- `views-data.js` — import, accounts, credit-cards, categories (Settings tabs); db-logs (Import Logs, not in nav)
- `views-settings.js` — settings (internal use only, not in nav)
- `views-cleanup.js` — data-cleanup (Settings → Data & reset tab)
- `views-db.js` — db-inspector, db-schema, changelog (not in nav; developer reference only)
- `views-eval.js` — ai-eval (not in nav; developer only — `showView('ai-eval')` from DevTools, §21)

### Nav label and icon rule (replaces the emoji rule, v1.13.0)

- **Nav labels are plain text.** No emojis in the app bar, the Plan menu, the ☰ menu or the Settings tabs.
- **Icon buttons** (date range, accounts, Settings, ☰) use inline stroke SVGs (24×24 viewBox, `stroke="currentColor"`, width 2). Give each an `aria-label` and a matching `title`.
- **A new top-level screen** goes in the app bar only if there's room. Otherwise put it under Plan, with a one-line description in `#planMenu`, and add it to `#mobileMenu` and `PLAN_VIEWS` if it belongs there.

### Filters vs sub-tabs

- Use **filter pills** when it is the same underlying data viewed through different lenses (e.g. Transactions: All / Payments filter the list; Income / Spending / Bills / Transfers are screens of their own behind the same pill row).
- Use **sub-tabs** when the content is meaningfully different — different inputs, charts, or logic (e.g. Forecast Savings vs Forecast Investments).

### Adding a new view

1. Create or extend the appropriate `views-*.js` file.
2. Call `registerView('myViewId', 'Page Title', (root) => { ... })`.
3. Add a link in `index.html`'s app bar (`.mainnav`, or `#planMenu` for a Plan screen) **and** in `#mobileMenu`: `<a href="#myViewId" data-view="myViewId">Label</a>` — plain text, no icon (§12 App Bar Navigation).
4. Views are always re-rendered from scratch on `showView()` — do not cache DOM across renders.

### Rendering approach

Views build a fresh DOM on every `showView()` call. This is intentional. Do not store references to view DOM nodes between renders — they will be garbage-collected.

---

## 13. AI Integration (views-ai.js)

- Uses the model in `AI_MODEL` (currently `claude-sonnet-5-5`) via direct browser fetch to `https://api.anthropic.com/v1/messages`. `claude-sonnet-4-20250514` was retired 2026-06-15 — check Anthropic's model deprecations page before changing models.
- Requires `anthropic-dangerous-direct-browser-access: true` header (CORS bypass).
- API key is stored in `State.apiKey` (localStorage + IndexedDB `app_state` only — **never** in `finlens-state.json`, see §4.5). It is entered in **Settings → General → Anthropic API Key**; the settings card never renders the stored value back into the DOM. **Never log or expose it.**
- `buildFinancialSummary()` assembles a plain-text snapshot of current State. Account balances, total cash and net worth are the balances at the end of the selected period, the numbers the Overview shows (v1.16.11). The starting balance is included (v1.16.10). Debts report `debtBalance(d)`: a debt linked to a card account gives the card's current balance (v1.15.0); others give `d.balance` as before. Accounts are listed by `acctName()` (the AI Eval sandbox sets `accountLabels` to `{}`). **It always states its dates (v1.10.2):**
  - **The period line** gives the span of the transactions it covers (`summarySpan()`), e.g. "Period: All time (transactions from May 1, 2026 to Oct 20, 2026: 173 days, about 5.7 months)".
  - **A partial month** in the monthly trend is marked (`partialMonthNote()`), e.g. "2026-10 (through Oct 20)".
  - **Balances on a past range (v1.16.11).** `summaryBalanceEnd()` gives the range end when it is before the last transaction, else null.
    - **Null** (All time, This month, any range reaching the last transaction): `currentBalances()`, which equals `periodEndBalance()` there, and the summary is byte-identical to v1.16.10.
    - **A date:** each account's `periodEndBalance()`, with the date on both balance lines: "Accounts at the end of the period (Aug 15, 2026): …" and "… Net Worth: $10,602.37 (all on Aug 15, 2026)". The Debts heading becomes "Debts (current balances, not at the end of the period):".
    - **Why:** up to v1.16.10 the summary sent today's balances under a past period's "Period:" line, and the model read them as that period's. The eval sandbox always uses All time, so the eval's summary didn't change.

  Without them the model guessed the period length (6, 6.5 or even 9 months) to work out monthly figures, so the same data gave different answers. Never send totals without the dates they cover.
- The summary is sent inside `<financial_data>` tags, and the system prompt tells the model to treat that content as data, not instructions (account names and merchant descriptions come from CSVs and are untrusted).
- Responses are read from every `text` content block (don't assume `content[0]` is text) and rendered with `renderMarkdown()` — never `marked.parse()`. Claude writes `~` to mean "about", so a single `~` stays literal; only `~~double~~` is strikethrough (the `del` tokenizer override in `core.js`). Keep it, or `~3-5% (~$150` renders crossed out.
- AI history is capped at 50 entries (`State.aiHistory`). Entries keep the model that answered (`model`, v1.16.0); the tab lists them newest first, opens one again without sending anything, and exports them all as Markdown.
- **Quick analyses (v1.16.0).** The tab shows `AI_QUICK`: the mockup's labels, each pointing at an `AI_PROMPTS` entry whose question it sends unchanged. Only the label (shown, and kept in history) differs. **Leave `AI_PROMPTS` as it is:** the eval runs it and matches published results by its labels and questions (§21). The mockup's "Unusual transactions" isn't offered: the summary has no single transactions.
- **The tab's state lives in the module** (`aiPhase`, `aiCurrent`, `aiError`, `aiDeclined`, `aiSel`, `aiDraft`) and `aiPaint()` updates the open tab in place, so an answer that arrives while you're on another screen shows when you come back. The answer area is `aria-live="polite"` with `aria-busy` while waiting.
- **Output budget and cut-off answers (v1.10.1).** `max_tokens` is `AI_MAX_TOKENS` (4,096). It caps the model's thinking *and* the answer combined. Sonnet 5.5 thinks by default (effort `high`), and thinking counts toward `max_tokens` even though FinLens shows only the text. At 1,500, thinking took ~750 tokens and 15 of 24 eval answers were cut off. Asking the model in the prompt to think less doesn't reliably work; raise the budget or set `output_config.effort` instead. `send()` returns `truncated` when `stop_reason` is `max_tokens` or `model_context_window_exceeded`. The AI tab then shows a warning, and the answer is saved to history with `truncated: true` and copied or saved with `AI_CUT_OFF_NOTE`. If it was cut off before any text (the text is `AI_NO_TEXT`; `aiNoAnswer()`), the tab says no answer was written and nothing goes to history. Never show a cut-off answer as if it were complete.
- **Refusals (v1.10.3).** The API's safety classifiers can decline a request. That arrives as HTTP 200 with `stop_reason: "refusal"`, not as an error, so check `stop_reason`, not the content. `send()` then returns `refusal` (`{ category, explanation }` from `stop_details`) and drops any partial text. The AI tab shows `aiRefusalHtml()` — Claude declined, plus `explanation` when present (display it, never parse it) — and nothing goes to history (since v1.16.0: `aiPhase` `'declined'`, the refusal kept in `aiDeclined`). Never show a declined request as an answer.
- **Raw mode:** `callClaude(question, label, { raw:true, summary })` sends the identical request through the same inner `send()` but touches no DOM, busy flag or history; it resolves to `{ text, stopReason, truncated, refusal, usage, model }` or throws (`.status`/`.detail` on HTTP errors). The AI Eval (§21) depends on it — keep one request path for both, so the eval measures what the AI tab actually sends.
- If updating the Claude model string, update `AI_MODEL` in `views-ai.js` and mention it in CHANGELOG.md. Changing the model, the system prompt or `buildFinancialSummary()` changes what the eval measures — re-run it and replace `docs/EVAL.md`.

---

## 14. File System Access — CSV Folder + State File

The old `FileStorage` object and `finlens-data.json` were removed in v1.4.1.

`views-data.js` stores the user's selected CSV folder handle in `idbGet`/`idbSet('csvDirHandle')`. That one handle is used for two things:

1. **Auto-reloading CSVs** after a page refresh when IndexedDB has no transactions, unless `State.csvAutoImportPaused` is set (§20).
2. **The state file** — `loadStateFromFile()` / `saveStateToFile()` read and write `finlens-state.json` in the same folder (the primary persistence source, §4.5).

The handle lives in a separate `finlens_fs` database (distinct from `finlens_db`), accessed through the lightweight `_idbOpen`/`idbGet`/`idbSet`/`idbDel` helpers in `core.js`. `finlens-state.json` is git-ignored by name, wherever the folder is.

### Folder permission (v1.9.3)

- **It lasts until the last FinLens tab closes, not one page load** (Chromium: Edge, Chrome). A reload keeps access; closing the browser drops it, and a stored handle's permission goes back to `prompt` (confirmed in Edge, v1.9.6). Chromium can also revoke it after a tab sits in the background for a while, and since Chrome 122 the prompt can offer **Allow on every visit**, which keeps access until the user revokes it. Only a click can ask again — `requestPermission()` throws without user activation. Don't rely on any of these: check permission every time (next bullet).
- **Check before touching files.** `loadStateFromFile()` and `saveStateToFile()` call `folderPermission(dir, mode)` (wraps `queryPermission`, never prompts) and skip quietly instead of throwing `NotAllowedError`. When access is missing they set `State._folderNeedsAccess`, which shows the **Reconnect folder** banner (`#folderBanner`, `updateFolderBanner()` in `views-data.js`). A successful save clears it.
- **Always ask for `readwrite`**, not `read`: the folder picker, Reload and Reconnect all do, because the same folder holds `finlens-state.json`.
- **Prompting code runs only in click handlers:** `saveNowClick()`, `reconnectFolderClick()`, `reloadDataFiles()`, and the Data & Reset actions via `folderWithWriteAccess()` / `saveStateNow()`.
- **After reconnecting, the browser copy wins** (Luis's decision, 2026-10-24): `reconnectDataFolder()` writes the browser's state to the file and does not load the file over it. **Exception:** a browser with no transactions (new browser, cleared site data) restores from the file instead (`_restoreStateIfBrowserEmpty()`), so an empty state never overwrites the only backup. Picking a folder follows the same rule.

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
2. `index.html` — version string in the page footer (search for `· FinLens`):
   ```html
   <footer class="appfoot">vX.Y.Z · FinLens</footer>
   ```
3. `README.md` — version string in the header badge and the footer line.
4. `js/views-settings.js` — the `FinLens vX.Y.Z` line in the General tab's About panel.

Also update **Current version** in §1 of this file. Never close out a change without updating all of these.

---

## 18. Supported Account Types

| Kind | Description | Balance source |
|---|---|---|
| `bank_checking` | Bank Checking | Computed from transactions + manually entered starting balance (the export has no running balance) |
| `bank_savings` | Bank Savings | Computed from transactions + manually entered starting balance (the export has no running balance) |
| `credit_card` | Bank Credit Card(s) | The balance owed entered in Settings → Accounts or Settings → Credit cards; without one, the sum of the card's transactions |
| `unknown` | Any other CSV | Computed from transactions + initial balance |

**One balance rule** for `currentBalances()`, `periodEndBalance()` and `balanceAt()`, in every date range, All time included (v1.16.10):
- **A balance override** (`manualBalances[id]`: a card's amount owed, or a bank's current balance saved before v1.16.0) is today's balance. At an earlier date it's the override minus the later transactions. The starting balance doesn't count. `periodEndBalance()` keeps one exception: a range that ends within 7 days of today shows the override as it is.
- **Otherwise:** the starting balance (`manualBalances[id+'_initial']`, read by `startingBalance()`) plus the transactions up to that date.

Up to v1.16.9, `currentBalances()` left the starting balance out, so All time and the AI summary ignored it while every other range used it. Keep the three helpers on this one rule.

Multiple credit card files can be loaded simultaneously. Each gets a unique `accountId` derived from the filename: `card_` + sanitized filename, and a default name `Bank Credit Card (<file name>)`.

**Names you type** (Settings → Accounts, or double-click a name on the Overview) are saved in `State.accountLabels` by `setAccountName()` (views-data.js). The account's own `name` stays the default (`defaultAccountName()`). An empty name, or the default name itself, removes the label, and the default shows again. Show a name with `acctName(id)`, never `account.name`: data saved by older versions can still hold a cleared name there.

**Display order** (`State.accountOrder`, the ▲▼ arrows in Settings → Accounts) keeps the ids of accounts that aren't loaded. **Clear transactions & accounts** keeps the order (§20), and a backup can restore it before the accounts, so the files may come back one at a time. `loadFiles()` keeps every id already in the order and adds new accounts at the end; `moveAccount()` swaps the loaded accounts among the places they hold. Don't rebuild the order from `State.accounts` alone: it drops the places of accounts not loaded yet.

---

*Last updated: v1.16.16 — 2026-11-02 (the transaction and transfer drawers store only the fields you change: §4.1 TxOverride, §11 transfer keywords, §12 state mutations; v1.16.15: §1 desktop only; §3 `views-database.js` removed, the Changelog view reads CHANGELOG.md; §6, §18, §19 point to the current screens; v1.16.14: §9 the drawer is a modal dialog: inert page, Tab wraps, first field focused, focus returns after a re-render; v1.16.13: account order: §4.1 `accountOrder` keeps ids not loaded; §8 `orderedAccounts()`; §18 display order; v1.16.12: account names: §4.1 `accountLabels`; §4.3 an account's `name` is its default; §8 `defaultAccountName()`; §9 `acctName()`; §13 the summary lists accounts by `acctName()`; §18 names you type, and clearing them; v1.16.11: AI summary balances at the end of the selected period: §13 `summaryBalanceEnd()` and the date notes; §21 the parser reads the balance lines by how they start; v1.16.10: starting balance counted in every range: §8 `startingBalance()`, `currentBalances()`; §13 summary balances; §18 one balance rule; v1.16.9: the transaction drawer stores only the flags you change: §4.2 flags, §12 state mutations; v1.16.8: flags from transaction rules are worked out on load, never read from storage: §4.2 flags, §8 `txRuleFlag()` / `txFlags()` / `applyTxRulesToAll()`, §19 flags in the transactions store; v1.16.7: transaction links to budgets, buckets and debts by id: §1 version; §3 migrate.js role; §4.1 the `id` fields, TxOverride and its `link` shape; §8 `PLAN_LINK_TYPES`, `newPlanId()`; §9 `planItem()`, `linkedTransactions()`, `unlinkPlanItems()`, `ensurePlanIds()`; §20 clearing budgets, buckets or debts removes their links; §22 the plan-link migration; v1.16.6: JSON export carries account names and order, Read as, flag rules, transfer keywords and theme: §9 `JSON_EXPORT_KEYS`; §12 adding a persisted field; §20 what the export holds; v1.16.5: a new database copies every saved setting: §4.5 the keys that go through `storageKey()`; §12 adding a persisted field; §19 `DB.APP_STATE_KEYS`; v1.16.4: JSON import saves under the storage keys: §4.5 `STORAGE_KEYS` / `storageKey()`; §8 `storageKey()`; §12 adding a persisted field uses the State name; v1.16.3: An import keeps the loaded transactions it doesn't replace: §4.5 an import never drops loaded transactions; §8 `mergeImported()`, `undoTransferDetection()`; §10 memory follows the same re-upload rules; §11 kept transfers are detected again; v1.16.2: Imports read every file before changing anything: §8 `loadFiles()` options and result, `parseCsvFile()` reads only, `importParsedCsv()`, `importProblemText()`, `reloadFromDirHandle()`; §20 Rebuild from your folder reads before it clears, read before clearing; v1.16.1: Clear transaction edits works from memory: §4.2 `_originalCategories`, `_originalType` and what a transaction keeps of its row; §4.5 IndexedDB may not hold the loaded transactions; §10 a stored row holds the CSV's values; §20 Clear transaction edits; v1.16.0: Trends, AI Analysis, Settings and the Welcome rebuilt: §3 file roles; §4.1 `cardDetails`, `sampleData`, AI history `model`; §6 tile tokens and Insights/Settings/Welcome components; §7 rule 7 covers Trends; §8 `loadFiles()` sample option; §9 `shellHero()`, `NO_RANGE_VIEWS`, ☰ → ×, JSON export/import buttons; §12 Settings tabs renamed, the Welcome, range label hidden on Trends and Settings; §13 quick analyses, tab state, history; §20 new fields, Use my own files, Export/Import JSON; §21 quick analyses send `AI_PROMPTS`; v1.15.0: Plan screens rebuilt: §3 file roles; §4.1 `debtPlan` and the Budget / Bucket / Debt / Scenario shapes; §6 `--teal-text` and Plan components; §7 rule 7 covers the Plan charts; §8 plan helpers (`payoffPlan()`, `growthByYear()` …); §9 plan form helpers, `simulatePayoff()` kept unused; §12 Plan titles, Forecast tabs, range label hidden on Plan screens; §13 debt balances in the summary; §20 Clear forecast scenarios / investment mix, Clear debts resets `debtPlan`; v1.14.0: Finances screens rebuilt: §4.1 Bill shape and `recurringConfirmed`; §6 new tokens and Finances components; §7 rule 7 inline SVG charts; §8 new aggregation helpers; §9 drawer, `TX_VIEWS`, SVG/heatmap/format helpers, bill helpers, removed renderers; §11 keywords re-run detection, `transferPairs()`, card payments; §12 page actions and Transactions pills; §20 Clear bills also clears spotted-charge choices; v1.13.0: Clarity redesign — §6 tokens and components; §9 theme, chart colors and app bar helpers; §12 app bar navigation replaces the sidebar and the emoji rule; §17 footer; §20 Data & Reset; v1.12.0: bank-neutral account codes, names, samples and docs; §22 `migrate.js` added; §3, §4, §5, §10, §18, §21 updated; v1.10.5: no section changes: Import Logs race fix; v1.10.4: §8, §13 single `~` is literal; §21 excerpts escape `~`; v1.10.3: §13 refusals; §21 declined runs; v1.10.2: §13 summary states its dates; §21 per-month derivations; v1.10.1: §13 `AI_MAX_TOKENS`, thinking and cut-off answers; v1.10.0: §21 AI Eval added; §13 `callClaude()` raw mode; v1.9.6: §14 folder access lasts until the last tab closes, not one page load; v1.9.5: §7 chart guard; v1.9.4: views-db.js changelog reads CRLF checkouts; v1.9.3: §14 folder permission: re-request on click, Reconnect banner, browser copy wins; v1.9.2: §0 branch, PR and approval workflow added; v1.9.1: §4.5 rehydrate transactions loaded from JSON; v1.9.0: §20 Data & Reset added; v1.8.1: §10 re-upload dedup rewritten for the occurrence-suffix fix; v1.8.0: AI Analysis restored with API-key and output hardening; `renderMarkdown()` added; `samples/` added; §1–3, §13, §14, §17 corrected to match the code)*

---

## 19. IndexedDB Architecture (v1.4.0) + Database Views (v1.4.1)

The full IndexedDB implementation is live. See **`docs/archive/INDEXEDDB_PLAN.md`** for the original spec.

### What changed
- **`js/db.js`** — new file, loaded after `core.js`. Exposes the `DB` object and `reconstituteTx()` helper.
- **`DB.open()`** — opens `finlens_db` v1, creates all 5 object stores, migrates `localStorage → app_state` on first run.
- **`DB.loadAll()`** — called at boot in `init.js`. Restores all State from IndexedDB (including transactions). Users do not need to re-upload CSVs after a page refresh. The State keys it reads, and their defaults, are `DB.APP_STATE_KEYS`, each under `storageKey()` (v1.16.5). A new database copies the same keys from localStorage (`_migrateSync()`).
- **`lsSet(k, v)`** — now also calls `DB.setState(k, v)` fire-and-forget when DB is ready. All existing `lsSet` call sites work unchanged.
- **`State.transactions`** remains the in-memory working array. All views use `filteredTx()` unchanged.
- **Bank Schema Registry** — `BANK_SCHEMAS` (global in `core.js`) drives CSV parsing. `detectSchema()` + `normalizeRow()` replace the old hardcoded normalizers.
- **Transfer Keywords** — `State.transferKeywords` is edited on the Transfers screen (§11). `detectTransfers()` builds its regex from this list.
- **Flags in the `transactions` store (v1.16.8)** — `DB.importTransactions()` still writes `isRecurring`, `isBill` and `isSubscription` into each new row, as they are at import, but FinLens never reads them back (only the developer DB Inspector shows them). Rows already stored are skipped on re-import, so they are never updated. `reconstituteTx()` works the flags out from `txOverrides` and the current rules (§4.2).

### Adding a new bank
Add a new object to `BANK_SCHEMAS` in `core.js`. No other code changes needed if the bank follows standard column conventions (`date`, `amount`, `description`). For non-standard conventions use: `amountSign: 'inverted'`, custom `columns` map, `dateFormat` (`'YYYY-MM-DD'` | `'MM/DD/YYYY'` | `'DD/MM/YYYY'`), and `postDateFormat` if the post-date column uses a different format than the primary date column (see the `credit_card` schema).

### Deferred
- Column Mapping UI for truly unknown CSV formats (show a modal when `detectSchema()` returns null).
- Forecast Savings account-driven inputs (see §4 in INDEXEDDB_PLAN.md — separate task).

---

## 20. Data Cleanup & Reset (views-cleanup.js)

**Settings → Data & reset** is the only place that clears data (plus **Use my own files** on the sample-data banner, `DataCleanup.clearSampleData()`). All actions live on the `DataCleanup` namespace object.

### Where FinLens keeps data

| Place | What | Cleared by |
|---|---|---|
| Memory | `State` | every action (then `renderActive()`) |
| `localStorage` | `finlens_*` keys via `lsSet`/`lsGet` (plus `finlens_navCollapsed`, left by the sidebar before v1.13.0 and no longer written) | per-item `lsSet(key, [])`; Start over → `lsClearAll()` |
| IndexedDB `finlens_db` | `DB.STORES`: transactions, tx_overrides, accounts, import_log, app_state | `DB.clearStores([...])`; Start over → `DB.destroy()` |
| IndexedDB `finlens_fs` | `csvDirHandle` (the connected folder) | Disconnect → `forgetDataFolder()`; Start over → `deleteIndexedDB('finlens_fs')` |
| Disk | `finlens-state.json` in the connected folder | rewritten by `saveStateNow()` after clears; Start over → `retireStateFile()` |

CSV files on disk are **never** modified.

### Actions

| Action | Does | Keeps |
|---|---|---|
| Clear transactions & accounts | Empties memory + `transactions`/`accounts` stores; turns `sampleData` off; with a folder connected, sets `csvAutoImportPaused` | Plans, edits, account labels/balances, `cardDetails`, settings |
| Clear import log | Empties `import_log` | Everything else |
| Clear transaction edits | `txOverrides` + `tx_overrides` store; rebuilds each loaded transaction without its edit, from memory (`_unedited()`), then `detectTransfers()` | Every loaded transaction; the `transactions` store as it is |
| Clear budgets / bills / buckets / debts / forecast scenarios / investment mix / AI history | `State[key] = []` (`{}` for `investAlloc`; the empty value is `PLAN_ITEMS[i][2]`) + `lsSet`. Bills also resets `recurringConfirmed` (confirmed/dismissed spotted charges); Debts also resets `debtPlan` (`PLAN_ALSO`). Budgets, buckets and debts also remove the transaction links to them (`unlinkPlanItems(type, 'all')`, saved as `txOverrides`, v1.16.7) | Other edits on those transactions |
| Rebuild from folder | `reloadFromDirHandle()` reads every CSV first; only if they can all be read (`_rebuildBlockers()`) it clears transactions, accounts and import log (in `beforeImport`), then imports them | Plans, edits, settings; everything, when a CSV can't be read |
| Disconnect folder | `forgetDataFolder()` — stops CSV auto-reload and state-file writes | Files on disk |
| Use my own files (sample banner) | `clearSampleData()`: transactions, accounts and import log (memory + stores), `sampleData` off, state file rewritten, back to the Welcome | Plans made while trying it |
| Export / Import JSON | `exportAllData()` / `importJsonFile()` (`JSON_EXPORT_KEYS`, rules below) — not a clear; listed because it lives here | — |
| Start over | `retireStateFile()` → forget handle → `DB.destroy()` → delete `finlens_fs` → `lsClearAll()` → alert → reload | CSV files (and a backup copy of the state file, if chosen) |

### Rules

- **Rewrite the state file after clearing anything it holds.** `finlens-state.json` is the first thing loaded at boot, so a stale file would restore cleared data. `_finish()` calls `saveStateNow()` and warns if write access was refused.
- **Clearing transactions must survive a reload.** A connected folder re-imports its CSVs at boot whenever no transactions are loaded (§14), so `clearImported()` sets `State.csvAutoImportPaused` and `init.js` skips the boot re-import while it's set.
  - **Ending the pause:** `loadFiles()` clears it, so any import the user starts ends it: Reload or Reconnect, Rebuild, picking a folder or files. `forgetDataFolder()` (Disconnect) clears it too, and Start over removes it with the other keys.
  - **Browser storage only:** it lives in localStorage and IndexedDB `app_state`, never in `finlens-state.json`. Saves are debounced, so a backup file written before the pause ended could otherwise switch it back on. If browser storage is wiped, the folder re-imports as a recovery.
- **Permission prompts need a fresh user gesture.** Destructive buttons use click-again-to-confirm (no `confirm()` dialog, which can outlast the ~5 s activation window), and actions ask for folder access before doing slow work.
- **Clear transaction edits works from the loaded transactions, never from IndexedDB** (v1.16.1). The `transactions` store can be empty after a restore from `finlens-state.json` (§4.5); up to v1.16.0 the action replaced the loaded transactions with its rows, so every transaction vanished and `_finish()` saved the empty list to the file.
  - **The originals:** `_originalDesc`, `_originalCategories` and `_originalType` on the transaction (§4.2), flags from the rules. A store row only fills in the category and type when the transaction doesn't record them.
  - **A file from ≤v1.16.0 with no row:** if a transaction's category or type was edited, or it was marked as a transfer, they are worked out again from the description and amount (`autoCategory()`, debit/credit by sign), as an import of a file without Category and Type columns does. That is exact for checking and savings; a card's own Category and Type (Sale/Payment/Return) can't be recovered. Rebuild from your folder gets them back. Worked-out values aren't recorded as `_original*`.
  - **The `transactions` store isn't written.** When it's empty, the transactions aren't copied into it: filling it is an import's job (accounts, coverage, import log), and the state file, rewritten by `_finish()`, holds all of them.
- **Read before clearing** (v1.16.2). Up to v1.16.1, Rebuild from your folder cleared first, so a folder with no CSV FinLens could read left 0 transactions, and `_finish()` saved that to the file.
  - **An import that reads nothing changes nothing.** `loadFiles()` reads every file (`parseCsvFile()` writes nothing) before it touches memory, storage, IndexedDB, the sample data or the import pause. When no transaction was read it stops there, and says why (an alert, or the caller's message with `quiet`). That covers every import: Rebuild, Reload, Reconnect, picking a folder, choosing files, boot.
  - **Rebuild clears only when nothing would be lost.** It passes `beforeImport` to `loadFiles()`, which calls it after the read. `_rebuildBlockers()` lists the files that would cost transactions: one the browser couldn't open or parse, one in a known format (by columns or name) with no readable row, one imported before whose columns are no longer recognised. If there are any, nothing is cleared and the tab names them. A CSV in another format that was never imported is skipped, as every import skips it, and the success message names it.
  - **After the clear, the import finishes.** `importParsedCsv()` logs a failing IndexedDB write and carries on, so `_finish()` still saves every transaction to the file.
- **Start over must leave nothing behind.** It sets `State._resetInProgress` so a pending debounced save can't re-create the file, and `DB.open()` registers `onversionchange` so other tabs release the database. `idbGet`/`idbSet`/`idbDel` close their connections so `finlens_fs` can be deleted.
- **Fields added in v1.16.0:** `cardDetails` and `sampleData` live in localStorage, IndexedDB `app_state` (`DB.loadAll()`) and `finlens-state.json`; Start over erases both with everything else. `cardDetails` is also in the JSON export. Importing your own files turns `sampleData` off after clearing the samples (`loadFiles()`).
- **No link outlives its item (v1.16.7).** Clearing budgets, buckets or debts removes the `txOverrides[…].link`s of that type, as deleting one item removes the links to it. Clear transaction edits and Start over remove every link with the rest of the edits. The ids live inside `budgets`, `buckets` and `debts`, so no new place stores data.
- `clearAllData()` is kept as a wrapper for `DataCleanup.startOver('archive')`. Up to v1.8.1 it only cleared `localStorage`, which IndexedDB and the state file then restored on reload.
- **The JSON export holds everything you entered or chose (v1.16.6).** `JSON_EXPORT_KEYS` (`ui.js`) lists the State keys and the kind of value each holds (`list`, `map`, `theme`); `exportAllData()` writes them with `version: '1.2'` and `importJsonFile()` reads the same list.
  - **Left out:** transactions and accounts (the CSVs bring them back), the API key (§15), this browser's own state (`sampleData`, `csvAutoImportPaused`, `lastFolderName`), the session (date range, accounts filter, current view) and `customSchemas` (nothing creates one, §19).
  - **Import:** accepts any version (1.0, 1.1, 1.2). A key that's missing, null or of the wrong kind keeps its current value. Each key is saved through `storageKey()` (§4.5). A file that isn't a JSON object is refused.
  - **Takes effect without a reload** (`_applyImportedSettings()`, for keys whose value changed): account names and order, flag rules (`applyTxRulesToAll()`) and transfer keywords (`reapplyTransferKeywords()`). `theme` is carried but nothing reads it (light only for now). Category rules apply to the next import, "Read as" choices to the next CSV read, and transaction edits after a reload.
  - **A new persisted field the user enters or chooses** goes in `JSON_EXPORT_KEYS` too.

---

## 21. AI Eval (views-eval.js)

A developer-only view (`showView('ai-eval')`) that measures how well AI Analysis answers are grounded in the data the model was sent. Everything lives on the `AIEval` namespace object. Method and results: `docs/EVAL.md`; earlier runs: `docs/eval-runs/`.

### Rules

- **Samples only, never real data.** The eval reads only the three files in `samples/`, and only if their SHA-256 (after normalizing line endings) matches `AIEval.SAMPLES`. If you change a sample file on purpose, update its hash there (the error message shows the new one), add the old hash to that sample's `earlier` list so published results still load (results files are matched by hash, not file name), and re-run the eval.
- **Sandbox, synchronously.** `_withSampleState(fn)` swaps a fresh, sample-only set of `State` keys in, runs `fn`, and restores every key in `finally`. `fn` must be synchronous — no `await` — so no render, `lsSet()` or debounced save can run while sample data is in `State`. If `buildFinancialSummary()`, `normalizeRow()`, `mkTx()` or `detectTransfers()` start reading a new `State` key, add it to the sandbox or the user's value will leak into the eval.
- **Same parsing as an import.** `buildDataset()` mirrors `parseCsvFile()` (schema detection, account ids, occurrence suffixes) without touching IndexedDB. If `parseCsvFile()` changes, mirror it here; the sandbox summary must equal what a normal import of `samples/` produces.
- **Same request as the AI tab** — `callClaude()` raw mode (§13). Never build a second request path. The tab's quick analyses (`AI_QUICK`) send `AI_PROMPTS` questions unchanged, so every prompt the eval runs is one the tab sends.
- **Each run records** `meta.maxTokens` and every call's `usage` (including `output_tokens_details.thinking_tokens`), and EVAL.md reports cut-off answers and thinking per answer. Runs from before v1.10.1 didn't record `maxTokens`, so it is inferred from the size the cut-off answers stopped at.
- **EVAL.md escapes `~` in excerpts** (`quote()` in `toMarkdown()`), because GitHub also strikes through text between single tildes. Keep any new model-text cell going through `quote()`; code spans use `pipe()`, since `\~` shows literally there.
- **Declined runs** (`stop_reason` `refusal`) have no answer: they are counted in the *Calls* row, like failed calls, and left out of the scoring and token averages.
- **Nothing persisted.** Results live in memory only and leave via the download buttons, so §20 needs no entry. Don't add `lsSet()` calls here. The API key is never put in results, exports or logs.
- **A summary loaded from a results JSON is never sent.** It can be re-scored locally (`loadResults()` sets `dataset.fromFile`), but Run stays disabled until samples are reloaded and verified.
- **The summary format is parsed** by `parseSummary()`: the period line (`S.days`, `S.periodMonths`) and month lines with an optional `(through …)` / `(from …)` note. If `buildFinancialSummary()` changes, update the parser and its derivations *before* the next run. Example: the per-month figures over the period (total ÷ months as stated, or ÷ days/30.44) were added in v1.10.2 together with the dates. The balance lines are matched by how they start (`Total Cash: `, `Debts`), so keep those starts: a past range's notes (v1.16.11, §13) go after `Accounts` and at the end of the Total Cash line, hold no amounts, and needed no parser change.
- **Publishing a new run:** move the current `docs/EVAL.md` and `docs/eval-results.json` to `docs/eval-runs/v<the old run's version>/` unchanged except for a one-line "Archived" banner, its JSON link label, and relative links the move would break (`eval-runs/vX/…` becomes `../vX/…`). Put the new results JSON in `docs/`, generate EVAL.md by loading it in the view (**Load results JSON** → **Download EVAL.md**), then add the hand-written sections before *Method*: the **Runs** table (one column per run: `max_tokens`, cut-off answers, tokens, figures, grounded, derived, traceable, unsupported), what changed between runs, and *Changes made after the run*. Keep README's Evaluation numbers in step.
- **Changing the matcher after a run:** fix only bugs against the method EVAL.md states. Record each fix in EVAL.md's "Changes made after the run" with before and after numbers. Never add a rule just because it raises the score on answers you've already seen.
- **Classification** (`classifyText()`): grounded → explicit equation (a wrong one is a math error) → standard derivations (`_candidates()`, each with context keys) → restatements, correct equations and same-line arithmetic on anchored figures → forecast (the 12-month prediction prompt only) or unsupported. When adding a derivation, give it context keys; check the chance-match rate in the report doesn't rise noticeably — it is the matcher's false-positive rate and is published alongside the headline.

---

## 22. Migrations (migrate.js)

Data saved by older versions is rewritten when it's loaded. Everything lives on the `IdMigration` namespace object, loaded after `db.js`.

### v1.12.0: account codes

Up to v1.10.x the account kinds, `BANK_SCHEMAS` ids, account ids and default account names were named after banks. Now they are:

| What | New |
|---|---|
| Kinds and schema ids | `bank_checking`, `bank_savings`, `credit_card` |
| Account ids | `bank_checking`, `bank_savings`, `card_<file>` |
| Default names | `Bank Checking`, `Bank Savings`, `Bank Credit Card (<file>)` |

The old codes and names are listed in `migrate.js` and nowhere else in the code or current docs. They stay there so browser storage, `finlens-state.json`, its backups and JSON exports from older versions still load.

**Where it runs**
- **Boot** (`init.js`): `IdMigration.atBoot()`, after State is loaded. It rewrites State, then IndexedDB (`transactions`, `tx_overrides`, `accounts`, `import_log`, `app_state`, all in one transaction) and localStorage. It only reads the `transactions` store when the `accounts` store still has an old id.
- **The state file** (`loadStateFromFile()`): it rewrites the loaded copy and schedules a save, so the file on disk gets the new codes once write access allows.
- **JSON import** (`importJsonFile()`): it rewrites the export, and its edits move to the current ids.
- **CSV import** (`loadFiles()`): `adoptOverrides()` moves edits still saved under an old id (for example, kept while transactions were cleared) to the new id.

Each step is idempotent: on new data nothing matches and nothing is written.

**Transaction ids.** The id hashes the account id (§10), so renaming an account changes its transactions' ids. Stored transactions lack the bank time and post date, so the id can't be recomputed from them. `hash()` is linear instead (h = 31·h + c mod 2³²), so `_rekey()` takes the prefix hash out of the old id and extends it with the new account id. The id keeps only |h|, so there are two candidates. `_fits()` keeps the one that matches the transaction's date, description and amount, with a time or post date found by search. If neither or both match, the transaction keeps its old id, and the count is logged. That didn't happen in testing (20,000 random ids, plus the samples).

**Rules**
- **Changing `hash()` or the hash-key layout in `mkTx()`** changes every transaction id. It breaks re-import dedup and every edit. Don't, unless you add a migration for it here.
- **Renaming a code again** needs a new mapping here. Old data must still load.
- **Names the user typed are never changed.** Only the old default names are renamed.
- **File names are user data.** An account id derived from a file name keeps whatever that name contains. To hide a name, relabel the account; renaming the CSV file creates a new account on the next import.
- **No new storage.** It only rewrites places listed in §20.

### v1.16.7: plan item ids and transaction links

Up to v1.16.6 a transaction's link to a budget, bucket or debt (`txOverrides[txId].link`) was `{ type, idx }`, the item's position in its list. Deleting an item moved the ones after it up a place, so their links pointed at the wrong item. Items now have an `id` and links are `{ type, id }` (§4.1). `IdMigration.migratePlanLinks(s)` rewrites older data, in place:

| What | Becomes |
|---|---|
| An item with no `id` (or one an earlier item in the list already has) | `'<prefix>_m<n>'`, n = its position when the migration runs (`bud_m0`, `bkt_m2` …); `_2`, `_3` … if that id is taken |
| A link `{ type, idx }` with idx inside the list | `{ type, id: list[idx].id }`: the item it already pointed at |
| A link whose idx is past the end of the list (or not a whole number) | dropped; an edit left with nothing else in it is removed |
| A link whose list isn't in the object (an export without it), a link of another type, a link that already has an id | left as is |

**Where it runs:** inside `migrateState()`, so in the same three places as the account codes:
- **Boot** (`atBoot()`): on State, then `storePlanLinks()` writes State's `budgets`, `buckets`, `debts` and `txOverrides` back through `lsSet()` (localStorage, IndexedDB `app_state` and the debounced state-file save). It writes them when the migration changed State, or when a copy in browser storage still has old links or items without ids (State came from the state file, already migrated). The four keys are written together, so a copy's links always come with the lists they point into.
- **The state file** (`loadStateFromFile()`): it rewrites the loaded copy and schedules a save, as for account codes. `_restoreStateIfBrowserEmpty()` loads through it too.
- **JSON import** (`importJsonFile()` calls `migrateState()`): the export's lists and links are rewritten before they replace State's.

One log line (`[FinLens] Plan links: …`) says what changed and where.

**Rules**
- **The ids it gives depend only on position**, so the same old data gets the same ids wherever it's migrated (browser storage, the state file, an export), and a link never changes target. Running it again changes nothing.
- **It doesn't touch the `tx_overrides` IndexedDB store.** Nothing writes that store any more, and links are read only from `State.txOverrides`.
- **New items never get `_m<n>` ids:** they get random ones from `newPlanId()`.
