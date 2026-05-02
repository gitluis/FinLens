# FinLens — IndexedDB Implementation Plan

> Implementation reference for migrating FinLens from localStorage + finlens-data.json
> to a full IndexedDB-backed local database, with a generalized bank schema registry
> that makes adding new banks or credit cards a configuration change, not a code change.
> Also covers four generalization improvements to existing dashboard systems.
> Read CLAUDE.md before implementing.

> **ARCHIVED** — Implementation completed in v1.4.0 (all phases) and v1.4.1 (FileStorage removal).
> This document is retained for historical reference only.
> For the current architecture, see CLAUDE.md §19.

---

## Why IndexedDB

- **localStorage** has a ~5MB limit and stores everything as serialized JSON strings — not viable for growing transaction history.
- **finlens-data.json** via File System Access API requires user permission re-grants and is inaccessible on Safari/Firefox.
- **IndexedDB** is native to the browser, already partially used (for `FileSystemDirectoryHandle`), has no size limit, supports structured object storage, cursor-based queries, and atomic transactions. No CDN dependency, no build step.

---

## New Files

Add both to `index.html` in this load order, immediately after `core.js`:

```
core.js → db.js → views-main.js → views-plan.js → views-invest.js
       → views-forecast.js → views-ai.js → views-data.js
       → views-settings.js → init.js
```

| File | Purpose |
|---|---|
| `js/db.js` | IndexedDB API layer — all database access |

---

## Bank Schema Registry

Replaces the hardcoded `normalizeAllyRow()` and `normalizeChaseRow()` functions with a
data-driven registry. **Adding a new bank requires only a new schema object — zero new code.**

### Schema Object Structure

```js
// Defined in core.js as a top-level constant
const BANK_SCHEMAS = [
  {
    id: 'ally_checking',               // Matches account kind
    name: 'Ally Bank Checking',
    kind: 'checking',                  // 'checking' | 'savings' | 'credit' | 'investment' | 'other'
    detect: (headers) =>               // headers = trimmed array from PapaParse
      headers.includes('Time') &&
      headers.includes('Type') &&
      headers.includes('Amount') &&
      !headers.includes('Transaction Date'),
    columns: {
      date:        'Date',
      time:        'Time',             // Bank-assigned HH:MM:SS — used in hash
      description: 'Description',
      amount:      'Amount',
      type:        'Type',             // 'Withdrawal' | 'Deposit'
    },
    amountSign: 'standard',            // negative = expense, positive = income (already correct)
    hashFields: ['date', 'time', 'description', 'amount'],
    headerTransform: h => h.trim(),    // Ally's leading-space quirk
    allowOccurrenceSuffix: false,      // Time field makes collisions near-impossible
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'ally_savings',
    name: 'Ally Bank Savings',
    kind: 'savings',
    detect: (headers) =>
      headers.includes('Time') &&
      headers.includes('Type') &&
      headers.includes('Amount') &&
      !headers.includes('Transaction Date'),
    // Note: ally_checking and ally_savings share the same CSV format.
    // Disambiguation happens via filename ('saving' in filename → savings).
    // detect() is identical; filename check runs first in parseCsvFile().
    columns: {
      date:        'Date',
      time:        'Time',
      description: 'Description',
      amount:      'Amount',
      type:        'Type',
    },
    amountSign: 'standard',
    hashFields: ['date', 'time', 'description', 'amount'],
    headerTransform: h => h.trim(),
    allowOccurrenceSuffix: false,
    dateFormat: 'MM/DD/YYYY',
  },
  {
    id: 'chase',
    name: 'Chase Credit Card',
    kind: 'credit',
    detect: (headers) =>
      headers.includes('Transaction Date') &&
      headers.includes('Post Date'),
    columns: {
      date:        'Transaction Date',
      postDate:    'Post Date',        // Separate field — used in hash
      description: 'Description',
      amount:      'Amount',
      category:    'Category',         // Chase-assigned; used for initial auto-categorization
      type:        'Type',             // 'Sale' | 'Payment' | 'Return'
    },
    amountSign: 'standard',
    hashFields: ['date', 'postDate', 'description', 'amount'],
    allowOccurrenceSuffix: true,       // Required — truly identical rows occur (e.g. TAXMANIA)
    dateFormat: 'MM/DD/YYYY',          // Used by parseDate() for unambiguous parsing
  },
];
```

