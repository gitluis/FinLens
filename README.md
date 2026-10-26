# FinLens — Personal Finance Dashboard

> A zero-install, browser-native finance dashboard. Drop in your bank CSVs, get instant clarity on your money.

**Version:** v1.11.2 &nbsp;·&nbsp; **Stack:** Vanilla JS, HTML, CSS &nbsp;·&nbsp; **Install:** None

---

## What It Does

FinLens turns raw CSV exports from Ally Bank and Chase into a fully interactive personal finance dashboard — no account linking, no cloud sync, no subscriptions. Your data never leaves your machine.

Load your CSV files once, and FinLens gives you:

- A live **Overview** with net worth, cash flow, and account sparklines
- **Transaction** search, filtering, sorting, and inline editing
- **Spending** breakdowns by category with drill-down tables and a heatmap
- **Income** analysis with recurring deposit detection
- **Bills & Subscriptions** tracking with an auto-detection engine
- **Budgeting** with progress bars and month-over-month history
- **Savings Buckets** with goal tracking and target dates
- **Debt Tracker** with avalanche vs. snowball payoff simulation
- **Trends** across months, categories, and accounts
- **Forecast** simulators for savings and investment growth
- **AI Analysis** powered by Claude (Anthropic API key required)

---

## Getting Started

**1. Open the app**

```
Open index.html in Chrome, Arc, Edge, or Brave
```

No server. No install. No `npm install`. Just open the file.

**2. Load your data**

Go to **Settings → Import** and click **Pick a Folder**. Point it at a folder containing your CSV exports:

| Bank | How to export |
|---|---|
| Ally Bank Checking | Account → Transactions → Export → CSV |
| Ally Bank Savings | Account → Transactions → Export → CSV |
| Chase Credit Card | Account → Download → CSV (Activity) |

FinLens auto-detects which file is which based on filename and column headers. You can also assign them manually if the auto-detection misses.

**No bank exports handy?** Pick the [`samples/`](samples/) folder instead — three synthetic CSVs (fake data) covering May–Oct 2026. Set the date range to **All Time** to see everything.

**3. Explore**

Use the sidebar to navigate between views. The date range picker in the top bar applies to most views. The account filter lets you focus on a single account.

---

## Supported Banks

| Account Type | Kind | Notes |
|---|---|---|
| Ally Checking | `ally_checking` | Balance computed from transactions + manually entered starting balance |
| Ally Savings | `ally_savings` | Balance computed from transactions + manually entered starting balance |
| Chase Credit Card | `chase` | Multiple card files supported simultaneously |
| Other CSV | `unknown` | Any CSV with Date, Description, Amount columns — set initial balance manually in Data tab |

---

## Browser Compatibility

| Browser | Full Support | Auto-reload CSVs on refresh |
|---|---|---|
| Chrome | ✅ | ✅ |
| Arc / Brave | ✅ | ✅ |
| Edge | ✅ | ✅ |
| Safari | ✅ | ❌ (File System Access API not supported) |
| Firefox | ✅ | ❌ (File System Access API not supported) |

**Auto-reload** requires the File System Access API (Chrome/Edge/Arc/Brave). When you pick a CSV folder, FinLens remembers it and silently reloads your transactions on every page refresh — no re-upload needed. On Safari/Firefox, transactions persist via IndexedDB but the folder handle cannot be re-granted automatically.

---

## Data Persistence & Auto-Backup

FinLens stores all your data — budgets, bills, transaction edits, settings, AI history, forecasts — **directly on your computer**, never on a server.

**How it works:**
1. When you pick a CSV folder in the **Data** tab, FinLens begins auto-saving your complete state to `finlens-state.json` in that same folder.
2. Every 5 seconds (when you make changes), your dashboard state is written to this file. You can also click **Save Now** to force an immediate sync.
3. On every page load, FinLens checks for `finlens-state.json` first — if it exists, your entire state (budgets, categories, overrides, settings, AI history) is restored instantly. If the file doesn't exist, it falls back to the browser's IndexedDB or localStorage.
4. Because the file lives on your computer (not in the browser), **it survives browser cache clearing**. Even if you clear all browser data, your `finlens-state.json` remains on your disk and will be restored on the next load.

**Disaster recovery:**
- If the browser IndexedDB is wiped or you switch browsers, your `finlens-state.json` file is still there on your disk.
- You can manually back up the file using your OS file manager, Dropbox, iCloud, or any cloud sync service.
- To restore from a backup: place the backup `finlens-state.json` back in your folder and refresh the browser.

**No cloud sync:** FinLens never communicates with any server for data storage. Your data is yours, on your machine. If you want cloud sync, use your OS's native file sync (iCloud Drive, OneDrive, Google Drive, Dropbox).

---

## Features In Depth

### Overview
Net worth snapshot, per-account balance cards with sparklines, cash flow chart, upcoming bills list, and top Chase transactions for the selected period.

