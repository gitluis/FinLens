# FinLens — Personal Finance Dashboard

> A zero-install, browser-native finance dashboard. Drop in your bank CSVs, get instant clarity on your money.

**Version:** v1.16.4 &nbsp;·&nbsp; **Stack:** Vanilla JS, HTML, CSS &nbsp;·&nbsp; **Install:** None

---

## What It Does

FinLens turns raw CSV exports from your bank into a fully interactive personal finance dashboard — no account linking, no cloud sync, no subscriptions. Your data never leaves your machine.

Load your CSV files once, and FinLens gives you:

- A live **Overview** with net worth, cash flow, and account sparklines
- **Transaction** search, filtering, sorting, and inline editing
- **Spending** breakdowns by category with drill-down tables and a heatmap
- **Income** analysis with recurring deposit detection
- **Bills & Subscriptions** tracking with an auto-detection engine
- **Budget** by category, month by month, with a starter budget built from your spending
- **Savings buckets** with targets, dates and what each needs a month
- **Debt tracker** with avalanche, snowball and minimums-only payoff plans
- **Investing ideas**: sketch a portfolio mix from reference lists (not financial advice)
- **Trends** across months, categories, and accounts
- **Forecast** for savings and investment growth, with saved scenarios
- **AI Analysis** powered by Claude (Anthropic API key required)

---

## Getting Started

**1. Open the app**

```
Open index.html in Chrome, Arc, Edge, or Brave
```

No server. No install. No `npm install`. Just open the file.

**2. Load your data**

The first time you open FinLens, the Welcome screen offers **Pick your CSV folder** (you can also do it later in **Settings → Import**). Point it at a folder containing your bank's CSV exports (usually under the account's transactions or activity page → Download / Export → CSV):

| Account | Columns in the CSV |
|---|---|
| Bank checking | `Date`, `Time`, `Amount`, `Type`, `Description` |
| Bank savings | Same as checking |
| Bank credit card | `Transaction Date`, `Post Date`, `Description`, `Category`, `Type`, `Amount` |

FinLens auto-detects which file is which based on filename and column headers. Checking and savings exports have the same columns, so keep `checking` or `savings` in their file names (or assign them manually on import).

**No bank exports handy?** Click **Try it with sample data** on the Welcome screen: it loads the three synthetic CSVs in [`samples/`](samples/) (fake data, May–Oct 2026) and sets the date range to **All time**. If FinLens is opened as a file, your browser asks you to choose those three files. A banner says you're looking at sample data; **Use my own files** removes it, and importing your own files replaces it.

**3. Explore**

Use the top bar to move between views: Overview, Transactions, **Plan** (a menu with Budget, Buckets, Debt, Investments and Forecast), Trends and AI Analysis. Transactions has filter pills for Income, Spending, Bills, Payments and Transfers. On a phone or a narrow window they're in the **☰** menu. The calendar icon sets the date range for most views, and the bank icon picks which accounts to include. The **Synced** badge shows whether your changes are being saved to your folder.

---

## Supported Accounts

| Account Type | Kind | Notes |
|---|---|---|
| Bank Checking | `bank_checking` | Balance computed from transactions + manually entered starting balance |
| Bank Savings | `bank_savings` | Balance computed from transactions + manually entered starting balance |
| Bank Credit Card | `credit_card` | Multiple card files supported simultaneously |
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
Net worth with a trend chart (1M, 3M or all of your history) and the change since the end of last month. The latest month's money in, money out, net and savings rate, next to your 6-month average. A card per account with a balance sparkline (or, for a credit card, how much of the limit you're using). Six months of cash flow with the net for each month, bills due in the next three weeks, and the largest card purchases of the latest month. Double-click an account name to rename it.

### Transactions
Filter pills across the top: **All**, **Income**, **Spending**, **Bills**, **Payments** and **Transfers**. All and Payments filter the list; the other four open their own screens. The list has search, a category filter, sorting, an amount filter, bulk edits and 50 rows per page. Click a transaction to edit its description, categories, type, notes and flags (Bill, Recurring, Subscription). Edits are kept separately from the imported row, so re-importing never overwrites them. **Transaction rules** flag matching transactions automatically (e.g. "NETFLIX → Subscription"). **Payments** lists the payments made to your credit cards.

### Income
Total income, average per month, interest earned and refunds. Income by source as a stacked bar, monthly income (an unfinished month is shaded lighter), recurring deposits with their rhythm, next expected date and confidence, and every deposit.