### Required vs Optional Columns

Only three columns are required for a valid transaction. Everything else degrades gracefully.

| Column key | Required | Fallback when absent |
|---|---|---|
| `date` | **Yes** | Row is skipped |
| `amount` | **Yes** | Row is skipped |
| `description` | **Yes** | Empty string |
| `time` | No | Omitted from hash |
| `postDate` | No | Omitted from hash |
| `category` | No | `autoCategory(description)` |
| `type` | No | Inferred from amount sign |

### Amount Sign Convention

```js
amountSign: 'standard'   // negative = money out, positive = money in (Ally, Chase)
amountSign: 'inverted'   // positive = money out, negative = money in (some banks flip this)
```

The generic normalizer applies `amt = amt * -1` when `amountSign === 'inverted'`.

### Generic Normalizer (replaces both hardcoded functions)

```js
// In core.js — replaces normalizeAllyRow() and normalizeChaseRow()
function normalizeRow(row, schema, accountId) {
  const get = (col) => col ? (row[col] || '').toString().trim() : '';

  const rawDate = get(schema.columns.date);
  const d = parseDate(rawDate);
  if (!d) return null;

  const postDate = schema.columns.postDate ? parseDate(get(schema.columns.postDate)) : null;
  const time     = get(schema.columns.time) || '';

  const rawAmt = get(schema.columns.amount).replace(/[$,]/g, '');
  let amt = parseFloat(rawAmt);
  if (isNaN(amt)) return null;
  if (schema.amountSign === 'inverted') amt *= -1;

  const desc = get(schema.columns.description) || '';
  const rawType = get(schema.columns.type).toLowerCase();
  const rawCat  = get(schema.columns.category);

  let type = amt < 0 ? 'debit' : 'credit';
  if (rawType.includes('payment') || rawType.includes('return')) type = 'credit';
  if (rawType.includes('deposit') || rawType.includes('credit'))  type = 'credit';
  if (rawType.includes('withdraw') || rawType.includes('debit'))  type = 'debit';
  if (rawType.includes('transfer')) type = 'transfer';

  const cat = (rawCat && rawCat !== '') ? rawCat.trim() : autoCategory(desc);

  return mkTx({ date: d, time, postDate, description: desc, amount: amt,
                category: cat, account: accountId, type });
}
```

### Column Mapping UI (unknown banks)

When `detect()` matches no built-in schema:

1. Show a **Column Mapping modal** in the Data tab.
2. User selects which column maps to date, amount, description (required) and optionally time, category, type.
3. User sets `amountSign` via a toggle ("Expenses are negative / positive").
4. User names the account (e.g. "FirstBank Checking") and selects `kind`.
5. On save, the custom schema is written to `app_state` under `'customSchemas'` and merged
   with `BANK_SCHEMAS` at runtime.
6. On next upload of a file with the same headers, the custom schema is detected automatically.

Custom schema objects have the same structure as built-in ones, plus `isCustom: true`.

---

## Generalization Improvements

Four existing dashboard systems should be generalized alongside the schema registry work.
Items 1–3 are part of Phase 0. Item 4 is a separate future task.

### 1. Transfer Keywords — User-Editable Registry

**Problem:** `detectTransfers()` uses a hardcoded regex
(`/transfer|zelle|ach|venmo|paypal|coinbase|savings booster/i`).
"Savings Booster" is Ally-specific. New banks will use different terminology.

**Solution:** Move transfer keywords to a user-editable list in the Settings tab,
following the same pattern as `categoryRules` and `txRules`.

**State:** `State.transferKeywords` — `string[]`, persisted to `app_state['transferKeywords']`.

**Default value (seeded on first load if empty):**
```js
['transfer', 'zelle', 'ach', 'venmo', 'paypal', 'coinbase', 'savings booster']
```