### Transactions
Full transaction table with search, category filter, type filter (Income / Expense / Transfer), sortable columns, and pagination (50 per page). Click any row to open an edit drawer — update description, categories, type, notes, and flags (Bill, Recurring, Subscription). Transaction Rules let you auto-flag transactions by keyword (e.g. "Netflix → Subscription").

### Income
Total income, average monthly, interest earned, and returns/refunds KPI cards. Income by source donut chart, monthly bar chart, recurring deposit detection table, and full deposits list.

### Bills
Auto-detected recurring charges with confidence scores and frequency classification. One click to confirm a charge as a bill and add it to your calendar. Manual bill management with due-date tracking, overdue indicators, and a collapsible monthly calendar.

### Spending
Total spent, average daily, top category, and transaction count. Vertical bar chart and horizontal category ranking (click any bar to drill into transactions), monthly trend line, daily heatmap (last 365 days), and top merchants table. Custom categorization rules (keyword → category).

### Transfers
Auto-paired transfer legs across accounts. Account flow diagram. FROM/TO filter dropdowns. Clickable rows to edit transfer description and notes.

### Budgeting
Monthly budget vs. actual with color-coded progress bars. Over-budget and warning banners. Monthly history chart. Seed from a suggested starter budget or add custom categories.

### Savings Buckets
Goal-based savings tracker with emoji icons, target dates, progress bars, and monthly contribution estimates.

### Debt Tracker
Debt list with balance, APR, minimum payment, and credit limit. Avalanche vs. snowball payoff simulation with a month-by-month breakdown and total interest comparison.

### Trends
Monthly income/expense/savings bar chart, rolling savings rate line, top category ranking over time, and account balance trends.

### Investing Ideas
Curated ETF and individual stock reference lists with suggested allocations. User-editable "My %" inputs (saved across sessions). Portfolio donut chart and a recommended strong-portfolio preset (VTI/VXUS/BND/SCHD/VNQ/VTIP).

### Forecast Savings
Project your savings over 1–30 years with configurable starting balances (Checking, Savings, Debt), monthly contribution, expected return, and tax drag. Save and compare up to 10 scenarios.

### Forecast Investments
Compound growth projection with starting amount, monthly contributions, time horizon, return presets (Conservative 5% / Moderate 8% / Aggressive 11% / Custom), and inflation adjustment. Year-by-year nominal vs. real value table.