### Bills
**Spotted recurring charges**: FinLens finds charges that repeat and shows its confidence. Confirm the real bills, or dismiss the rest (Undo brings one back). Add bills by hand with **+ Add bill**. Each bill has how often it repeats, its next due date, the account it pays from and when it was last paid (found in your transactions). Also a month calendar you can hide, and what your bills and subscriptions cost per month.

### Spending
Total spent, average per day, top category and highest month. Categories ranked by spend: pick one to see its transactions. A daily spending heatmap, the monthly trend, top merchants, and **category rules** (keyword → category).

### Transfers
Both legs of a transfer are paired automatically. A diagram shows where money moved between your accounts, and what left FinLens (e.g. Zelle payments). Filter the list by From and To account. **Transfer keywords** decide which unpaired transactions count as transfers; changing them re-runs detection right away.

### Budget
Pick a month with ‹ and ›. Each category shows a progress bar, what you spent, its budget and what's left; the pencil changes the amount right in the row, and the name opens the full edit (name, categories, delete). Alerts flag categories over budget or at 90% and up. A chart compares 6 months of spending with the total budget. **Use starter budget** fills in a budget per category from what you usually spend (the average of up to 3 recent complete months, rounded up to $10) and never replaces one you have.

### Savings buckets
Split your savings into goals. Each bucket has a target, what's saved, a date, an icon and a color, and shows what it needs a month to get there. The screen adds up what's saved, the targets, what every goal needs a month and what's not assigned yet, and compares it with how much you've actually been moving into savings.

### Debt tracker
Enter your debts, or take a credit card's balance and limit straight from your CSVs. Total debt, minimums (and their share of take-home pay), average APR and card utilization. The **payoff plan** compares avalanche (highest rate first), snowball (smallest balance first) and paying only the minimums for any extra amount a month: when you'd be debt-free, the interest you'd pay, the payoff order and the first 6 months. Interest is added monthly at APR ÷ 12; a paid-off debt's minimum moves on to the next one.

### Trends
Your latest six months, across every account: average saved a month, savings rate, the fastest-growing category and the steadiest month. Income, spending and savings by month; the savings rate with a 3-month average and a note on what moved it; each account's balance over the six months; and your top six categories month by month, shaded so each category's most expensive months stand out.

### Investing ideas
Reference lists for learning, not financial advice. Type your own % next to nine index funds and ETFs (or use the balanced 40/20/20/10/5/5 preset) and see your mix, and its stock / bond / real estate split, update as you type. Six well-known stocks are listed to read about. Your mix is saved with your other plans.

### Forecast
**Savings:** start from your checking, savings and debt, add what you save each month, and pick an interest rate (APY) and the tax on it, for 1–30 years. Save up to 10 scenarios and load them back. **Investments:** a starting amount, monthly additions, 1–40 years and a yearly return (5%, 8%, 11% or your own), shown in future and in today's dollars, year by year. Growth compounds monthly so that a yearly rate compounds to exactly that rate.