**UI — Settings tab, new "Transfer Keywords" card:**
- Displays current keywords as removable chips (same visual pattern as Category Rules).
- Text input + "Add" button to add new keywords.
- **"↻ Re-apply to All Transactions"** button — reruns `detectTransfers()` against
  `State.transactions` using the updated keyword list, then calls `renderActive()`.
  Same pattern as the existing "↻ Re-apply" button on Transaction Rules.

**`detectTransfers()` change in `core.js`:**
```js
// Before (hardcoded):
const TRANSFER_KW = /transfer|zelle|ach|venmo|paypal|coinbase|savings booster/i;

// After (driven by State):
const TRANSFER_KW = new RegExp(
  State.transferKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i'
);
```

**`core.js` additions:**
- Add `transferKeywords: lsGet('transferKeywords', DEFAULT_TRANSFER_KEYWORDS)` to `State`.
- Add `['transferKeywords', 'transferKeywords']` to `FS_STATE_MAP`.
- Add `DEFAULT_TRANSFER_KEYWORDS` constant.

---

### 2. Date Format — Schema-Level Field

**Problem:** `parseDate()` assumes MM/DD/YYYY (US format). Non-US banks or some
US banks' alternate exports may use DD/MM/YYYY or YYYY-MM-DD.

**Solution:** Add `dateFormat` to each schema object. `parseDate()` accepts an optional
format hint when called from `normalizeRow()`. Built-in schemas all use `'MM/DD/YYYY'`.
The Column Mapping UI exposes a date format selector for custom schemas.

**`dateFormat` values:** `'MM/DD/YYYY'` | `'DD/MM/YYYY'` | `'YYYY-MM-DD'`

**`parseDate()` signature change in `core.js`:**
```js
// Before:
function parseDate(s) { ... }

// After — format is optional; existing callers without format continue to work:
function parseDate(s, format = 'MM/DD/YYYY') { ... }
```

No change required in any view — `parseDate()` is only called from `normalizeRow()`
and a handful of places in `core.js` that use unambiguous ISO strings.

---

### 3. Account Kind → Balance Behavior

**Problem:** `currentBalances()` and `periodEndBalance()` in `core.js` likely branch
on hardcoded account IDs or kind strings like `'ally_checking'`. With the schema
registry introducing a clean `kind` taxonomy, balance computation must work for any
account with that kind — not just the currently hardcoded ones.

**Solution:** Replace any hardcoded account ID / kind checks in balance functions with
generic `kind`-based rules:

| Kind | Balance type | Display |
|---|---|---|
| `checking` | Asset | Positive = money available |
| `savings` | Asset | Positive = money available |
| `investment` | Asset | Positive = portfolio value |
| `credit` | Liability | Balance shown as positive owed amount (`Math.abs`) |
| `other` | Asset | Positive = money available |

No UI needed. This is a pure code cleanup in `core.js`.

---

### 4. Forecast Savings — Account-Driven Inputs (Future Task)

**Problem:** The Forecast Savings view has hardcoded inputs built around one checking +
one savings + optional debt. Adding a second savings account, a brokerage, or a second
credit card breaks the layout assumptions.

**Solution (deferred):** Drive the starting balance inputs from `orderedAccounts()`
filtered by `kind` rather than looking for specific account IDs. Each account renders
its own labeled input. This is a `views-forecast.js` refactor — substantial enough to
be its own task, not part of the IndexedDB implementation.

**Do not implement during the IndexedDB migration.** Track as a follow-up.

---

## Database Schema

**Database name:** `finlens_db`  **Version:** `1`

### Object Store: `transactions`
Immutable source records. Write-once via `add()` — never `put()`.

| Field | Type | Notes |
|---|---|---|
| `id` | string | **keyPath** — deterministic hash, inputs vary by schema |
| `date` | Date | Indexed |
| `yearMonth` | string | `'YYYY-MM'` — Indexed (fast month queries) |
| `account` | string | accountId — Indexed |
| `type` | string | `'debit'`\|`'credit'`\|`'transfer'` — Indexed |
| `schemaId` | string | Which schema produced this row — Indexed |
| `description` | string | |
| `amount` | number | Immutable |
| `categories` | string[] | Auto-categorized at import time |
| `isRecurring` | boolean | |
| `isBill` | boolean | |
| `isSubscription` | boolean | |
| `_originalDesc` | string | Immutable |