### AI Analysis
Ask Claude anything about your finances. Eight preset quick-analysis prompts or a free-form custom question. Claude receives a structured summary of your current financial state (balances, income, spending by category, debts, subscriptions) as context. Requires your own [Anthropic API key](https://console.anthropic.com). History is saved locally (up to 50 entries) and exportable as Markdown.

---

## Data & Privacy

- **No accounts linked.** You export CSVs manually — FinLens never connects to any bank.
- **No data leaves your machine.** Everything runs in your browser. The only external request is the Claude AI call (if you use it), which goes directly to Anthropic's API using your own key.
- **No server.** `index.html` opens directly from your filesystem.
- **Persistence:** all state is saved to `finlens-state.json` in your CSV folder (filesystem-first), with IndexedDB and localStorage as fallbacks. Survives browser cache clearing. Transactions survive page reloads without re-uploading CSVs.
- **Backup & Restore** — your `finlens-state.json` is a plain JSON file you can copy anywhere. It never contains your Anthropic API key.
- **Git-safe** — `data/`, `finlens-state.json`, settings exports and saved AI analyses are all git-ignored.

---

## AI Setup (Optional)

1. Get an API key at [console.anthropic.com](https://console.anthropic.com)
2. Go to **Settings → General → Anthropic API Key** and paste it in
3. Open **AI Analysis** and start asking questions

FinLens uses `claude-sonnet-5-5`.

**How the AI feature is secured:**
- **Key storage** — the key is stored only in your browser (localStorage + IndexedDB). It is never written to `finlens-state.json`. Versions up to 1.7.0 did save it there; v1.8.0 moves it into browser storage on load and rewrites the file without it on the next save (click **Save Now** in **Settings → Import** to force it). For a personal, local-only app this is a deliberate trade-off; a multi-user deployment would proxy calls through a server holding the key in a secrets vault.
- **Prompt injection** — your financial summary is sent inside `<financial_data>` tags, and the system prompt tells Claude to treat that content as data, never as instructions (merchant descriptions come straight from bank CSVs).
- **Output rendering** — Claude's Markdown is converted with marked and sanitized with DOMPurify before it touches the page (`renderMarkdown()` in `core.js`). Scripts, event handlers and images are stripped, so injected text can't run code or exfiltrate data through image URLs. Both libraries are version-pinned with SRI hashes.

---

## Evaluation

How far can you trust the numbers in an AI Analysis answer? FinLens has a grounding eval: each of the 8 quick-analysis prompts is run 3 times on the synthetic data in `samples/`, and every dollar amount and percentage in the answers is checked against the financial summary the model was sent.

**Result** (`claude-sonnet-5-5`, 24 answers, 703 dollar and percentage figures):

- **68.8% traceable to the data:**
  - **48.6%** matched the data the model was sent;
  - **20.2%** were arithmetic on that data, verified in code.
- **No math errors.**
- **28.4% unsupported.** These are mostly recommendations and benchmarks (budgets, rules of thumb) rather than claims about the data.
- **Hand check:** of 75 random figures, every grounded and derived one checked was correct, so the matcher errs on the conservative side.

Each figure is classified as **grounded** (in the data), **derived** (arithmetic on the data, verified in code), a **math error**, an unverifiable **forecast** assumption, or **unsupported**. A chance-match calibration measures how often the matcher would accept a wrong number. **[docs/EVAL.md](docs/EVAL.md)** has the method, per-prompt results and every unsupported figure with its context.

To re-run it: save an API key in Settings, open DevTools, run `showView('ai-eval')` and click **Run eval** (24 calls, about 6 minutes). If FinLens is opened as a file, pick the three CSVs in `samples/` when asked. It only ever uses `samples/` — your own data, range and settings are untouched.

---

## Project Structure

```
FinLens/
├── index.html            ← App shell, all CSS, CDN script tags
├── CHANGELOG.md          ← Full version history
├── CLAUDE.md             ← Developer/AI context for this codebase
├── data/                 ← Drop your CSV files here (not committed to git)
│   ├── ally_checking_transactions.csv
│   ├── ally_savings_transactions.csv
│   └── chase_transactions.csv
├── samples/              ← Synthetic CSVs (fake data) for trying the app and the AI eval
│   ├── ally_checking_sample.csv
│   ├── ally_savings_sample.csv
│   └── chase_card_sample.csv
├── docs/
│   ├── EVAL.md           ← AI Analysis grounding eval: method and results
│   └── eval-results.json ← Raw answers and per-figure classifications from that run
└── js/
    ├── core.js           ← State, helpers, CSV parsing, bank schema registry
    ├── aggregation.js    ← Pure data aggregation: sums, groupings, recurring detection
    ├── db.js             ← IndexedDB layer (finlens_db)
    ├── ui.js             ← View engine, drawer, chart helpers, CRUD
    ├── views-main.js     ← Overview, Transactions, Income, Bills, Spending, Transfers
    ├── views-plan.js     ← Budgeting, Savings Buckets, Debt Tracker, Trends
    ├── views-invest.js   ← Investing Ideas
    ├── views-forecast.js ← Forecast Savings + Forecast Investments
    ├── views-ai.js       ← AI Analysis (Claude integration)
    ├── views-data.js     ← Database section: Import, Accounts, Categories, Import Logs
    ├── views-settings.js ← Settings shell + General tab (theme, API key)
    ├── views-cleanup.js  ← Settings → Data & Reset (clean up data, start over)
    ├── views-db.js       ← DB Inspector, DB Schema diagram, Changelog views
    ├── views-eval.js     ← AI Eval: grounding eval for AI Analysis (developer view)
    └── init.js           ← App boot and event wiring
```

**Zero dependencies.** No npm, no bundler, no build step. Vanilla ES2020+ JavaScript with Chart.js, PapaParse, Day.js, marked.js, and DOMPurify loaded from CDN.

---

## Tips

**Refreshing data** — FinLens auto-reloads your CSVs on page refresh if it still has permission to the folder you picked. You can also click **↻ Reload** in **Database → Import** to force a re-read.

**Category rules** — go to **Spending → Category Rules** to teach FinLens your merchants. Rules apply across all future imports. Your category list is managed under **Database → Categories**.

**Multiple Chase cards** — load as many Chase CSV files as you want. Each gets its own account card and can be filtered independently.

**Cleaning up or starting over** — **Settings → 🧹 Data & Reset** shows what FinLens has stored and lets you:
- **Clean up imported data:** clear imported transactions, the import log or your transaction edits.
- **Rebuild from your CSV folder:** fixes a messy database without touching your plans.
- **Clear individual plans:** budgets, bills, buckets, debts or AI history.
- **Disconnect the folder.**
- **Start over from scratch:** type `RESET` to erase everything and reload. Your backup file is either kept as `finlens-state-backup-DDMMYYYY.json` or deleted, your choice. Your CSV files are never touched.

**Dark mode** — click the **◐** button in the top-right corner of the topbar.

**Exporting** — the Transactions tab has an **Export CSV** button for the currently filtered view. AI responses can be saved as Markdown from the AI Analysis tab.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

*FinLens v1.11.2 — Built for one person's finances, designed to be useful for anyone's.*