### AI Analysis
Ask Claude about your finances: eight quick analyses (a monthly spending review, where to cut back, a subscription audit, a savings-rate check, a debt payoff plan, budget suggestions, a 12-month forecast and a summary) or your own question. Claude receives a text summary of your balances, income, spending by category, debts and subscriptions for the dates on screen, never your CSV files. Answers can be copied or saved as Markdown, and a cut-off answer says so. History keeps up to 50 answers in your browser; open any of them again, or export them all as Markdown. Requires your own [Anthropic API key](https://console.anthropic.com).

### Settings
Six tabs: **General** (theme and your API key), **Import** (your CSV folder, how each file is read and the import log), **Accounts** (names, display order and starting balances), **Credit cards** (balance, credit limit, APR and payment due day), **Categories** (add or delete; deleting moves a category's transactions to Other) and **Data & reset** (what's stored, clean up, JSON export and import, start over).

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
- **Key storage** — the key is stored only in your browser (localStorage + IndexedDB). It is never written to `finlens-state.json`. Versions up to 1.7.0 did save it there; v1.8.0 moves it into browser storage on load and rewrites the file without it on the next save (click **Save now** in **Settings → Import** to force it). For a personal, local-only app this is a deliberate trade-off; a multi-user deployment would proxy calls through a server holding the key in a secrets vault.
- **Prompt injection** — your financial summary is sent inside `<financial_data>` tags, and the system prompt tells Claude to treat that content as data, never as instructions (merchant descriptions come straight from bank CSVs).
- **Output rendering** — Claude's Markdown is converted with marked and sanitized with DOMPurify before it touches the page (`renderMarkdown()` in `core.js`). Scripts, event handlers and images are stripped, so injected text can't run code or exfiltrate data through image URLs. Both libraries are version-pinned with SRI hashes.

---

## Evaluation

How far can you trust the numbers in an AI Analysis answer? FinLens has a grounding eval: each of the 8 quick-analysis prompts is run 3 times on the synthetic data in `samples/`, and every dollar amount and percentage in the answers is checked against the financial summary the model was sent.

**Result** (`claude-sonnet-5-5`, v1.10.2, 24 answers, 855 dollar and percentage figures):

- **72.6% traceable to the data:**
  - **43.5%** matched the data the model was sent;
  - **29.1%** were arithmetic on that data, verified in code.
- **No math errors.**
- **23.3% unsupported.** These are mostly recommendations and benchmarks (budgets, rules of thumb), plus correct arithmetic the matcher can't verify, such as daily spending rates.
- **Complete, consistent answers.** None was cut off. Every answer gives the same monthly figures, because the summary states the dates it covers. [docs/EVAL.md](docs/EVAL.md) compares all three runs.
- **Hand check** (v1.10.0 run): of 75 random figures, every grounded and derived one checked was correct, so the matcher errs on the conservative side.

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
│   ├── checking_transactions.csv
│   ├── savings_transactions.csv
│   └── credit_card_transactions.csv
├── samples/              ← Synthetic CSVs (fake data) for trying the app and the AI eval
│   ├── checking_sample.csv
│   ├── savings_sample.csv
│   └── credit_card_sample.csv
├── docs/
│   ├── EVAL.md           ← AI Analysis grounding eval: method, results, and a table comparing runs
│   ├── eval-results.json ← Raw answers and per-figure classifications from that run
│   └── eval-runs/        ← Earlier runs, one folder per version (EVAL.md + eval-results.json)
└── js/
    ├── core.js           ← State, helpers, CSV parsing, bank schema registry
    ├── aggregation.js    ← Pure data aggregation: sums, groupings, recurring detection
    ├── db.js             ← IndexedDB layer (finlens_db)
    ├── migrate.js        ← Rewrites data saved by older versions (account codes, v1.12.0)
    ├── ui.js             ← View engine, drawer, chart helpers, CRUD
    ├── views-main.js     ← Overview, Transactions, Income, Bills, Spending, Transfers
    ├── views-plan.js     ← Budget, Savings buckets, Debt tracker, Trends
    ├── views-invest.js   ← Investing ideas + the Forecast → Investments tab
    ├── views-forecast.js ← Forecast (Savings and Investments tabs)
    ├── views-ai.js       ← AI Analysis (Claude integration)
    ├── views-data.js     ← Settings tabs Import, Accounts, Credit cards, Categories; sample data; Import Logs
    ├── views-settings.js ← Settings shell + General tab (display, API key)
    ├── views-cleanup.js  ← Settings → Data & reset (clean up data, export/import JSON, start over)
    ├── views-db.js       ← DB Inspector, DB Schema diagram, Changelog views
    ├── views-eval.js     ← AI Eval: grounding eval for AI Analysis (developer view)
    └── init.js           ← App boot and event wiring
```

**Zero dependencies.** No npm, no bundler, no build step. Vanilla ES2020+ JavaScript with Chart.js, PapaParse, Day.js, marked.js, and DOMPurify loaded from CDN.

---

## Tips

**Refreshing data** — FinLens auto-reloads your CSVs on page refresh if it still has permission to the folder you picked. You can also click **Reload CSVs** in **Settings → Import** to force a re-read.

**Category rules** — go to **Transactions → Spending → Category rules** to teach FinLens your merchants. Rules apply across all future imports. Your category list is managed under **Settings → Categories**.

**Multiple credit cards** — load as many credit card CSV files as you want. Each gets its own account card and can be filtered independently.

**Cleaning up or starting over** — **Settings → Data & reset** shows what FinLens has stored and lets you (each button asks for a second click):
- **Clean up imported data:** clear imported transactions, the import log or your transaction edits.
- **Rebuild from your CSV folder:** fixes a messy database without touching your plans.
- **Clear individual plans:** budgets, bills, buckets, debts, forecast scenarios, the investment mix or AI history.
- **Disconnect the folder.**
- **Export or import JSON:** your plans, edits, balances, categories and AI history in one file (no transactions, no API key).
- **Start over from scratch:** type `RESET` to erase everything and reload. Your backup file is either kept as `finlens-state-backup-DDMMYYYY.json` or deleted, your choice. Your CSV files are never touched.

**Exporting** — the Transactions screen has an **Export CSV** button: it exports every transaction in the current date range and accounts. AI answers can be saved as Markdown from the AI Analysis tab, one at a time or the whole history.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full release history.

---

*FinLens v1.16.4 — Built for one person's finances, designed to be useful for anyone's.*