**Indexes:** `date`, `account`, `type`, `yearMonth`, `schemaId`

### Object Store: `tx_overrides`
User edits to transactions. Keyed by `txId`.

| Field | Type | Notes |
|---|---|---|
| `txId` | string | **keyPath** — references `transactions.id` |
| `description` | string? | |
| `categories` | string[]? | |
| `type` | string? | |
| `notes` | string? | |
| `isRecurring` | boolean? | |
| `isBill` | boolean? | |
| `isSubscription` | boolean? | |
| `accountOverride` | string? | |
| `modifiedAt` | Date | Audit trail |

### Object Store: `accounts`
Account metadata. Replaces `State.accounts` persistence.

| Field | Type | Notes |
|---|---|---|
| `id` | string | **keyPath** — e.g. `'ally_checking'` |
| `name` | string | Display name (user-editable) |
| `kind` | string | `'checking'`\|`'savings'`\|`'credit'`\|`'investment'`\|`'other'` |
| `schemaId` | string | Which schema was used to import this account's data |
| `manualBalance` | number? | |
| `creditLimit` | number? | |
| `initialBalance` | number? | |
| `displayOrder` | number | |
| `sourceFile` | string | |
| `dataRangeMin` | Date? | Earliest transaction date in DB for this account — updated after every import |
| `dataRangeMax` | Date? | Latest transaction date in DB for this account — updated after every import |
| `txCount` | number | Total transactions in DB for this account — updated after every import |

### Object Store: `import_log`
Audit trail for every CSV upload.

| Field | Type | Notes |
|---|---|---|
| `id` | number | **keyPath** — auto-increment |
| `timestamp` | Date | |
| `filename` | string | |
| `accountId` | string | |
| `schemaId` | string | Schema used for this import |
| `rowsFound` | number | Total rows in CSV |
| `rowsInserted` | number | New rows only |
| `rowsSkipped` | number | Duplicates (ID already existed) |
| `dateRangeMin` | Date | Earliest transaction in file |
| `dateRangeMax` | Date | Latest transaction in file |

### Object Store: `app_state`
Key-value store. Drop-in replacement for `localStorage`.

| Field | Type | Notes |
|---|---|---|
| `key` | string | **keyPath** |
| `value` | any | JSON-serializable |

Replaces all current `lsSet`/`lsGet` calls for: `budgets`, `buckets`, `debts`, `bills`,
`categoryRules`, `categories`, `apiKey`, `aiHistory`, `scenarios`, `investAlloc`,
`theme`, `range`, `selectedAccounts`, `manualBalances`, `accountOrder`, `accountLabels`,
`txRules`, `recurringConfirmed`, `fileAssignments`, `customSchemas`, `transferKeywords`.

---

## DB API (`db.js`)

All methods return Promises. Use fire-and-forget for writes that don't need confirmation;
await reads at boot before first render.

```js
const DB = {

  // ── Lifecycle ──────────────────────────────────────────────────────────
  open(),
  // Opens finlens_db v1. Creates all stores + indexes on first run.
  // Calls migrateFromLocalStorage() during onupgradeneeded if this is a
  // fresh install (no existing stores). Returns Promise<void>.

  // ── App State (replaces lsSet / lsGet) ────────────────────────────────
  setState(key, value),      // Upsert into app_state store
  getState(key, default),    // Read from app_state; return default if absent

  // ── Transactions ──────────────────────────────────────────────────────
  importTransactions(txArray, accountId, schemaId),
  // Batch insert. Uses add() for each tx — ConstraintError = duplicate,
  // silently skipped. If schema.allowOccurrenceSuffix is true, appends
  // _2, _3 suffix for truly identical rows instead of skipping.
  // After insert, updates accounts.dataRangeMin/Max/txCount for this account.
  // Returns { inserted, skipped, dateRangeMin, dateRangeMax, gapWarning }.
  // gapWarning is non-null when a gap is detected between the existing
  // dataRangeMax and this file's earliest date: { from: Date, to: Date }.

  getCoverage(),
  // Returns { [accountId]: { min: Date, max: Date, count: number } }
  // Read directly from the accounts store (maintained by importTransactions).
  // Used to populate the coverage display in the Data tab.

  loadAll(),
  // Fetches all transactions + all overrides → mergeTx() → loads into
  // State.transactions. Also loads all app_state keys into State and
  // merges customSchemas into BANK_SCHEMAS.
  // Call at boot before first renderActive(). Returns Promise<void>.

  queryTransactions(filter),
  // filter: { from: Date, to: Date, accounts: string[] }
  // Uses IDB cursor on date index. Returns Transaction[].

  // ── Overrides ─────────────────────────────────────────────────────────
  setOverride(txId, patch),
  // Upsert. Merges patch with existing override. Sets modifiedAt = now.
  // Replaces: State.txOverrides[id] = ...; lsSet('txOverrides', ...)

  getOverrides(),
  // Returns Map<txId, override> for all stored overrides.
  // Called inside loadAll() to merge with raw transactions.

  // ── Accounts ──────────────────────────────────────────────────────────
  upsertAccount(account),
  // Merges — will not wipe existing manualBalance on re-import.

  getAccounts(),
  // Returns Account[]. Called at boot to populate State.accounts.

  // ── Import Log ────────────────────────────────────────────────────────
  logImport(meta),
  // Writes import_log entry. meta: { filename, accountId, schemaId,
  // rowsFound, rowsInserted, rowsSkipped, dateRangeMin, dateRangeMax }

  getImportLog(),
  // Returns ImportLog[] newest-first. Displayed in Data tab.

  // ── Migration ─────────────────────────────────────────────────────────
  migrateFromLocalStorage(),
  // One-time: reads all finlens_* keys from localStorage, writes them
  // into app_state store. Called only during DB version upgrade (fresh install).
  // Does NOT delete localStorage keys — they remain as a fallback.
}
```

---

## Occurrence Suffix Logic

Implemented inside `DB.importTransactions()`. Applies only to schemas where
`allowOccurrenceSuffix: true` (currently Chase). For all other schemas, a hash
collision = silent skip (`rowsSkipped++`).

```
Sort batch by (date, description, amount) for stable suffix assignment.

For each tx in batch:
  1. Attempt add(tx) to transactions store
  2. If ConstraintError (duplicate ID):
     a. If schema.allowOccurrenceSuffix === false → rowsSkipped++, continue
     b. If true → find next available suffix:
          try tx.id + '_2', '_3', ... until add() succeeds
        Assign that id, retry add(tx)
        rowsInserted++
```

---

## Chunked / Incremental Uploads

The expected upload pattern is:

1. **First upload** — largest historical dump available, from the beginning of account history up to date X. Could be months or years of data.
2. **Subsequent uploads** — one file per account per period, starting at X+1 through Y, then Y+1 through Z, and so on as the bank makes new exports available.

The dedup system handles this naturally — re-uploading rows that already exist produces `rowsSkipped`, so overlapping date ranges are safe. **Uploading with a few days of overlap is recommended** as a safety margin; there is no cost to doing so.

### Coverage Tracking

After every `importTransactions()` call, the `accounts` store is updated with:
- `dataRangeMin` — earliest transaction date in DB for this account
- `dataRangeMax` — latest transaction date in DB for this account
- `txCount` — total transaction count

These three fields give an always-current picture of what's in the DB per account without querying the full transactions store.

### Gap Detection

`importTransactions()` compares the incoming file's earliest date against the account's current `dataRangeMax` before inserting:

```
GAP_THRESHOLD = 2 days  (allow for weekends / bank processing delays)

if (fileMinDate > existingDataRangeMax + GAP_THRESHOLD):
  gapWarning = { from: existingDataRangeMax + 1 day, to: fileMinDate - 1 day }
```

A gap means transactions from that period are not in the DB. The warning is returned from `importTransactions()` and surfaced in the Data tab so the user knows to upload a file covering that window.

Gap detection is skipped on the **first upload** for an account (no `dataRangeMax` yet).

### Post-Upload Result Card (Data tab UI)

After each upload, the Data tab shows a result card per file:

```
✓ Ally Checking — ally_checking_apr2026.csv
  47 new transactions imported · 12 duplicates skipped
  File covered: Mar 1, 2026 → Apr 24, 2026
  Total in DB:  Jan 1, 2024 → Apr 24, 2026  (892 transactions)
  Next upload:  start from Apr 25, 2026

⚠ Gap detected: no data for Feb 3 → Feb 28, 2026
  Upload a file covering this period to fill it.
```

The "Next upload: start from [date]" line is the key UX affordance — the user never has to remember where they left off.

### Coverage Summary Card (Data tab — permanent)

A persistent card in the Data tab shows current DB coverage for all accounts:

| Account | First transaction | Latest transaction | Total |
|---|---|---|---|
| Ally Checking | Jan 1, 2024 | Apr 24, 2026 | 892 txns |
| Ally Savings | Jan 1, 2024 | Apr 24, 2026 | 341 txns |
| Chase Sapphire | Mar 15, 2024 | Apr 22, 2026 | 1,204 txns |

Populated by `DB.getCoverage()` on every view render of the Data tab.

### Overlap is Always Safe

The following upload sequences all produce correct results with no duplicates:

- Upload Jan–Mar, then upload Mar–Jun (2 months overlap) ✓
- Upload Jan–Jun, then upload again Jan–Jun with 10 new rows at the end ✓
- Upload Jan–Jun, then upload the exact same file again ✓ (all skipped)
- Upload Apr–Jun before uploading Jan–Mar ✓ (gap warning shown; data is still correct)

---

## Changes to Existing Files

### `core.js`

- **Remove** `normalizeAllyRow()` and `normalizeChaseRow()` — replaced by `normalizeRow(row, schema, accountId)`.
- **Add** `BANK_SCHEMAS` constant array (built-in schemas for Ally and Chase).
- **Add** `detectSchema(headers, filename)` helper — runs each schema's `detect()` function,
  with filename-based disambiguation for Ally checking vs savings applied first.
- **Add** `normalizeRow(row, schema, accountId)` — generic normalizer driven by schema config.
- **Update** `parseCsvFile()`: call `detectSchema()`, if no match open Column Mapping UI,
  then call `normalizeRow()` per row, then `DB.importTransactions(txs, accountId, schemaId)`.
- **Update** `mkTx()`: hash inputs are now determined by the schema's `hashFields` list,
  passed in via `o.time` and `o.postDate` as today. No structural change needed.
- **Replace** `lsSet()`/`lsGet()` app-state calls with `DB.setState()`/`DB.getState()`.
- **Replace** `State.txOverrides` mutations with `DB.setOverride()`.
- **Keep** `State.transactions` as the in-memory working array — unchanged for all views.

### `init.js`

```js
// Boot sequence becomes:
(async () => {
  await DB.open();       // Initialize IndexedDB, run migration if needed
  await DB.loadAll();    // Populate State + merge customSchemas into BANK_SCHEMAS
  applyTheme();
  buildNav();
  showView(State.currentView || 'overview');
  // ... rest of existing init
})();
```

### `views-data.js`

- Add **Coverage Summary card** — permanent card showing `dataRangeMin`, `dataRangeMax`,
  and `txCount` per account. Populated by `DB.getCoverage()`. Tells the user exactly
  where to start their next upload for each account.
- Add **Post-Upload Result card** — shown after each upload with: rows inserted/skipped,
  file date range, total DB coverage, "Next upload: start from [date]" guidance, and a
  gap warning when applicable (see Chunked / Incremental Uploads section).
- Add **Import Log card** — collapsible history table. Columns: Date, File, Account,
  Schema, Found, New, Skipped, File Range. Populated by `DB.getImportLog()`.
- Add **Column Mapping modal** — shown when `detectSchema()` returns null. Fields: account
  name, kind selector, column assignments (date/amount/description + optional), date format
  selector, amount sign toggle, save button. On save, writes custom schema to
  `app_state['customSchemas']`.

### `views-settings.js`

- **File Storage card**: update description — data now lives in IndexedDB (in-browser),
  not `finlens-data.json`. Keep Export/Import JSON backup buttons. File System Access API
  section repurposed for CSV folder management only.

### `index.html`

- Add `<script src="js/db.js"></script>` after `core.js` in the script load order.

---

## Migration Strategy

On first page load after this update:

1. `DB.open()` triggers `onupgradeneeded` (new DB, version 0 → 1).
2. All object stores and indexes are created.
3. `migrateFromLocalStorage()` reads all `finlens_*` keys and writes them into `app_state`.
4. `DB.loadAll()` reads `app_state` into State — all budgets, bills, settings etc. are intact.
   Also merges any saved `customSchemas` into `BANK_SCHEMAS`.
5. `State.transactions` is empty (no CSV data in IndexedDB yet).
6. User re-uploads their CSV files once — `detectSchema()` auto-assigns the right schema,
   `DB.importTransactions()` populates the `transactions` store.
7. On all subsequent loads, `DB.loadAll()` restores everything including transactions.

**Note on txOverrides:** After the hash strategy fix in v1.3.9, existing `txOverrides` in
localStorage will have stale IDs (old hash scheme). The migration moves them into `app_state`
as-is, but they will not match any transactions until the user re-applies them. Document this
as a known one-time breakage in the CHANGELOG.

---

## Implementation Phases

| Phase | Scope | Files | Est. |
|---|---|---|---|
| 0 | Schema registry + generalizations: `BANK_SCHEMAS`, `detectSchema()`, `normalizeRow()`, `dateFormat` in `parseDate()`, kind-based balance logic, `transferKeywords` + Settings UI card, remove hardcoded normalizers | `core.js`, `views-settings.js` | 3–4 hrs |
| 1 | DB foundation: `DB.open()`, all stores + indexes, `setState`/`getState`, `migrateFromLocalStorage` | `db.js` (new), `index.html` | 3–4 hrs |
| 2 | Transaction import: `importTransactions()` with occurrence suffix, gap detection, coverage tracking (`dataRangeMin/Max/txCount`), `getCoverage()`, `loadAll()`, update `parseCsvFile()` | `db.js`, `core.js` | 4–5 hrs |
| 3 | Overrides migration: `setOverride()`, `getOverrides()`, replace all `txOverrides` mutations | `db.js`, `core.js`, `ui.js` | 2–3 hrs |
| 4 | Boot + UI: async `init.js`, Coverage Summary card, Post-Upload Result card, Import Log card, Column Mapping modal, Settings update | `init.js`, `views-data.js`, `views-settings.js` | 3–5 hrs |
| 5 | Docs + cleanup: CLAUDE.md, CHANGELOG, version bump | `CLAUDE.md`, `CHANGELOG.md`, `index.html` | 1 hr |
| — | Forecast Savings account-driven inputs (deferred — separate task) | `views-forecast.js` | 2–3 hrs |

**Total (phases 0–5): ~16–23 hours**

---

## Key Constraints (from CLAUDE.md)

- No npm, no bundler, no build step — `db.js` must be vanilla ES2020+.
- No `async`/`await` inside `registerView` callbacks — async work belongs in handlers.
- Keep `lsSet`/`lsGet` functions in `core.js` — used by legacy paths during transition.
- `balance` field on transactions is always `null` — Ally does not export running balance.
- All existing view code calls `filteredTx()` — must continue to work unchanged.
- `BANK_SCHEMAS` is a constant in `core.js` (global scope) — `db.js` and all view modules
  can reference it without import statements.

---

*Created: 2026-04-27 — updated to include Bank Schema Registry, four generalization*
*improvements, user-editable Transfer Keywords registry, and chunked/incremental upload*
*support with gap detection and per-account coverage tracking.*
*See CLAUDE.md §10 for hash strategy details.*
*Archived: 2026-04-27 after v1.4.0–v1.4.1 completion.*
