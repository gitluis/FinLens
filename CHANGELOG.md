# FinLens Changelog

All notable changes to the FinLens personal finance dashboard are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.16.3] — 2026-11-02

### Fixed
- **Importing some of your CSV files lost the other loaded transactions at the next boot.**
  - **When:** Choose CSV files (on the Welcome or in Settings → Import) with only some of your files, e.g. just the card's, while other accounts were loaded. Also Reload CSVs when the folder no longer holds all of an account's rows: a newer export that starts where the last one ended, or an old CSV moved out of the folder.
  - **Cause:** `loadFiles()` replaced every loaded transaction with the imported files' ones. On the samples, importing only the card file left 165 of 257. IndexedDB kept all 257 (`DB.importTransactions()` only adds rows), but the autosave wrote 165 to `finlens-state.json`, and boot loads that file first. The other accounts' transactions, with their edits, were gone from every screen, and card payments lost their pair with the checking autopay. The bug was already on `master`.
  - **Fix:** an import adds the files' new transactions, replaces the ones it already has (same id) with the file's, and keeps every other loaded transaction, as IndexedDB does (`mergeImported()`). A leftover duplicate copy goes from memory as it goes from the store. Kept transfers go back to their CSV type and category first (`undoTransferDetection()`), so detection pairs them exactly as in a full import.
  - **Unchanged:** importing your own files still replaces the sample data. A folder reload still replaces the folder's rows with the files' new copies; it no longer drops rows the folder doesn't have. Rebuild from your folder is still the way to make FinLens match the folder exactly.
  - **Older files:** a kept transfer loaded from a `finlens-state.json` written by v1.16.0 or earlier doesn't record its CSV type and category. Its IndexedDB row gives them. Without a row, the type goes back to debit or credit by its sign and the category is worked out from its description, then detection pairs it again.

### Docs
- **CLAUDE.md:** §4.5 an import never drops loaded transactions; §8 `loadFiles()` merges, `mergeImported()`, `undoTransferDetection()`; §10 memory follows the same re-upload rules as IndexedDB; §11 kept transfers are detected again.

---

## [1.16.2] — 2026-11-02

### Fixed
- **Rebuild from your folder cleared everything when the folder had no CSV FinLens could read.**
  - **When:** Settings → Data & reset → Rebuild from your folder, with a connected folder that holds no CSV (only `finlens-state.json`), only CSVs FinLens can't read, or a CSV the browser can't open.
  - **Cause:** `DataCleanup.rebuildFromFolder()` cleared the transactions, accounts and import log (memory and IndexedDB) before reading the folder. With nothing to import, 0 transactions were left, and `_finish()` wrote that to `finlens-state.json`, which boot loads first. Two related cases: with one CSV unreadable among several, the rebuild went ahead without it, so that account's transactions were gone; a CSV the browser couldn't open stopped the rebuild after the clear ("Something went wrong"). The bug was already on `master`.
  - **Fix:** the rebuild reads and checks every CSV first. It clears and re-imports only when at least one transaction was read and every file it would import could be read (`_rebuildBlockers()`). Otherwise nothing changes, and the tab says why: the folder has no CSV, or which file couldn't be read and why. A CSV in a format FinLens doesn't read, and never imported, is skipped as every import skips it, and the message names it.
- **Reload CSVs, picking or reconnecting a folder, and Choose CSV files emptied the loaded transactions when no file could be read.**
  - **Cause:** `loadFiles()` emptied `State.transactions` before parsing. When no file gave a transaction, none were left in memory, and the autosave wrote that to `finlens-state.json`. IndexedDB still held them, but the state file wins at boot. A folder with no CSV at all was already safe: Reload stopped with an alert. The bug was already on `master`.
  - **Fix:** `loadFiles()` reads every file first and changes nothing unless at least one transaction was read: not memory, browser storage, IndexedDB, the sample data or the import pause. `parseCsvFile()` now only reads; `importParsedCsv()` imports. An alert names each file and why. Chosen files stay listed, so their Read as can be changed and tried again.
- **Smaller fixes in the same code:**
  - **A CSV the browser can't open** (another program has it locked) is reported with the others. Before, it stopped the whole reload.
  - **A file with no readable row** no longer creates an empty account.
  - **A failing IndexedDB write during an import** is logged and the import carries on, so the transactions still reach memory and the state file. Before, that file's import never finished, and Rebuild stayed on "Working…".
  - **Settings → Import → Last import** lists the files that weren't imported, with the reason. After Reload CSVs it now shows that reload right away; before, it showed the previous import until the next render.

### Docs
- **CLAUDE.md:** §8 `loadFiles()` options and result, `parseCsvFile()`, `importParsedCsv()`, `importProblemText()`; §20 Rebuild from your folder reads before it clears, and an import that reads nothing changes nothing.

---

## [1.16.1] — 2026-11-02

### Fixed
- **Clear transaction edits wiped every transaction when the browser database didn't hold them.**
  - **When:** FinLens had restored the transactions from `finlens-state.json` in a browser whose IndexedDB didn't have them (a new browser, or cleared site data). Its `transactions` store was empty, or held only some of them.
  - **Cause:** `DataCleanup.clearEdits()` replaced the loaded transactions with the store's rows (`DB._getAllTransactions()` → `reconstituteTx(row, {})`). With an empty store, none were left. With a folder connected, `_finish()` then wrote the empty list to `finlens-state.json`. The next boot re-imported the folder's CSVs, so only transactions still in a CSV there came back. With a partial store, only the stored ones were kept, and rows memory didn't have were added. The bug was already on `master`.
  - **Fix:** each loaded transaction is rebuilt without its edit, from the transaction itself (`_unedited()` in `views-cleanup.js`): its original description, category and type, no notes or plan link, and flags from the transaction rules. Transfers are then detected again. No transaction is dropped or added, and the state file gets all of them. The `transactions` store isn't written: filling an empty one is an import's job, and the state file holds every transaction.
  - **Transactions now keep their CSV category and type.** `mkTx()` records `_originalCategories` and `_originalType`. `reconstituteTx()` carries them, `DB.loadAll()` takes them from the row, and `finlens-state.json` saves them. Before, an edit or transfer detection overwrote them, so nothing in memory could undo an edit.
  - **Older files:** a transaction loaded from a `finlens-state.json` written by v1.16.0 or earlier, with no row in this browser, has no recorded category and type. If they were edited, or it was a transfer, they're worked out again from the description and amount, as an import does for checking and savings. A card's own Category column and Payment/Return type can't be recovered this way; Rebuild from your folder brings them back.
  - **No IndexedDB:** without a database, the action only deleted the edit records, and the screen kept showing the edits until a reload. Now the values go back right away.
- **An import while edits existed saved the edits into IndexedDB.** `DB.importTransactions()` stored the category, type and flags that `mkTx()` showed, edits included. That happens on Rebuild from your folder, or when importing again after Clear transactions. Clear transaction edits then brought the edits back, and so did every boot from IndexedDB. The row now holds the CSV's values. Rows stored that way before keep the edits until Rebuild from your folder rewrites them.

### Docs
- **CLAUDE.md:** §4.2 the two new fields and what a transaction keeps of its CSV row; §4.5 IndexedDB may not hold the loaded transactions; §10 a stored row holds the CSV's values; §20 Clear transaction edits.

---

## [1.16.0] — 2026-11-02

### Insights, Settings and the Welcome — Clarity redesign, part 4
Trends, AI Analysis, the six Settings tabs and the first-run Welcome now match the Clarity mockups. This is the last part of the redesign. Every number is computed from your data; none come from the mockups. The mockups name banks; the app still names none.

- **Shared:** each screen opens with its note in the `.page-actions` row; panels, KPI tiles, rows, pills and the drawer reuse the Finances and Plan classes, plus a few new ones in `index.html`. Charts are inline SVG or plain boxes with a text description (`role="img"`); Trends no longer uses Chart.js.
- **The date range label is hidden on Trends and Settings** (`NO_RANGE_VIEWS` in `ui.js`), as on the Plan screens. Neither uses the range.
- **Settings and the Welcome are 1000px wide,** as in the mockups (`body[data-view]`, set by `showView()`).
- **Phones:** grids fold to one column; nothing scrolls sideways at 390px. The **☰** button turns into **×** ("Close menu") while the menu is open, as in the phone mockup.

### Trends
Always your latest six months with data, across every account. It ignores the date range and the accounts filter, as before.
- **KPIs:** average saved a month (income minus spending), savings rate (the average of the monthly rates), fastest-growing category (the biggest rise in the latest month, among categories with at least $25 the month before) and steadiest month (lowest spending; an unfinished latest month doesn't count).
- **Income, spending and savings:** three bars a month, with what you saved under each month.
- **Savings rate:** each month's rate and a dashed 3-month average, with a note written from the numbers: the best and worst months, the category that pulled the worst one down, and where the latest month stands.
- **Account balances:** a sparkline per account, how it moved ("Up about $426 a month", "Swings between …", "Paid down around the 6th") and its balance (`balanceAt()`, as the Overview cards).
- **Top categories over time:** the top 6 categories × 6 months as shaded tiles (darker = that category's most expensive months) and 6-month totals.
- **Dropped to match the mockup:** income month-over-month, income stability, the current month's savings rate, the this-month-vs-last category table, the rolling-spending and savings-rate Chart.js charts, most visited merchants and the auto-generated insights (`generateInsights()` removed).

### AI Analysis
- **Layout:** Quick analyses and History on the left; Ask your own question and the answer on the right. A pill says whether a key is saved.
- **Quick analyses** use the mockup's labels. Each sends one of the existing `AI_PROMPTS` questions, unchanged (`AI_QUICK` maps them), so the request is exactly what the eval measures. The label shown and kept in history is the new one.
- **Ask your own question:** Ask is disabled until you type; Ctrl/⌘+Enter asks. A note says what Claude gets (a summary for the dates it covers, never your CSV files).
- **The answer** is an `aria-live="polite"` region: "Claude is reading your summary…" while waiting (`aria-busy`), then "You asked", Copy, Save as Markdown, the answer and "Answered just now · model". The cut-off warning now sits above the answer; the no-answer message is unchanged in substance.
- **History:** every saved answer (up to 50), newest first, "N of 50 kept"; cut-off answers are marked. Clicking one shows it again (nothing is sent). **Export history as Markdown** downloads all of them. New answers also store the model that wrote them.
- **No key:** the screen says so first and links to Settings → General; history stays readable.
- **Unchanged (the published eval depends on them):** `AI_MODEL`, `AI_MAX_TOKENS`, `AI_PROMPTS`, the system prompt, `buildFinancialSummary()`, the `<financial_data>` wrapping and the one request path (`send()` inside `callClaude()`, raw mode included). The test suite checks that each quick analysis and a custom question send a request byte-identical to v1.15.0's.
- **Left out of the mockup:** "Unusual transactions". The summary sent to Claude has no single transactions, so it couldn't be answered without changing the request. "Summarize my finances" takes its place, so all eight eval prompts stay reachable.
- **Dropped:** the alert-based copy confirmation (an inline status replaces it).

### Settings
- **Tabs** in the mockup's words (General · Import · Accounts · Credit cards · Categories · Data & reset), with `role="tab"`; arrow keys, Home and End move between them, as on Forecast. On a phone the tab bar scrolls sideways, and each render brings the selected tab into view.
- **General:** Display (theme: Light / Dark / Match system, arrow keys move the choice; version) and the API key (Save key, Remove with a second click instead of `confirm()`). **Dropped:** the currency menu (it saved a value nothing used), the transactions-loaded line and the pointer card to Data & Reset.
- **Import:** the folder card (name, access, CSVs last read, backup last saved, auto-save; Save now, Reload CSVs, Change folder, or Reconnect when access lapsed, or Pick a folder / Choose CSV files with none), files waiting for "Read as" (kept), the last import's results (kept), **Files in the folder** (how each file is read, rows, dates; changing "Read as" saves the choice for the next reload), the **Import log** (always shown, one line per import) and the Safari / Firefox card. **Dropped:** the per-file rename list (renaming is on Accounts), "Add individual CSV files" (the Safari / Firefox card does it) and **Add Manual Account** (its accounts were never saved, so they vanished on reload).
- **Accounts:** one row per account: ▲▼ order, display name, the starting balance (bank accounts; labelled with the day before the first row) or the balance owed (cards), rows and dates. Each field saves when you leave it. An old current-balance override on a bank account is shown with a button to drop it. **Dropped:** the two tables and the Save button.
- **Credit cards:** per card: current balance, credit limit, **APR** and **payment due day** (new), and how much of the limit is used, which follows what you type. A debt in the Debt tracker linked to the card shares its APR and due day; a new debt started from the card takes them.
- **Categories:** chips with each category's transaction count (your list plus categories your transactions use), Add category, and a link to the rules on Spending. **Deleting a category now moves its transactions to Other** (saved as transaction edits) and points its rules at Other; before, it only took the name off the list. Other, Transfer in and Transfer out can't be deleted.
- **Data & reset:** What FinLens has stored (database counts, settings, the folder), **Clean up** (every action as a row: click, then "Click again to confirm", then "Cleared"), **Export and import** (JSON; these buttons are new — the functions existed but nothing on screen called them) and **Start over** (type RESET). **Kept:** every action, including forecast scenarios and the investment mix, which the mockup predates.

### Welcome (first run)
- **With no transactions, the Overview is the Welcome:** "Your money in one view, on your own computer", Pick your CSV folder, Try it with sample data, choose the files, three steps and three notes. The headline is the shell's title (`shellHero()`), so there is still one H1.
- **On a true first run** (nothing saved at all) the app bar shows only the brand, as in the mockup. With a folder, plans, AI history or a key saved, it keeps its menus.
- **The buttons use the existing import paths** from their click: `pickDataFolder()` (or `reloadDataFiles()` when a folder is already connected), and the `#filePick` file picker.
- **Try it with sample data** imports the three files in `samples/` through the normal import: fetched over HTTP, or from a file picker when FinLens is opened as a file. A banner says it's sample data, with **Use my own files**. Importing your own files replaces the samples instead of mixing them into the same accounts (`loadFiles(…, { sample })`).
- **Dropped:** the old "Welcome to FinLens 👋" card and its "Go to Data Tab" button.

### Technical
- **New stored data:**
  - `State.cardDetails` `{ [cardAccountId]: { apr, dueDay } }`: localStorage, IndexedDB `app_state` (`DB.loadAll()`), `finlens-state.json`, JSON export and import. Kept by Clear transactions (like balances); Start over erases it.
  - `State.sampleData` (boolean): the same places except the JSON export. Cleared by importing your own files, Clear transactions and accounts, Use my own files, and Start over.
  - Inside existing records: AI history entries get `model`.
- **`ui.js`:** `shellHero()`, `NO_RANGE_VIEWS`, `body[data-view]` and `first-run`; `editDebt()` pre-fills APR and due day from `cardDetails`; the drawer note says "Credit cards".
- **`views-data.js`:** `loadSampleData()`, `handleSamplePick()`, `setAccountName()`, `setAccountMoney()`, `setCardDetail()`, `deleteCategory(name)`, `addCategory(name)`, `renderImportLogList()`; `moveAccount()` works from the order shown. `renderImportLog()` and the Import Logs view are unchanged, so #18 still applies.
- **`views-cleanup.js`:** `DataCleanup.clearSampleData()`, `PLAN_ROWS`, `lastDone`.
- **Tokens:** `--t0`…`--t5`, `--t-ink`, `--t-ink-hi` (Trends tiles; `--t4` is a little darker than the mockup's so white text reaches 4.5:1) and `--border-dash`, light and dark.
- **Removed CSS** no longer used: the old AI panel, file list, account group and pending-file row, `.kbd`.

### Docs
- **README** — getting started with the Welcome and sample data; Trends, AI Analysis and Settings as they are now.
- **CLAUDE.md** — §1 version; §3 file roles; §4.1 `cardDetails`, `sampleData`; §6 new tokens and components; §7 Trends charts; §8 `loadFiles()` option; §9 shell helpers; §12 Settings tabs, the Welcome, page titles; §13 the AI tab's quick analyses and history; §20 the new fields and Use my own files; §21 quick analyses vs `AI_PROMPTS`.

---

## [1.15.0] — 2026-11-02

### Plan screens — Clarity redesign, part 3
Budget, Buckets, Debt, Investments and Forecast (the screens under **Plan**) now match the Clarity mockups. Every number is computed from your data and your plans; none come from the mockups.

- **Shared:** each screen opens with a note and its buttons in the `.page-actions` row. KPI tiles, panels, callouts, meters and bar charts reuse the Finances classes or new Clarity classes in `index.html`; the charts are plain boxes colored by theme tokens, each with a text description for screen readers. Forms open in the side drawer with Save, Cancel and Delete (click twice) pinned at the bottom. No `confirm()` or `alert()` dialogs are left on these screens.
- **The date range label is hidden on the five Plan screens.** None of them use it; Budget has its own month.
- **Titles:** Budget, Savings buckets, Debt tracker, Investing ideas, Forecast.
- **Phones:** grids fold to one column, and wide tables move their secondary columns under the first one below 600px. Nothing scrolls sideways at 390px.

### Budget
- **Month switcher** (‹ October 2026 ›) with how far the data runs ("Data through Oct 20"). It opens on the latest month with transactions.
- **Alerts:** one per category over its budget (red) or at 90–99% (amber).
- **KPIs:** budgeted, spent (share of budget), left to spend (days to go, or "October has ended"), over budget (and how many are close).
- **Budget by category:** progress, spent, budget, left. The pencil edits the amount in the row (Enter or ✓ saves, Escape cancels). The name opens the drawer for the name, the categories (chips) and Delete.
- **Budget vs. actual, month by month:** 6 months of spending in budgeted categories against the total budget (dashed line). Months over budget are red; an unfinished month is lighter and labelled "so far".
- **Use starter budget** now builds one from your spending: a budget per category, the average of up to 3 recent complete months, rounded up to $10 (`starterBudgetList()`). It only adds categories no budget covers yet, so it never replaces yours. Without transactions it adds the old suggested set.
- **Dropped to match the mockup:** the three old KPI cards, the single over/near-limit banner, per-budget colors and the color picker, and the stacked Chart.js history by budget.

### Savings buckets
- **+ New bucket** opens an inline form: name, target, saved so far, months to goal, with "That's $X a month" as you type.
- **KPIs:** saved in buckets, total of targets (share reached), needed each month to hit every date, unassigned savings (savings balance minus the buckets).
- **Savings pace:** "You've moved about $488 a month into savings since May. These goals need $X a month…", using the same number as Transfers → Saved to savings (`savingsPace()`).
- **Bucket cards:** icon, name, "By Jun 2027 · 7 months left", saved of target, a progress bar, % saved, amount to go, and what it needs a month (`bucketPlan()`: what's left ÷ calendar months to the date).
- **Edit drawer:** name, target, saved, target date, an icon (9) and a color (8), the transactions linked to the bucket, Delete.
- **Dropped to match the mockup:** the old KPI cards, the "Your Buckets" header card, the bucket detail drawer (its linked transactions are now in the edit drawer), emoji icons, the hex color picker and the days-left countdown.

### Debt tracker
- **KPIs:** total debt, minimum payments (share of take-home pay), average APR weighted by balance, card utilization.
- **Your debts:** balance, APR (20% and up in red), minimum, credit limit with a usage bar, edit. A debt can take its balance from a **credit card in your CSVs** ("Credit card · from your CSV"): the drawer's **Balance from** picks the card, its balance updates with each import, and its credit limit is the card account's limit (the same one the Overview uses). With no debts, the screen offers to add each card from your CSVs.
- **Payoff plan:** an **Extra each month** slider ($0–$1,500, $25 steps) and three plans: **Avalanche** (highest APR first), **Snowball** (smallest balance first) and **Minimums only**, each with its debt-free month, interest paid and how long it takes. "Least interest" marks the cheaper of avalanche and snowball. A summary compares the chosen extra with paying only the minimums. The chosen plan shows its total balance by month, the payoff order with dates, and the first 6 months (paid, interest, remaining).
- **The plan and the extra amount are saved** (`State.debtPlan`); before, they reset on every page load.
- **New payoff math** (`payoffPlan()` in `aggregation.js`): interest is added monthly at APR ÷ 12, every minimum is paid, then the extra and the minimums of debts already paid off go to one debt at a time, re-ordered each month. Minimums only moves nothing on. It stops at 50 years and says so. The old `simulatePayoff()` (extra to the first debt only, no rollover) is kept unchanged but no longer used.
- **Dropped to match the mockup:** the Type and Due columns (both are in the drawer), the avalanche/snowball toggle, the extra-payment number box, the Months to Debt-Free / Total Interest / Focus Order cards and the 24-month table.

### Investing ideas
- **My mix:** the share assigned ("100% assigned" or "85% of 100%"), a stacked bar, each fund's %, the stocks / bonds / real estate split, and **Project this mix in Forecast →** (opens Forecast → Investments).
- **Index funds and ETFs:** 9 funds (VOO and AVUV added) with what they hold, risk (Lower / Medium / Higher), the balanced preset's % and **My %**. Typing updates the mix at once; the value is saved when you leave the field.
- **Individual stocks to read about:** 6 reference cards (AAPL, MSFT, BRK.B, JNJ, PG, COST), with no % inputs. A stock % saved before still counts in the mix.
- **Clear my %** and **Use the balanced preset** (40/20/20/10/5/5, as before).
- **The "not financial advice" note stays,** reworded as in the mockup.
- **Dropped to match the mockup:** the surplus, emergency-fund and investable-cash cards, the personalized starter allocation, the recommended portfolio table and both doughnut charts, the rationale / category / suggested columns, the blue-chip stock table with % inputs (GOOGL, AMZN and NVDA are gone from the list), the portfolio summary table and the Ask Claude card.

### Forecast
- **Savings / Investments** are real tabs (`role="tab"`, arrow keys move between them).
- **Savings:** checking, savings and debt start from your accounts and debts; saved each month starts from your savings pace; interest (APY) and tax on interest; 1–30 years. It shows projected savings, what's left after today's debt and interest earned, with yearly bars of what you put in and interest after tax. **Reset** goes back to your balances.
- **Saved scenarios** (up to 10): save, load (click the name) and delete (×). Scenarios saved by the old simulator still list, as their monthly net with no interest.
- **Investments:** starting amount, added each month, 1–40 years, Conservative 5% / Moderate 8% / Aggressive 11% / Custom, today's dollars on or off, inflation. Projected value, value in today's dollars and what you put in; bars and a year-by-year table.
- **Compounding is now exact for a yearly rate:** the monthly rate is (1 + yearly)^(1/12) − 1, so 8% a year gives 8% a year. Before, the investment forecast used yearly ÷ 12, which compounds to 8.30%. Savings use the same rule for the APY after tax.
- **Dropped to match the mockup:** the old savings simulator (separate checking / savings / debt lines, income, expense, transfer, extra debt payment and debt APR inputs, a 3–36 month horizon, one-off events, Run Simulation, the month-by-month table), the Load scenario menu and the name prompt, and the investment forecast's line chart, summary sentence and gains column.

### Technical
- **`aggregation.js`:** `budgetSpent()`, `starterBudgetList()`, `bucketPlan()`, `savingsPace()`, `debtLinked()`, `debtIsCard()`, `debtBalance()`, `debtLimit()`, `payoffPlan()`, `monthlyRateFromYearly()`, `growthByYear()`.
- **`ui.js`:** new budget, bucket and debt drawers (`editBudget/editBucket/editDebt`, `_armTwoClick()` for Delete), `setBudgetLimit()`, `starterBudgetsToAdd()`, `addBucket()`, bucket icons and hues, `debtCardChoices()`, `setPayoffStrategy()` / `setPayoffExtra()`. `deleteBudget/Bucket/Debt()` no longer ask with `confirm()`. `SUGGESTED_BUDGETS` lost its hex colors.
- **New stored data:**
  - `State.debtPlan` `{ strategy, extra }`: localStorage, IndexedDB `app_state` (`DB.loadAll()`), `finlens-state.json`, JSON export and import. **Clear debts** resets it; Start over erases it.
  - Inside existing records: bucket `icon` (a key) and `hue`; debt `account`; scenarios `{ name, kind:'savings', inputs }`.
- **Data & Reset:** new **Forecast scenarios** and **Investment mix** rows; **Clear debts** also resets the payoff plan.
- **AI summary:** a debt linked to a card reports the card's current balance (`debtBalance()`). For other debts the summary is unchanged (compared before and after on the samples, with and without debts).
- **Tokens:** `--teal-text` (light and dark).

### Docs
- **README** — the five Plan screens as they are now.
- **CLAUDE.md** — §3 file roles; §4.1 `debtPlan`, Budget / Bucket / Debt / Scenario shapes; §6 Plan components and `--teal-text`; §7 Plan charts; §8 new helpers; §9 plan form helpers; §12 titles, Forecast tabs, range label; §13 debt balances in the summary; §20 new Data & Reset rows.

---

## [1.14.0] — 2026-11-02

### Finances screens — Clarity redesign, part 2
Overview, Transactions and the screens behind its filter pills (Income, Spending, Bills, Transfers) now match the Clarity mockups. Every number is computed from your data; none come from the mockups.

- **Shared:** a note and the screen's buttons sit in one row under the page title (`.page-actions`). KPI tiles, panels, tags and lists use new Clarity classes in `index.html` instead of inline styles. Charts on these screens are inline SVG or plain boxes colored by theme tokens, each with a text description for screen readers.
- **Filter pills:** All · Income · Spending · Bills · Payments · Transfers on all five screens. All and Payments filter the list; the other four open their own screens (`income`, `spending`, `bills`, `transfers`, as before). The app bar keeps **Transactions** underlined on all of them (`TX_VIEWS` in `ui.js`). Screen titles: Income, Spending, Bills & subscriptions, Transfers.
- **Phones:** grids fold to one or two columns, wide tables hide secondary columns below 600px, and the transfer diagram stacks. No screen scrolls sideways at 390px.

### Overview
- **Net worth** with a trend chart: **1M** (daily), **3M** (weekly) or **All** (month ends). A pill shows the change since the end of last month.
- **Latest month:** money in, money out, net, the savings rate as a bar, and the average rate over up to 6 months. It says how far the data runs ("Data runs through Oct 20").
- **Account cards:** an icon, the number of transactions, a balance sparkline for bank accounts, and for a card how much of its limit is used ("No credit limit set · Add one" without one) and whether it's on autopay. Footnotes say where the balance comes from, or how much savings is assigned to buckets.
- **Cash flow:** 6 months of money in and out as bars, with the net under each month.
- **Upcoming bills:** bills due in the next 3 weeks, plus any overdue, with a "Due today" pill. With no bills yet, it shows the recurring charges FinLens spotted, marked as not confirmed.
- **Largest card purchases** of the latest month.
- **Kept:** double-click an account name to rename it (Enter on a focused name works too). **Added:** Reload CSVs and Ask AI about this buttons.
- **Dropped to match the mockup:** the four KPI cards (Total Cash, Total Debt, Net Worth, Cash Flow), the income/spending/transfers bar chart, Recent Transactions, and the Top Spending Category, Most Frequent Merchant and Top Income Source cards.

### Transactions
- **KPIs:** transactions, money in, money out, net. On **Payments**: card payments, total paid, average payment, card balance now.
- **Payments** now lists payments to your credit cards, including the card side of an autopay transfer (`isCardPayment()`). Before, those became transfers when they were paired, so the pill showed nothing for the samples.
- **List:** search with an icon, Category, **Sort** (newest, oldest, largest, smallest, description A–Z), the amount filter, a Flags column (Bill, Recurring, Sub) and a numbered pager. On phones the category, account and flags move under the description.
- **Transaction detail drawer:** amount, date, account and original description at the top; Description; Category and Type side by side; flags as chips; notes; Save and Cancel pinned at the bottom. Type now offers **Card payment**, so saving a payment no longer turns it into an expense.
- **Kept:** bulk select and bulk edit, extra categories (under "Also count it under other categories"), the budget/bucket/debt link, Export CSV, transaction rules.
- **Transaction rules:** one row per keyword with its flags and how many transactions match. A Transaction rules button jumps to them.
- **Dropped to match the mockup:** the Type column, sorting by clicking column headers (the Sort menu replaces it), and the "Re-apply rules" button (rules apply when added or removed, and on every import).

### Income
- **KPIs:** total income, average per month (over the period in months), interest earned, returns and refunds.
- **Income by source** as a stacked bar and list, **monthly income** bars with the unfinished month shaded lighter, **recurring deposits** with frequency, count, last, next expected and confidence (`recurringDepositsDetail()`), and **all deposits** (6, then Show all).
- **Dropped to match the mockup:** the by-category donut.

### Spending
- **KPIs:** total spent, average per day, top category, highest month (and how far above average).
- **By category:** a ranked list of buttons; picking one fills the **drill-down** panel next to it. "Open in Transactions" opens the list filtered to that category.
- **Daily spending** heatmap for the period (was the last 365 days), shaded by quartile so rent days don't wash out the rest. **Monthly trend** line with the highest month labelled and an unfinished month drawn hollow, plus a note on which category pushed the highest month up.
- **Top merchants** (7) with category and visits. **Category rules** with Add rule and Re-categorize all.
- **Dropped to match the mockup:** the two Chart.js category charts and the transaction count KPI.

### Bills
- **+ Add bill** opens an inline form: name, amount, due day, repeats, pays from.
- **KPIs:** bills tracked, cost per month (and its share of average monthly income), due in the next 7 days, subscriptions per month and per year.
- **Spotted recurring charges:** each with its rhythm ("Monthly, around the 18th"), number of charges, account, amount and a confidence bar. **Confirm as bill**, **Dismiss**, and **Undo** after dismissing.
- **Month calendar** with each bill on its due days; Hide / Show calendar.
- **Your bills:** repeats, next due, **pays from**, **last paid** (found in your transactions), status (Overdue, Due today, This week, Upcoming, Paid, Just added) and an edit button. The edit drawer has every field, plus Paid and Delete (click twice).
- **Next due moves on by itself:** a repeat that a payment already covers counts as paid (`billNextDue()`).
- **Fixed with the new edit button:** saving an edited bill used to add a copy.
- **Dropped to match the mockup:** the "Bills, Utilities & Subscriptions (All Time)" transaction table, the old KPI cards, and the Paid checkbox and × in each row (both are in the edit drawer now).

### Transfers
- **KPIs:** transfers (paired / one-sided), between your accounts, sent outside FinLens (named by the keyword that matched, e.g. "Zelle · 6 payments"), saved to savings (and about how much a month).
- **Where money moved:** a From box per account with an arrow to each destination: amount, count and rhythm ("Monthly transfer, around the 3rd", "Autopay, around the 6th"), and a dashed box for money that left FinLens.
- **List:** From and To filters (including Outside FinLens), Paired / Keyword match, 10 rows then Show all. A row still opens the transfer drawer.
- **Transfer keywords:** removable chips and Add keyword (Enter works). Every change re-runs transfer detection; the separate Re-apply button and its alert are gone.
- **Dropped to match the mockup:** Most Frequent Path and Avg per Transfer, the description column and sortable headers.

### Technical
- **`aggregation.js`:** new `balanceAt()`, `dataSpan()`, `monthlyFlow()`, `isCardPayment()`, `transferPairs()`, `recurringDepositsDetail()`, and bill helpers (`BILL_FREQS`, `billNextDue()`, `billLastPaid()`, `billDatesBetween()` …). `detectRecurring()` and `detectRecurringDeposits()` now use `recurringKey()` / `depositKey()`; their output is unchanged, and so is the AI summary (compared before and after on the samples).
- **`ui.js`:** `openDrawer(html, { title, footer })` with a scrim, a pinned footer and focus that returns to the opener; older forms that start with an `<h3>` keep working. `svgLineChart()`, `sparkSvg()`, `dailyHeatmapHtml()`, `fmtSigned()`, `fmtShort()`, `acctName()`. `renderHeatmap()`, `renderUpcomingCal()`, `renderTransferFlow()` and `drawSpark()` are removed. `confirmRecurring(r)` takes the detected charge; `undoDismissRecurring()` is new.
- **Bills carry three optional fields:** `account` (pays from), `subscription` and `recurringKey` (the charge it was confirmed from). They live inside `State.bills`, so they're saved to `finlens-state.json`, IndexedDB and exports with it, and cleared with it. No new top-level State keys.
- **Data & Reset → Clear bills** also clears which spotted charges you confirmed or dismissed (`recurringConfirmed`), so they show up again. Start over clears both, as before.
- **Tokens:** `--track`, `--accent-dim`, `--card-soft`, `--card-border` (light and dark). `[hidden]` always hides.

### Docs
- **README** — the six screens described as they are now; Transactions pills; what Export CSV exports.
- **CLAUDE.md** — §4.1 Bill shape; §6 tokens and Finances components; §7 inline SVG charts; §8 and §9 new and removed helpers; §11 keyword changes re-run detection, card payments; §12 page actions and the Transactions pills; §20 Clear bills.

---

## [1.13.0] — 2026-11-01

### App shell — Clarity redesign, part 1 (shell and visual system)
- **One-row app bar replaces the sidebar.** Left to right: FinLens · Overview · Transactions · **Plan ▾** · Trends · AI Analysis, then the sync badge, the date and account pickers and the Settings gear.
  - **Plan menu:** Budget, Buckets, Debt, Investments and Forecast, each with a one-line description. Plan stays underlined on all five screens, and the menu marks the one you're on.
  - **Closing menus:** a click outside, Escape (focus goes back to the button) or picking an item closes them.
- **Date range and accounts are icon buttons with popovers.** They replace the two dropdowns in the old top bar.
  - **Dot on the icon:** shows when the range isn't the default (This month), or when not every account is included. The tooltip names the current choice.
  - **Accounts can be combined:** pick any mix with checkboxes. The last checked account can't be unchecked. `inAccount()` already supported several accounts.
  - **Custom range** opens From / To fields inside the popover.
- **Sync badge — "Synced" / "Not synced".** Green while `finlens-state.json` in the connected folder is up to date. Amber when no folder is connected, access lapsed, or the last save failed. The tooltip says which (`updateSyncBadge()` in `views-data.js`).
  - **Click:** reconnects when access lapsed (the click allows the permission prompt). Otherwise it opens Settings → Import.
  - **Only a stored folder handle counts as connected** (`State._folderLinked`). A folder chosen with the Safari/Firefox file picker has a name but nothing is ever written back to it, so it stays "Not synced".
- **Phone and narrow windows:** below 1000px the nav moves into a **☰ menu**, grouped like the desktop (Plan section, then Trends, AI Analysis and Settings). Below 720px the gear moves into the menu too. The old sidebar turned into a horizontal strip.
- **Page title row:** each screen opens with its title and the active range, which the old top bar used to show. The version string moved to a small footer.

### Theme
- **Choose the theme in Settings → General → Display:** Light (default), Dark or **Match system** (follows the OS, live). The ◐ button in the top bar is gone. `State.theme` accepts `'system'`; `setTheme()` and `resolvedTheme()` are in `ui.js`.

### Visual system
- **Clarity tokens (CLAUDE.md §6).** Indigo accent, Inter type, white cards with 16px corners and no shadow, and quieter borders. Status colors come in soft/strong pairs. Light and dark sets are defined side by side.
  - **Contrast:** every text token reaches 4.5:1 on every surface in both themes. `--text-3` is `#5d6a7e` (the mockup's `#64748b` is 4.44:1 on the page background).
  - **Dark buttons:** they use a lighter indigo with dark text, because white on it would fail AA.
- **Old token names still work.** `--teal`, `--amber`, `--red`, `--blue` and `--purple` are aliases, so existing inline styles keep working. The sidebar tokens are removed.
- **Components restyled:** buttons, pills, chips, tables, inputs, progress bars, callouts, drawer, heatmap and calendar.
  - **Callouts** are tinted boxes instead of the left-border gradient.
  - **Chips** use soft tints that stay readable in dark mode.
  - **Negative amounts** use the body text color; positives stay green.
- **Charts follow the theme.** `chartColor()` and `cssVar()` in `ui.js` read the tokens when a chart draws: income indigo, spending amber, savings teal, debt red, card orange, neutral gray. Grid lines and labels come from the theme too, and the 12-color `CHART_PALETTE` reads on both themes. The transfer-flow SVG and sparklines use the same colors.
- **Settings tabs** are plain-text tabs with an underline. The emoji labels are gone, and so are the emojis on the Reconnect and Data & Reset buttons.
- **Investing Ideas:** the AI prompt card uses the accent tint instead of a fixed dark gradient.

### Not in this release
- **Screen layouts are unchanged.** Rebuilding individual screens to match the Clarity mockups (Overview, Bills, Budget, Debt, Forecast and so on) comes in follow-up PRs.

### Docs
- **README** — navigation and theme instructions.
- **CLAUDE.md** — §6 tokens and components; §9 theme, chart color and app bar helpers; §12 app bar navigation replaces the sidebar and its emoji rule; §17 version location; §20 Data & Reset name, and the `finlens_navCollapsed` key is no longer written.

---

## [1.12.0] — 2026-11-01

### All views
- **No bank names in the app.** Labels, hints, default account names and footnotes say "bank" or "credit card" instead, e.g. **Bank Checking**, **Bank Savings**, **Bank Credit Card (file name)**, "Credit card balances", "Load the CSV exports from your bank".
- **Settings → Import:** the account-type choices are Bank Checking, Bank Savings and Bank Credit Card. A file is guessed as a card from `card` or `credit` in its name. Otherwise its `Transaction Date` + `Post Date` headers identify it, as before.

### Technical
- **Neutral account codes.** Kinds and `BANK_SCHEMAS` ids are now `bank_checking`, `bank_savings` and `credit_card`. Account ids are `bank_checking`, `bank_savings` and `card_<file>`. Every view's kind checks, `ui.js` colors and the AI summary's cash/debt totals use them.
- **`js/migrate.js` (new) rewrites data saved by older versions** (`IdMigration`, CLAUDE.md §22):
  - **What it rewrites:** account ids, kinds and old default names; transaction ids and the edits, balances, limits, labels, account order and file assignments keyed by them; the import log.
  - **Where:** State, IndexedDB and localStorage at boot; `finlens-state.json` when it's loaded (then saved back); JSON exports on import.
  - **Transaction ids.** They hash the account id, so they change too. The stored rows lack the bank time and post date, so `_rekey()` uses the hash's linearity to swap the account part of each id. The new ids are exactly what a fresh import gives, so re-importing the same CSVs still adds nothing.
  - **Edits saved under an old id** that couldn't be moved at boot (for example, kept while transactions were cleared) move on the next CSV import (`adoptOverrides()`).
  - **Names you typed are kept.** Only the old default names change.
- **Samples renamed:** `checking_sample.csv`, `savings_sample.csv`, `credit_card_sample.csv`. The card autopay line in the checking sample is now `CREDIT CARD AUTOPAY`.

### AI Eval
- **`AIEval.SAMPLES` uses the new files.** The checking sample's earlier hash is kept in `earlier`, and results files are now matched by hash instead of file name. Published results still load: re-scoring the v1.10.0, v1.10.1 and v1.10.2 runs gives the same numbers as before. The next run's summary will use the new account names.
- **`buildDataset()`** mirrors the new account ids and names. **The generated EVAL.md** describes the data as synthetic bank checking, savings and credit card CSVs.
- **Matcher:** the bank-name synonym entry is removed. It changed no figure in any published run.

### Docs
- **README** — supported files described by their columns, not by bank; account kinds, samples and project structure updated.
- **CLAUDE.md** — §3 `migrate.js` and load order; §4, §5, §10, §18 neutral codes, plus a rule against naming banks; §21 sample `earlier` hashes; **§22 Migrations** added.
- **History is unchanged:** earlier CHANGELOG entries, published eval results (`docs/EVAL.md`, `docs/eval-runs/`), `docs/archive/` and the changelog text embedded in `views-db.js`.

---

## [1.10.2] — 2026-10-25

### AI Analysis
- **The summary sent to Claude now states its dates.** Before, it said only "Period: All time".
  - **What went wrong:** in the v1.10.0 eval the model had to guess how many months the totals covered. It guessed 6, 6–7, 6.5 and even 9 months, from rent ($8,100 ÷ $1,350) or income ($32,525 ÷ ~$4,900, which overcounts because biweekly pay puts three paychecks in some months). So the same data gave different monthly figures: groceries came out at ~$470/month in one answer and ~$516 in another.
  - **Fix:** `summarySpan()` adds the span to the period line: "Period: All time (transactions from May 1, 2026 to Oct 20, 2026: 173 days, about 5.7 months)". Spans under 45 days give days only.
- **Partial months are marked** in the monthly trend: "2026-10 (through Oct 20)" (`partialMonthNote()`). The latest month no longer looks like a complete month.

### AI Eval
- **Reads the new summary format**: the period line and partial-month notes.
- **Checks per-month figures over the period**: each category, income, spending and net, ÷ the months as stated (5.7) or ÷ days/30.44. These were added before any run with the new summary (§21). Dividing by a different month count stays unsupported, since the summary now says how long the period is. Re-scoring the v1.10.0 run is unchanged; its summary has no dates.

### Docs
- **`docs/EVAL.md` — the eval re-run on v1.10.2.**
  - **Monthly figures agree:** every answer gives groceries as $540–545 a month ($3,098 over 5.7 months). In v1.10.1 they said ~$470, ~$515 and ~$516, and no answer guesses the period length any more.
  - **Traceable 72.6%** (was 66.9%) and **unsupported 23.3%** (was 29.2%), still with no answers cut off. The chance-match rate is 13.4% (was 11.9%).
  - **October is treated as partial:** answers compare daily rates and project how it will finish.
  - **The Runs table** now has a column for each of the three runs.
- **`docs/eval-runs/v1.10.1/`** — the v1.10.1 report and raw answers, archived.
- **README** — Evaluation numbers from the new run.
- **CLAUDE.md §13** — the summary always states its dates; **§21** — keep `parseSummary()` in step with the summary format, and which links to fix when archiving a run.

---

## [1.10.1] — 2026-10-25

### AI Analysis
- **Answers no longer get cut off mid-sentence.** In the v1.10.0 eval, 15 of 24 answers stopped at `max_tokens` (1,500) and the AI tab showed them as if complete.
  - **Cause:** Sonnet 5.5 thinks before answering (default effort `high`), and its thinking counts toward `max_tokens` even though FinLens only shows the text. The eval's own usage data shows it: thinking took on average 747 of the 1,500 tokens in the cut-off answers, versus 458 in the ones that finished.
  - **Fix:** `max_tokens` is now `AI_MAX_TOKENS` = 4,096, room for both thinking and the answer.
- **Cut-off answers are flagged.** If an answer still stops early (`stop_reason` `max_tokens` or `model_context_window_exceeded`), the tab says so under the answer. It's saved to history with `truncated: true`, so reopening it shows the warning, and copies and saved notes end with a "Cut off" line. `send()` returns `truncated` alongside `stopReason`.
- **Answers cut off before any text say so.** If Claude reaches the limit while it is still thinking, the response has no text. The tab now says no answer was written, instead of showing "(no response)" with a note that the end is missing. Nothing is saved to history or left to copy, since there is no answer (`aiNoAnswer()`, `AI_NO_TEXT`).

### AI Eval
- **Reports tokens.** EVAL.md gains a *Tokens* row: output tokens per answer, how many were thinking, and the thinking in the cut-off answers. The *Calls* row shows the run's real `max_tokens`. Runs now record `meta.maxTokens`; for older runs it is inferred from where the cut-off answers stopped.

### Docs
- **`docs/EVAL.md` — the eval re-run on v1.10.1.** **0 of 24 answers cut off** (was 15 of 24 at 1,500). The longest used 2,054 of the 4,096 tokens. Output tokens per answer rose about 10% (1,417 → 1,560), and the slowest call took 19.5 s. Grounding moved slightly: 45.7% grounded and 66.9% traceable (was 48.6% and 68.8%), about the spread between repeats. The change comes from the endings that used to be missing, mostly monthly figures over a guessed period length. A new **Runs** table compares the two runs.
- **`docs/eval-runs/v1.10.0/`** — the v1.10.0 report and raw answers, moved there unchanged except for an "Archived" banner.
- **README** — Evaluation numbers from the new run.
- **CLAUDE.md §13** — the output budget and cut-off answers; **§3** and **§21** — what each eval run records, and how to publish a new run (`docs/eval-runs/`).

---

## [1.10.0] — 2026-10-25

### AI Eval (new developer view, `views-eval.js`)
- **Grounding eval for AI Analysis.** Open with `showView('ai-eval')` in DevTools — not in the sidebar, like DB Inspector. It runs each of the 8 `AI_PROMPTS` 3 times (24 calls) and checks every dollar amount and percentage in the answers against the financial summary the model received. Method and results: `docs/EVAL.md`.
- **Synthetic data only.** Loads the three CSVs in `samples/` (`fetch()` when served over HTTP, a file picker on `file://`) and refuses any file whose SHA-256 differs from the committed sample. They're parsed inside a sandboxed `State` (no overrides, rules, manual balances, budgets or debts; date range All Time) that is swapped in and restored synchronously, so your own data is never read, sent or overwritten. Verified equal to the summary a normal import of `samples/` produces.
- **Same request as the AI tab.** Each call goes through `callClaude()` with `AI_MODEL` and the key saved in Settings → General. Retries network errors, timeouts, 429 and 5xx up to 3 times; stops on 400/401/403/404. Nothing is persisted and AI history is untouched.
- **Classification** of every figure:
  - **Grounded** — matches a summary figure within ±$1 / ±0.5 pts, or the figure's own rounding (`$4.5K`) when the item it stands for is named nearby.
  - **Derived ✓** — arithmetic on summary figures, verified in code. Covers explicit equations in the answer, same-line arithmetic on grounded figures, and ~100 standard derivations (category shares, monthly savings rates, month-over-month changes, averages, ×12, projections), each tied to its context words.
  - **Math error** — an explicit equation that doesn't hold.
  - **Forecast** — projections in the 12-month prediction prompt that rest on unverifiable assumptions. Treated as derived (never unsupported) per the eval spec, but reported separately and kept out of the verified share.
  - **Unsupported** — everything else, tagged as advice/target, benchmark, assumption or a claim about the data.
- **Table-aware:** a table cell is checked with its column header, so a `Sep`/`Oct` column names the month. A figure that restates an earlier one must match it within its written precision.
- **Report** per prompt and overall, stability across the 3 repeats, a strict literal-tolerance variant, and a chance-match calibration (figures perturbed 3–25% and re-scored) that estimates the matcher's false-positive rate. Every unsupported figure is listed with its excerpt.
- **Export** — Download EVAL.md and a results JSON (raw answers + per-figure classifications). "Load results JSON" re-scores a saved run without new calls. It refuses files made from other samples or other `AI_PROMPTS`, and a summary loaded from JSON can be re-scored but never sent.

### AI Analysis
- **`callClaude()` raw mode.** `callClaude(question, label, { raw:true, summary })` sends the identical request but touches no DOM, busy flag or history; it resolves to `{ text, stopReason, usage, model }` or throws (HTTP errors carry `.status`/`.detail`). The UI path is unchanged and uses the same inner `send()`.

### Docs
- **`docs/EVAL.md`** — method and results of the first full run (`claude-sonnet-5-5`, 703 figures):
  - 48.6% grounded and 20.2% derived (68.8% traceable), 28.4% unsupported, no math errors;
  - a 75-figure hand check;
  - a record of three matcher bugs fixed after the run, with before and after numbers.
  Raw answers are in `docs/eval-results.json`.
- **Found by the eval, not fixed here:** 15 of 24 AI Analysis answers hit `max_tokens` and are shown cut off. The summary also gives no date span, so monthly figures rest on a guessed period length.
- **README** — new Evaluation section.
- **CLAUDE.md** — §1 version, §3 structure and load order, §12 view list, §13 raw mode, §21 AI Eval rules.

---

## [1.9.6] — 2026-10-25

### Docs
- **Folder access lasts until the last FinLens tab closes, not one page load.** CLAUDE.md §14 and comments in `core.js` and `init.js` said Chromium resets a stored folder's permission on every page load. Testing in Edge showed otherwise: a reload kept access, and only closing Edge dropped it. That matches Chrome's documented behavior. Access lasts until the last tab of the site closes, Chrome can revoke it after a tab sits in the background, and since Chrome 122 the prompt can offer **Allow on every visit**. The code already checks permission on every load and save, so it handles all of these. Only docs and comments changed.

---

## [1.9.5] — 2026-10-25

### Fixed
- **"Canvas is already in use" console errors.** Views draw their charts in `setTimeout(…, 0)`. When a view rendered twice before those timers ran, both batches targeted the same canvas IDs and Chart.js threw for the second. This happened at startup when the folder's CSVs re-imported (`loadFiles()` renders, then `init.js` calls `showView()`), and after Reconnect. The bug was already on `master`.
- **Charts leaked on every render.** Views rebuild their DOM on each render, but the old charts were never destroyed. Chart.js kept every one alive, along with its canvas and data.
- **Fix:** a guard in `ui.js` replaces the global `Chart` with a subclass. Before drawing, it destroys any chart already on that canvas and any chart whose canvas has left the page. No view code changed. Statics such as `Chart.defaults` and `Chart.getChart` still work.

### Docs
- **CLAUDE.md §7** says rule 4 is now enforced by the guard.

---

## [1.9.4] — 2026-10-25

### Fixed
- **The developer Changelog view crashed on Windows.** At startup the console showed `Uncaught TypeError: Cannot read properties of null (reading '1')` at `views-db.js:734`. The changelog text is embedded in `views-db.js` and read back with `Function.toString()` and a regex that expected `\n` line endings. Git for Windows (`core.autocrlf`) checks files out with `\r\n`, so the regex found nothing. Because the error stopped `views-db.js` partway through, the `changelog` view was never registered. Line endings are now normalized before matching, and a failed match shows a message instead of throwing. The bug was already on `master`.

---

## [1.9.3] — 2026-10-25

### Fixed
- **`finlens-state.json` stopped loading and saving after a page reload in Edge and Chrome.**
  - **Symptoms:** at startup the console showed `[FinLens] File load error: … The request is not allowed by the user agent or the platform in the current context.`, and Settings → Import → **Save Now** showed no message, success or failure.
  - **Cause:**
    - Chromium browsers reset a stored folder's permission to "prompt" on every page load.
    - `loadStateFromFile()` and `saveStateToFile()` never checked or re-requested it, so both threw `NotAllowedError`.
    - The folder was only ever granted `read` access (folder picker, `reloadDataFiles()`), and writing the state file needs `readwrite`.
    - **Save Now** ignored the result of `saveStateToFile()`, so a failure only reached `console.warn`.
  - **Effect:** the app booted from IndexedDB (data was safe in the browser), but every automatic save failed silently, so `finlens-state.json` went stale. The bug was already on `master`.
  - **Fix:**
    - **Startup:** `loadStateFromFile()` checks access first with the new `folderPermission()` helper (never prompts). When access has lapsed it skips the file without an error and a **Backups paused** banner appears above every view with a **Reconnect folder** button.
    - **Reconnect:** asks for `readwrite` (the click allows the prompt) and then writes this browser's data to `finlens-state.json`. The browser copy wins; the file is not loaded over it. If access is refused, the banner says so and keeps the button.
    - **Save Now:** asks for `readwrite` when clicked, saves through `saveStateNow()`, and shows "Saved to finlens-state.json …" or why it failed (no folder, permission refused, or the write error).
    - **Autosave:** `saveStateToFile()` skips quietly while access is missing, instead of throwing every 5 seconds, and shows the banner. The next successful save clears it.
    - **Read-write everywhere:** the folder picker, **Reload** and **Reconnect Folder** in Settings → Import now ask for `readwrite` instead of `read`.
    - **Status card:** Settings → Import → Auto-Backup says **Backup paused** while access is missing, instead of "Backup enabled".
- **An empty browser could overwrite the only backup.** Once saving works, picking or reconnecting a folder from a browser with no data (new browser, cleared site data) would have replaced a good `finlens-state.json` with an empty state. In that case FinLens now restores from the file, the same way boot does (`_restoreStateIfBrowserEmpty()`).
- **Data & Reset** now reports a failed state-file write as a failure, with the reason; `saveStateNow()` returns `'error'` for it instead of `'denied'`.
- **Reconnect respects a deliberate clear.** After *Clear transactions & accounts* (v1.9.0's `csvAutoImportPaused`), reconnecting neither re-imports the folder's CSVs nor restores `finlens-state.json` over the empty browser; it only turns backups back on.

### Docs
- **CLAUDE.md §14** documents the folder-permission rules.

---

## [1.9.2] — 2026-10-23

### Docs
- **CLAUDE.md §0 — Workflow:**
  - Every new feature, bug fix or major change gets its own branch and PR; minor changes may be grouped.
  - Review revisions go on the PR's own branch.
  - Stacked PRs merge in order.
  - Nothing merges without Luis's approval, either on GitHub or in chat. A chat approval is recorded as a PR comment (who, date, quoted words, chat link) before merging.
  - GitHub approval means a merge or an approving comment, since an author can't formally approve their own PR. The `master` branch-protection settings are documented for when the repo is public or on GitHub Pro; GitHub Free doesn't offer protection on private repos.

---

## [1.9.1] — 2026-10-23

### Fixed
- **Booting from `finlens-state.json` broke the AI tab and the Income view.**
  - **Cause:** `loadStateFromFile()` returned transactions straight from `JSON.parse`, so every `date` was a string and the `category` getter was frozen into a plain value. `monthKey()` then threw `d.getFullYear is not a function`.
  - **Effect:** the Income view crashed, and `buildFinancialSummary()` threw before the AI request was sent, so "Ask Claude" did nothing.
  - **Who was affected:** anyone whose folder had a state file. That's the normal setup once it's been saved, because the file is loaded first at boot.
  - **Fix:** `loadStateFromFile()` now rebuilds transactions with `reconstituteTx()` (real `Date` objects, the `category` getter, edits re-applied), the same way `DB.loadAll()` already did.

### Docs
- **CLAUDE.md §4.5** notes that loaded transactions must be rebuilt, never used as raw JSON.

---

## [1.9.0] — 2026-10-23

### Settings → 🧹 Data & Reset (new tab, `views-cleanup.js`)
- **One place for all cleanup.** The Danger Zone moved here from General, which now keeps Display and the API key plus a link to the new tab.
- **Imported data & database:**
  - Clear imported transactions & accounts (memory + `transactions`/`accounts` stores). Plans, edits, account names and balances are kept.
  - **Clearing sticks across reloads.** With a folder connected, boot used to re-import its CSVs into the empty database, so cleared transactions came back on F5. Clearing now sets `csvAutoImportPaused` (browser storage only), which skips that boot re-import. Any import you start ends the pause: Reload or Reconnect, Rebuild, picking a folder or files, Disconnect and Start over. The tab and Settings → Import both say when it's paused.
  - Clear the import log.
  - Clear transaction edits (also rebuilds the loaded transactions without overrides).
  - Each row shows live counts from memory and IndexedDB.
- **Rebuild from folder** — clears imported transactions, accounts and the import log, then re-imports every CSV in the connected folder. It fixes a messy database without touching plans.
- **Plans & history** — clear budgets, bills, savings buckets, debts or AI history individually.
- **CSV folder & backup file** — disconnect the folder (FinLens forgets the handle; nothing on disk changes).
- **Start over from scratch:**
  - Type `RESET` to erase everything: both IndexedDB databases, all `finlens_*` localStorage keys (including the API key), the folder connection, then reload.
  - `finlens-state.json` is either renamed to `finlens-state-backup-DDMMYYYY.json` (API key stripped; a second reset the same day gets `-2`, `-3`, … so no copy is overwritten) or deleted, so reconnecting the folder later starts fresh.
  - CSV files are never touched.
- **Safer confirmations** — destructive buttons use click-again-to-confirm, so the folder-permission prompt that may follow gets a fresh user gesture. An alert can't outlast the browser's activation window.

### Display — readable secondary text (all views)
- **Darker gray text.** `--text-3` (descriptions, counts, footnotes, `.muted`) was `#94A3B8` on white, about 2.5:1 contrast. It's now `#5B6B80` in light mode and `#8190A6` in dark mode, at least 4.7:1 on every surface (WCAG AA). One token change, so it applies to every tab.
- **Sidebar.** Group headers, the brand subtitle and the version footer used hard-coded `#475569`/`#64748b` (2.3–3.6:1 on the sidebar). They now share a new `--sidebar-muted` token (`#94A3B8`, 6.7:1).
- **Charts.** Axis labels and legends used Chart.js's default `#666`, which was hard to read in dark mode. `applyTheme()` now sets `Chart.defaults.color` to `--text-2`.

### Fixed
- **"Clear All Data" didn't clear anything.** `clearAllData()` only removed localStorage keys, so on reload `DB.loadAll()` (and `finlens-state.json`) restored every transaction, budget and setting. It now runs the full Start over.
- **Cleared data could come back on reload.** The state file is loaded first at boot but was only rewritten by the 5-second debounced save, so a quick reload restored it. Clearing now writes it immediately via `saveStateNow()`, and warns if write access is refused.
- **Clearing transactions left empty account cards.** The `accounts` store is now cleared too, and the account filter is rebuilt.
- **"Pick CSV Files" landed on Overview.** `handleFilePick()` showed the non-existent `db-import` view, which hid the file-assignment card. It now opens Settings → Import.
- **`finlens_fs` connections were never closed.** `idbGet`/`idbSet`/`idbDel` now close them, so the database can be deleted.
- **Other tabs could block a reset.** `DB.open()` now releases the connection on `versionchange`.

### Technical
- **New `DB` methods:** `STORES`, `counts()`, `clearStores(names)`, `destroy()`.
- **New `core.js` helpers:** `lsClearAll()`, `deleteIndexedDB()`, `folderWithWriteAccess()`, `saveStateNow()`, `retireStateFile()`, `forgetDataFolder()`.
- **Auto-save guard:** `saveStateToFile()` does nothing while `State._resetInProgress` is set.
- **Disabled-button style:** new `.btn:disabled` rule.
- **`.gitignore`:** also ignores `finlens-state-backup-*.json`.
- **Docs:** CLAUDE.md §20 documents where data lives and the cleanup rules; README tip on cleaning up and starting over.

---

## [1.8.1] — 2026-10-23

### Fixed (Technical)
- **Re-importing a Chase file no longer duplicates every Chase row in IndexedDB.**
  - **Cause:** `DB.importTransactions()` assigned the `_2`/`_3` occurrence suffix whenever an ID already existed in the database. So every re-uploaded Chase row collided with its earlier self and was inserted again as `_2`. In testing, 165 Chase rows became 330 after one re-import. Ally was unaffected because it skips collisions.
  - **Fix:** occurrence suffixes are now assigned in `parseCsvFile()`, counted within the file (`normalizeRow(..., occurrence)` → `mkTx()`). `DB.importTransactions()` reads the stored keys once and skips any ID it already holds, with no suffixing and no console error per skipped row.
  - **Consistent IDs:** identical rows now have the same suffixed ID in memory and in IndexedDB. Before, both copies shared the base ID in memory, so overrides couldn't target the second copy reliably.
- **Cleanup of existing damage** — each import deletes leftover copies created by the bug: suffixed rows whose base transaction is in the file but whose exact ID is not. The import results card shows "N leftover duplicate copies removed". Re-import your Chase CSVs once to clean an affected database.
- **Identical Ally rows** (same date, bank time, description and amount) are now dropped in memory too, matching IndexedDB and §10. Custom schemas without a `time` column get occurrence suffixes by default instead of silently losing same-day identical rows.

### Docs
- **CLAUDE.md §10** rewritten to describe where suffixes are assigned and how re-upload safety and cleanup work.

---

## [1.8.0] — 2026-10-23

### AI Analysis — Restored and Hardened
- **AI Analysis tab restored** — `views-ai.js` script tag and the ✨ AI Analysis nav item (Insights) are back; the view was removed in 1.7.0.
- **Model updated** — `claude-sonnet-4-20250514` was retired on 2026-06-15, so every call would fail. Now uses `claude-sonnet-5-5` via a single `AI_MODEL` constant in `views-ai.js`.
- **Anthropic API Key card** added to **Settings → General** (`saveApiKey()` / `removeApiKey()` in `views-settings.js`). The input is a password field and the stored key is never rendered back into the page.
- **Prompt-injection guard** — `buildFinancialSummary()` output is wrapped in `<financial_data>` tags and the system prompt tells the model to treat it as data, since merchant descriptions come straight from bank CSVs.
- **Robust response parsing** — `callClaude()` joins every `text` content block instead of assuming `content[0]` is text.
- **No silent failures** — `callClaude()` shows "Analyzing…" first and reports every failure on the page: a summary that can't be built (previously thrown before the request, so clicks did nothing), API errors (with a key hint on 401), network errors, and a 90-second timeout. Repeat clicks are ignored while a request is in flight.

### Security (Technical)
- **API key no longer written to disk** — `saveStateToFile()` omits `apiKey` from `finlens-state.json`. `loadStateFromFile()` strips it from files written by ≤1.7.0, moves it to browser storage if that was the only copy, and schedules a re-save so the file is rewritten without it.
- **Sanitized Markdown rendering** — new `renderMarkdown()` in `core.js` runs marked output through DOMPurify (HTML profile; no images, styles or forms) with an escaped-text fallback. Used by the AI view, AI history, and the Changelog view; `marked.parse()` is no longer called directly. Blocking images closes the classic exfiltration path where injected text makes the model emit an image URL carrying data.
- **Pinned CDN scripts with SRI** — marked pinned to 15.0.12 (the version the unpinned URL was already resolving to) and DOMPurify 3.4.17 added, both with `integrity` + `crossorigin`.
- **`.gitignore`** — now ignores `finlens-state.json` by name (previously only safe if the folder sat inside `data/`), plus `finlens-export-*.json` and `finlens-analysis-*.md`.

### Fixed
- **Investments tab and Forecast → Investments never loaded** — `_renderForecastInvest()` in `views-invest.js` closed with `});` instead of `}`, a syntax error that stopped the whole file from parsing.
- **`detectRecurring()` threw `ReferenceError: key is not defined`** whenever it found a recurring charge (`aggregation.js` pushed `{key}` where the loop variable is `k`). This crashed Trends insights and the AI financial summary.

### Data
- **`samples/` folder** — synthetic Ally Checking, Ally Savings and Chase CSVs (May–Oct 2026, fake data) for demos and manual testing. Exercises leading-space Ally headers, mixed Chase date formats, paired transfers, card payments, a return, subscriptions, and two identical Chase rows for the `_2` occurrence suffix.

### Docs
- **CLAUDE.md** — corrected stale sections to match the code: current version, tech stack (pinned libraries, persistence order, both IndexedDB databases), project structure, §13 AI integration, §14 (the folder handle also drives `finlens-state.json`), and the version-bump checklist (now includes `views-settings.js`). Added rules: no secrets on disk, no direct `marked.parse()`, no real data in git.
- **README.md** — sample-data instructions, Import path (Settings → Import), AI security notes, current model, and removed the reference to the Backup & Restore export UI removed in 1.7.0.

---

## [1.7.0] — 2026-05-01

### Settings — Reorganized & Simplified
- **General tab moved to first** — now the default landing tab when opening Settings.
- **AI Analysis removed** — nav item and `views-ai.js` script tag removed; `State.aiHistory` persists but is no longer actively used.
- **API Key and Backup & Restore sections removed** from General Settings, reducing clutter.
- **Danger Zone expanded** — individual Clear buttons per dataset (Transactions, Budgets, Bills, Savings Buckets, Debts, Transaction Edits) in addition to the existing Clear All button. Each shows the current record count. `clearDataset(key)` added in `views-settings.js`.

### Settings → Accounts
- **Account Balances moved here from Import** — simplified row layout shows only Current Balance and Credit Limit (Chase only). The confusing "Initial Balance" field has been removed.
- Balance inputs use the same `saveAccountBalances()` function, wired via `data-acct`/`data-field` attributes.

### Settings → Import
- **Database Coverage card removed** — the async IndexedDB coverage summary no longer appears in the Import tab.

### Settings → Categories
- **Simplified to chip/pill UI** — categories are now shown as removable pill tags instead of editable text inputs. Inline text editing and the "Save Changes" button are gone; deletions apply immediately. `deleteCategory(i)` replaces `saveCategoryEdits()`.

---

## [1.6.0] — 2026-04-27

### Navigation — Full Redesign
- **4-section sidebar** replacing the previous 6 groups: Finances · Plan · Insights · Settings.
- **Finances** contains only Overview and Transactions — the daily-use views.
- **Plan** contains Budget, Buckets, Debt, Investments, and Forecast.
- **Insights** contains Trends and AI Analysis.
- **Settings** contains Import, Accounts, Credit Cards, and Categories.
- **Dropped from nav:** Import Logs, Changelog, Database Inspector — developer-facing views, not user-facing destinations.
- **No icons** in any nav items or section headers. Plain text only. Rule documented in CLAUDE.md.

### Transactions
- **Filter pills** replace the Type dropdown: All · Income · Spending · Bills · Payments · Transfers. Switching filters re-renders the same table — no page navigation.
- **Balance column removed** — was always `—` since Ally does not export running balances.

### Plan — Investments & Forecast
- **Investing Ideas renamed to Investments** (`registerView` ID changed from `invest` to `investments`).
- **Forecast merged into a single tabbed view** — Savings and Investments sub-tabs replace the two separate `forecast` / `forecast-invest` nav entries. `_renderForecastSavings` and `_renderForecastInvest` are now internal render functions called by the tabbed `forecast` view.

### Settings — Accounts split
- **Accounts** view now shows bank accounts only (ally_checking, ally_savings, unknown kinds).
- **Credit Cards** is a new view showing chase and future CC-kind accounts. Separated to accommodate additional CSV sources in future.
- **View IDs updated:** `db-import` → `import`, `db-accounts` → `accounts` + `credit-cards`, `db-categories` → `categories`.

---

## [1.5.1] — 2026-04-27

### Navigation
- **Sidebar reorganized from 6 groups to 4** — "Main" → "Activity"; "Insight" + "Investments" merged into "Forecast"; "Database" + "Configuration" merged into "Data". Trends moved from Plan to Forecast. Settings and Changelog moved into Data.
- **New group structure:** Activity (overview, transactions, income, spending, bills, transfers) · Plan (budgeting, savings buckets, debt tracker) · Forecast (trends, forecast savings, forecast investments, investing ideas, AI analysis) · Data (import, accounts, categories, import logs, database, settings, changelog).
- **`data-section` values updated** in `index.html` to `activity`, `plan`, `forecast`, `data` — toggle JS continues to derive `ns-{section}` IDs automatically with no code changes needed.

### Bug Fixes
- **Database views showing nothing** — `DB.open()` was only called when the filesystem JSON load failed, leaving `DB._db = null` for the entire session whenever `finlens-state.json` was present. Fixed by always calling `DB.open()` at boot before the state-loading decision, so all database-dependent views work regardless of which storage path was used.
- **Duplicate `registerView('db-inspector', ...)`** — `views-db.js` registered `db-inspector` twice; the schema diagram at line 11 silently overwrote the actual DB inspector at line 358. Fixed by renaming the schema diagram registration to `db-schema`.

---

## [1.5.0] — 2026-04-27

### Persistence & Storage
- **Filesystem JSON as source of truth** — FinLens now saves all state to `finlens-state.json` in your backup folder (same folder as your CSV files). This file is the primary persistent storage and survives browser cache clearing. On page load, the app tries to load from the filesystem first, then falls back to IndexedDB/localStorage if the file doesn't exist. (Option 1: filesystem JSON storage instead of IndexedDB-only.)
- **Auto-save to disk** — State is automatically written to `finlens-state.json` every 5 seconds (debounced) whenever you make changes. Manual "Save Now" button available in the Data tab for immediate sync.
- **`core.js`: New filesystem functions** — Added `loadStateFromFile()` to read `finlens-state.json` from the backup folder via File System Access API. Added `saveStateToFile(state)` to write State to the file. Added debounced `_saveStateDebounced()` which triggers on every `lsSet()` call.
- **`core.js`: `lsSet()` updated** — now also calls `_saveStateDebounced(State)` to auto-sync to the filesystem.
- **`init.js`: Boot sequence changed** — Now tries filesystem JSON first via `loadStateFromFile()`, then falls back to `DB.open()` + `DB.loadAll()` if the file doesn't exist. This makes the filesystem the authoritative source of truth while preserving the fallback chain: filesystem → IndexedDB → localStorage.
- **`views-data.js`: Auto-Backup Status card** — new card showing backup folder status, last sync time, and a manual "Save Now" button. Displays a warning if no folder is selected yet.

### Navigation Restructuring
- **Database sidebar section** — a new collapsible "Database" section replaces the former "Data" tab. It contains five sub-views: Import (`db-import`), Accounts (`db-accounts`), Categories (`db-categories`), Import Logs (`db-logs`), and Database (`db-inspector`). The `data` view ID is retired.
- **Categories moved** — the category list editor was removed from Settings and is now under Database → Categories, where it sits alongside import and account management tools.
- **Configuration section streamlined** — Settings now contains only API key, theme, and danger zone. Changelog is the second item under Configuration.
- **Transfer keywords moved to Transfers tab** — the transfer keyword editor (previously in Settings) now lives at the bottom of the Transfers view, providing in-context editing. Helper functions `renderKwChipsTransfers()`, `addTransferKeywordTransfers()`, `deleteTransferKeywordFromTransfers()`, and `reapplyTransferKeywords()` manage keyword state from within the tab.

### Data Model
- **`payment` transaction type** — `normalizeRow()` in `core.js` now recognizes Chase `Type = "Payment"` and sets `type = 'payment'` on the transaction. This distinguishes card payments from purchase credits (`'credit'`) and inter-account moves (`'transfer'`). `sumIncome()` in `aggregation.js` filters out `'payment'` type so card payments are not counted as income.
- **`accountDateRange(accountId)`** — new helper in `aggregation.js` returning `{ min, max }` dates for all transactions belonging to an account. Used by the Accounts view to display data coverage per account.

### Technical
- **State.lastFsyncTime** — new field tracking the last filesystem sync timestamp. Updated whenever `saveStateToFile()` completes successfully. Displayed in Database → Import.
- **File System Access API persistence** — uses the existing `csvDirHandle` stored in IndexedDB (`finlens_fs` database). The same folder where CSV files are loaded from is where `finlens-state.json` is saved, keeping user file organization simple.
- **`views-data.js` view registrations** — `registerView('data', ...)` replaced by `registerView('db-import', ...)`; added `db-accounts`, `db-categories`, and `db-logs` registrations.
- **`views-db.js`** — `db-schema` view renamed to `db-inspector`; Changelog view gains a version-link outline at the top for quick navigation to any release.

---

## [1.4.2] — 2026-04-27

### Technical
- **`js/aggregation.js` (new)** — Extracted pure aggregation helpers from `core.js` into a dedicated module: `sumIncome`, `sumExpense`, `sumTransfers`, `byCategory`, `byMonth`, `currentBalances`, `periodEndBalance`, `detectRecurring`, `detectRecurringDeposits`, and `SUBS_KEYWORDS`. Loaded after `core.js` and before `db.js` in the script order. `core.js` now covers only state, helpers, CSV parsing, date range, and account filter logic.
- **`index.html`: script load order updated** — `aggregation.js` added between `core.js` and `db.js`.
- **Date format bug fixed** — Both Ally schemas had `dateFormat: 'MM/DD/YYYY'` but Ally actually exports dates as `YYYY-MM-DD`. Updated to `dateFormat: 'YYYY-MM-DD'` for `ally_checking` and `ally_savings`. Chase `Transaction Date` is also `YYYY-MM-DD`; updated accordingly. Chase `Post Date` column remains `MM/DD/YYYY` and is now handled via a new `postDateFormat` field on the Chase schema. `normalizeRow()` updated to use `schema.postDateFormat` when parsing post dates. Prevents the UTC-midnight off-by-one-day bug that affected all transactions when dates fell through to the `new Date(s)` fallback.
- **`.gitignore` added** — Excludes `data/` and `finlens-data.json` to prevent real transaction CSV exports from being committed to version control.
- **`finlens-data.json` removed** — Orphaned secondary-persistence file (retired in v1.4.1) deleted from the project root.
- **`INDEXEDDB_PLAN.md` archived** — Completed spec document moved to `docs/archive/INDEXEDDB_PLAN.md`. Root directory no longer contains stale planning docs.
- **`README.md` updated** — Version bumped to v1.4.1 (was v1.3.4). Removed stale `finlens-data.json` references, updated browser compatibility table to reflect IndexedDB-first persistence, corrected Ally balance description (computed, not exported), updated Transactions section ("Expense" not "Debit"), updated project structure to include `aggregation.js`, `db.js`, `views-db.js`. Added README to the version bump checklist in `CLAUDE.md`.
- **`CLAUDE.md` updated** — Corrected Ally and Chase date format documentation (§10), added `postDateFormat` schema field to adding-a-new-bank guidance (§19), updated script load order and project structure (§3), updated key helpers table (§8) to note which functions live in `aggregation.js`, added README to version bump checklist (§17).

---

## [1.4.1] — 2026-04-27

### Navigation & Date Ranges
- **Date range selector replaced** — Removed pill-style buttons; replaced with a `<select>` dropdown in the topbar supporting 10 modes: This Week, Past Week, This Month, Last Month, Last 3 Months, Last 6 Months, YTD, Last Year, All Time, Custom. Custom mode shows inline date pickers. `setRange()` updated to handle all new modes; `describeRange()` updated with a `MODE_LABELS` map for human-readable labels.
- **Sidebar: "Invest" → "Investments"** — renamed nav label for clarity; view ID and data-section attribute unchanged.
- **Sidebar: "System" → "Configuration"** — renamed nav section header; internal `data-section="system"` unchanged to preserve compatibility.
- **Sidebar: Database section** — new sidebar section containing two new nav items: `db-schema` (Visual DB Diagram) and `db-inspector` (DB Inspector).
- **Sidebar: Changelog nav item** — added under the Configuration section.

### New Views (`js/views-db.js`)
- **DB Schema view (`db-schema`)** — SVG-based entity-relationship diagram for the `finlens_db` IndexedDB. Shows all 5 object stores (`transactions`, `tx_overrides`, `accounts`, `import_log`, `app_state`) as colored boxes with field listings, PK/IDX badges, and type annotations. Curved dashed relationship arrows connect: `transactions.id ↔ tx_overrides.txId`, `transactions.account → accounts.id`, `import_log.accountId → accounts.id`. Legend card below the diagram explains badge and arrow meanings.
- **DB Inspector view (`db-inspector`)** — Interactive browser for all IndexedDB object stores. Features: store selector dropdown, text search (filters displayed rows client-side), async IDB `getAll()` reads, paginated display (50 records/page) with Prev/Next navigation, column headers auto-derived from row keys, type-aware cell rendering (dates via Day.js, arrays in purple, booleans in teal/gray, numbers in amber mono). Load and Clear buttons for on-demand data fetching.
- **Changelog view (`changelog`)** — Renders changelog content using `marked.js` with inline styles matching the FinLens design system. Content is embedded directly in `views-db.js` via a block-comment extraction trick — no `fetch()` needed, works on `file://` protocol.

### Technical
- **`js/views-db.js` (new)** — Registers `db-schema`, `db-inspector`, and `changelog` views. Added to `index.html` script load order between `views-settings.js` and `init.js`.
- **FileStorage removed** — Deleted `FileStorage` object, `FS_STATE_MAP`, and `FileStorage.scheduleWrite()` call from `core.js`. Removed `FileStorage.restore()` from `init.js`. Removed File Sync card, `fsConnect()`, `fsReconnect()`, `fsSaveAll()`, `fsDisconnect()` from `views-settings.js`. The `finlens-data.json` secondary persistence path is fully retired. `idbGet`/`idbSet`/`idbDel` helpers are retained (still used for `csvDirHandle` in `views-data.js`). IndexedDB (`finlens_db` via `js/db.js`) is now the sole persistence layer beyond localStorage.

---

## [1.4.0] — 2026-04-27

### Technical — IndexedDB Migration (Phases 0–5)

- **`js/db.js` (new)** — Full IndexedDB API layer (`finlens_db` v1). Five object stores: `transactions` (immutable source records with 5 indexes), `tx_overrides` (user edits keyed by txId), `accounts` (metadata + coverage tracking), `import_log` (per-upload audit trail), `app_state` (key-value replacement for localStorage). All DB methods return Promises. `DB.open()` triggers a one-time `migrateFromLocalStorage()` on fresh install, copying all `finlens_*` localStorage keys into `app_state`. Subsequent loads use `DB.loadAll()` which restores State from IndexedDB — transactions persist across page reloads without re-upload.
- **`core.js`: Bank Schema Registry** — Added `BANK_SCHEMAS` constant array with built-in schemas for `ally_checking`, `ally_savings`, and `chase`. Each schema specifies column mappings, hash fields, `amountSign`, `dateFormat`, and `allowOccurrenceSuffix`. Added `detectSchema(headers, filename)` — filename-based disambiguation (Ally checking vs savings share identical column structure) runs before header-based `detect()` matching. Added `normalizeRow(row, schema, accountId)` — generic normalizer driven by schema config. Replaced `normalizeAllyRow()` and `normalizeChaseRow()`.
- **`core.js`: `parseCsvFile()` updated** — now calls `detectSchema()`, then `normalizeRow()` per row, then `DB.importTransactions()` + `DB.upsertAccount()` + `DB.logImport()` when IndexedDB is ready. Returns normalized txs for current-session in-memory use (unchanged API for `loadFiles()`).
- **`core.js`: `parseDate()` updated** — now accepts an optional `format` parameter (`'MM/DD/YYYY'` | `'DD/MM/YYYY'` | `'YYYY-MM-DD'`), defaulting to `'MM/DD/YYYY'`. Format-aware regex parsing replaces the ambiguous `new Date(s)` call for slash-delimited date strings.
- **`core.js`: `lsSet()` updated** — now also calls `DB.setState(key, value)` fire-and-forget when IndexedDB is ready, keeping `app_state` in sync with every localStorage write.
- **`core.js`: `detectTransfers()` updated** — transfer keyword regex is now built from `State.transferKeywords` (user-editable) instead of a hardcoded string. Falls back to `DEFAULT_TRANSFER_KEYWORDS` if empty.
- **`core.js`: `State.transferKeywords`** — new persisted field (`string[]`). Default: `['transfer','zelle','ach','venmo','paypal','coinbase','savings booster']`. Added to `FS_STATE_MAP`.
- **`core.js`: `State.customSchemas`** — new persisted field for user-defined bank schemas. Added to `FS_STATE_MAP`. Merged into `BANK_SCHEMAS` at boot by `DB.loadAll()`.
- **`db.js`: Occurrence suffix** — `DB.importTransactions()` handles truly identical Chase rows (same date/postDate/description/amount) by appending `_2`, `_3`, … to the transaction ID. Batch is sorted by `(date, description, amount)` before insert for stable suffix assignment across re-uploads. Ally schemas have `allowOccurrenceSuffix: false`; duplicate Ally rows are silently skipped.
- **`db.js`: Gap detection** — `DB.importTransactions()` compares the incoming file's earliest date against the account's current `dataRangeMax`. If the gap exceeds 2 days (weekend/processing threshold), a `gapWarning: { from, to }` is returned and surfaced in the Data tab result card.
- **`db.js`: Coverage tracking** — `DB._updateAccountCoverage()` updates `dataRangeMin`, `dataRangeMax`, and `txCount` on the accounts store after every import. `DB.getCoverage()` reads this for the Data tab's permanent coverage table.
- **`init.js`: Async boot** — `DB.open()` then `DB.loadAll()` run before `FileStorage.restore()` and the first render. CSV auto-reload is skipped when IndexedDB already has transactions.
- **`views-data.js`: Coverage Summary card** — permanent card (rendered async via `setTimeout`) showing first transaction date, latest date, and total count per account from `DB.getCoverage()`.
- **`views-data.js`: Post-Upload Result card** — shown after each CSV import with rows inserted/skipped, file date range, total DB coverage, "Next upload: start from [date]" guidance, and gap warning when applicable.
- **`views-data.js`: Import Log card** — collapsible history table. Columns: When, File, Account, Schema, Found, New, Skipped, File Range. Populated by `DB.getImportLog()` on expand.
- **`views-settings.js`: IndexedDB Status card** — replaces the "Local File Storage" card as the primary storage section. Shows DB readiness, transaction count, and Export/Import JSON backup buttons.
- **`views-settings.js`: File Sync card** — renamed from "Local File Storage"; repositioned as optional secondary backup (iCloud/Dropbox sync via `finlens-data.json`).
- **`views-settings.js`: Transfer Keywords card** — new card for editing `State.transferKeywords`. Shows current keywords as removable chips, text input + Add button, and a "↻ Re-apply to All Transactions" button that reruns `detectTransfers()`.
- **Known one-time breakage**: existing `txOverrides` in localStorage may have been generated with the pre-v1.3.9 hash scheme. Migration copies them as-is; they will not match any transactions until the user re-uploads CSVs with v1.4.0.

## [1.3.9] — 2026-04-27

### Technical
- **`core.js`: Ally transaction hash now includes Time** — `normalizeAllyRow()` reads the `Time` column (HH:MM:SS, bank-assigned) and passes it to `mkTx()`. The hash for Ally transactions is now `hash(date|time|desc|amount|account)` instead of `hash(date|desc|amount|account)`, eliminating the risk of identical same-day charges colliding into a single transaction ID.
- **`core.js`: Chase transaction hash now includes Post Date** — `normalizeChaseRow()` now parses `Transaction Date` and `Post Date` as independent values. The hash for Chase transactions is `hash(txDate|postDate|desc|amount|account)`. Previously, Post Date was only used as a fallback when Transaction Date was absent, providing no disambiguation. Note: truly identical Chase rows (same transaction date, post date, description, and amount — e.g. multiple same-day TAXMANIA charges) still collide; occurrence-suffix dedup is planned for the IndexedDB implementation.
- **`core.js`: Removed dead Ally balance-reading code** — `normalizeAllyRow()` was reading a `Balance` column from Ally CSVs and passing it to `mkTx()`. Ally does not export a running balance; the column lookup silently returned null on every row. The `rawBal`/`balance` parsing is removed. `mkTx()` now hardcodes `balance: null` unconditionally for all sources.
- **`core.js`: Removed `get('Memo')` fallback from Ally description parsing** — Ally descriptions are always populated in the `Description` column. The `Memo` fallback (`get('Description')||get('Memo')`) was a Chase concept incorrectly applied to Ally rows and is now removed.
- **`CLAUDE.md`: Corrected CSV column documentation** — §10 now documents the actual Ally and Chase column structures with per-column format notes. Ally's `Time` field is documented as bank-assigned and meaningful. Chase's `Memo` column is documented as always empty and ignored. The Transaction ID hash strategy is documented in full, including the per-source inputs and the Chase collision fallback. §4.2 corrects the `balance` field (always `null`; Ally does not export running balance). §18 corrects the balance source for `ally_checking` and `ally_savings`.

---

## [1.3.8] — 2026-04-27

### General
- **New "Invest" sidebar section** — "Investing Ideas" and "Forecast Investments" are now grouped under their own collapsible "Invest" nav section, separate from "Insight" (which retains Trends, Forecast Savings, and AI Analysis). The new section follows the same collapsible/persist pattern as all other nav groups.

### Spending
- **"Other" filtered from charts** — the By Category bar chart and Category Ranking horizontal bar no longer include the "Other" / uncategorized bucket. It was dominating the charts without being actionable. The drill-down, Top Category KPI, and Top Merchants table all benefit from the same filter. Use category rules (Spending → Category Rules) to reduce "Other" over time.
- **Removed "View All Expenses" table** — the full-list table added in v1.3.7 has been removed. The category drill-down (click any bar) and the Transactions tab serve this purpose better.

### Savings Buckets
- **Bucket detail drawer** — clicking anywhere on a bucket card (outside the edit/delete buttons) now opens a side drawer with: icon + name, current vs goal KPIs, progress bar + % complete + remaining (when a goal is set), and a table of all transactions linked to that bucket via the "Link to → Bucket" feature in the transaction edit drawer. Edit and Delete actions are available directly from the drawer.
- **No-goal display cleanup** — buckets with no goal set no longer show a "0% complete", "of $0.00", or an empty progress bar. They now simply show the current amount and a "No goal set" label.

### Technical
- `views-plan.js`: Added `showBucketDrawer(i)` function. Bucket cards now use `data-bkt-edit` / `data-bkt-del` attributes with `stopPropagation` so the edit/delete buttons don't trigger the card click.
- `views-main.js`: Removed `spAllSort` module-level var (All Expenses table removed).
- `views-main.js`: `cats` in the Spending view is now filtered to exclude `'Other'` and blank categories before chart rendering.

---

## [1.3.7] — 2026-04-27

### General (Root Cause Fix)
- **CSV auto-reload on startup** — `init.js` now checks IndexedDB for a stored `csvDirHandle` and silently reloads all CSV transactions on page load if folder permission is still granted. This is the root cause fix for Bills, Spending, and other transaction-dependent tabs appearing empty after a browser refresh. No user action needed — data just appears.

### Data Tab
- **Smarter folder UI** — the Data Source card now shows the saved folder name, current transaction count, and a "↻ Reload" button as the primary action when a folder is already known. "Change Folder" is a secondary ghost button. If the OS revoked permission, a "🔄 Reconnect Folder" button appears with a warning. First-time users still see the original "Pick a Folder" picker.

### Transactions
- **"Debit" renamed to "Expense"** — the type chip, bulk-type dropdown, type filter, and transaction-edit drawer all now say "Expense" instead of "Debit". Internal type value `'debit'` is unchanged (no data migration needed).
- **Search clear button** — a ✕ button now appears inside the search field whenever there is text, allowing one-click clearing without selecting the field and deleting manually.
- **Transaction Rules** — new "Transaction Rules" card at the bottom of the Transactions view. Rules auto-flag transactions as Bill, Subscription, or Recurring when their description contains a keyword. Stored in `State.txRules` (persisted to `localStorage` and `finlens-data.json`). Applied at CSV parse time via `mkTx()` and can be re-applied to already-loaded transactions via the "↻ Re-apply" button. `txOverrides` always take priority over rules — a rule won't override a flag you've explicitly set or cleared on a specific transaction.

### Spending
- **"By Category" — vertical bar chart** — replaced the doughnut chart with a vertical bar chart. Click any bar to drill into that category's transactions.
- **"Category Ranking" — horizontal bar chart** — replaced progress bars with a Chart.js horizontal bar chart. Click any bar to drill into that category. Shows dollar amount and percentage in tooltip.
- **View All Expenses** — new sortable table showing all expenses in the selected period. Click any column header (Date, Merchant, Amount) to sort ascending/descending. Click any row to open the transaction edit drawer. Shows up to 500 rows with a count notice if truncated. Stored sort state survives view re-renders.

### Transfers
- **Sortable Transfer History table** — the Date and Amount columns in the Transfer History table are now clickable sort headers. Sort state (key + direction) is stored in module-level `txfSort` and survives filter changes.

### Technical
- `core.js`: Added `State.txRules` (default `[]`) and `['txRules','txRules']` to `FS_STATE_MAP`.
- `core.js`: Added `txRuleFlag(desc, flag)` helper — checks description against `State.txRules`.
- `core.js`: Added `applyTxRulesToAll()` — re-applies rules to already-loaded transactions respecting `txOverrides`.
- `core.js`: `mkTx()` now uses `'isBill' in ov ? !!ov.isBill : txRuleFlag(...)` pattern so explicit user overrides always win over rules.
- `init.js`: Added `State._csvNeedsReconnect` flag set when `csvDirHandle` exists in IDB but permission is `'prompt'`.
- `views-main.js`: Added `spAllSort` module-level sort state for the All Expenses table.
- `views-main.js`: Added `txfSort` module-level sort state for Transfer History.

---

## [1.3.6] — 2026-04-26

### General
- **Filter persistence fix** — fixed a bug in `init.js` where selecting "All Accounts" set `State.selectedAccounts` to `[]` (empty array) instead of `'all'`, causing `inAccount()` to match nothing and display zero transactions after switching to "All Accounts". Filter state (date range + account) now correctly persists when navigating between tabs.

### Overview
- **CC debt displayed as positive** — Chase account balance card now shows `Math.abs(bal)` so the dollar amount reads as a positive owed value rather than a negative.
- **CC sparklines in red** — the 30-day area sparkline for Chase credit card accounts now renders with red stroke and fill (`#EF4444`) to visually signal debt. Ally account sparklines remain teal.
- **Ally KPI footnote cleaned up** — removed the redundant account-kind label (e.g. "Ally Checking") from the footnote below the balance, since the card title already shows the account name. Footnote now shows period net activity ("Net +$X" or "No activity this period").

### Transactions
- **Bulk edit transaction type** — the bulk-selection bar now includes a "Set type" dropdown (Debit / Income / Transfer) and an "Apply Type" button. Applying "Transfer" also auto-sets the direction category (Transfer out / Transfer in) based on amount sign.
- **Manual transfers appear in Transfers tab** — when saving a transaction as type "Transfer" via the edit drawer, the system now auto-assigns "Transfer out" (negative amounts) or "Transfer in" (positive amounts) as the category if no transfer-direction category is already set. This ensures manually-typed transfers appear correctly in the Transfers tab.
- **Type chip color-coding** — transaction type labels are now color-coded: Debit (red `.chip.debit`), Income (green `.chip.income`), Transfer out (amber `.chip.xfer-out`), Transfer in (blue `.chip.xfer-in`). Added corresponding CSS classes.
- **Filter by amount** — new Amount filter control in the transactions toolbar supports: Any, = exact, < less than, > greater than, and range (min–max). Filters against the absolute value of the transaction amount. Stored in module-level vars `txAmtMode`, `txAmtVal`, `txAmtVal2`.

### Technical
- `drawSpark(id, accountId, opts)` in `ui.js` now accepts an optional third argument `{color, bg}` for overriding sparkline color. Overview passes `{color:'#EF4444', bg:'rgba(239,68,68,.15)'}` for Chase accounts.
- Added CSS classes `.chip.income`, `.chip.xfer-out`, `.chip.xfer-in` to `index.html`.
- Added module-level vars `txAmtMode`, `txAmtVal`, `txAmtVal2` in `views-main.js`.

---

## [1.3.5] — 2026-04-26

### General
- **Collapsible sidebar sections** — the four nav groups (Main, Plan, Insight, System) are now collapsible. Click a section header to toggle it; state is saved to `localStorage` so the layout persists across reloads.

### Overview
- **Clean panel titles** — removed `— ${describeRange()}` from the Cash Flow title and `(Period)` from the Credit Cards panel. The selected date range is already shown in the top bar.
- **Upcoming bills → next-5 table** — replaced the previous list with a compact 3-column table (Date | Bill | Amount) showing only the 5 soonest unpaid bills. Overdue and soon-due dates are color-coded.
- **Merged Recent Transactions panel** — the two separate "Last 5 Ally Checking" and "Last 5 Ally Savings" panels are now combined into a single "Recent Transactions" card showing the 5 most recent across both accounts, with an Account column.
- **Editable KPI card titles** — double-click any account KPI card title (e.g. "Ally Checking") to rename it inline. Custom names persist to `State.accountLabels` and survive CSV reloads.

### Transactions
- **Bulk select** — each transaction row has a checkbox on the left. A "Select All" header checkbox selects the entire current page. When items are selected, a teal bulk-action bar appears with options to apply a category, mark as Bill, mark as Subscription, or clear the selection.
- **"(Uncategorized)" category filter** — a special `(Uncategorized)` option in the Category dropdown filters for transactions whose category is empty or falls back to "Other".
- **Link to Budget / Bucket / Debt** — the transaction edit drawer now has a "Link to" section where you can associate a transaction with an existing budget, savings bucket, or debt entry. The link is stored in `txOverrides`.

### Data
- **Display names survive reloads** — when you save a dataset name in the Data tab, the name is now also stored in `State.accountLabels[accountId]`. On the next CSV reload, the custom name is automatically re-applied to the account, so you no longer need to rename after every refresh.
- **Account filter uses custom labels** — the top account-filter dropdown is now populated via `orderedAccounts()` and uses the custom label from `State.accountLabels` when present.

### Technical
- Added `accountLabels: {}` to `State` and `FS_STATE_MAP` in `core.js`.
- `parseCsvFile()` applies `State.accountLabels[accountId]` override after creating/finding the account object.
- `buildAccountFilter()` now sorts accounts by `orderedAccounts()` and uses `State.accountLabels` for names.
- `saveDatasetNames()` in `views-data.js` additionally writes to `State.accountLabels` and calls `lsSet('accountLabels', ...)`.
- `selectedTxIds` (module-level `Set`) added in `views-main.js` for bulk selection state.

---

## [1.3.4] — 2026-04-26

### Data
- **Account reordering** — each row in the Loaded Files card now has ▲ / ▼ buttons to move that account up or down in the display order. The order is saved to `localStorage` (and `finlens-data.json` when file storage is connected) as `accountOrder`.

### Overview
- **KPI cards follow account order** — account balance cards are now rendered using `orderedAccounts()`, so they always reflect the order the user set in the Data tab. Newly loaded accounts are automatically appended to the end of the order.

### Technical
- Added `accountOrder: []` to `State` and `FS_STATE_MAP`.
- Added `orderedAccounts()` helper in `core.js` — sorts `Object.values(State.accounts)` by position in `accountOrder`, falling back to insertion order when no order is stored.
- `loadFiles()` syncs `accountOrder` after every load: existing positions are preserved, new account IDs are appended.

---

## [1.3.3] — 2026-04-26

### Bills
- **Transaction table no longer blank** — two root causes fixed:
  1. `gas\s` and `phone\s` in the keyword regex required whitespace immediately after the word, so descriptions ending in "GAS" or "PHONE" were silently skipped. Replaced with `gas(?:\s|&|$)` and a plain `phone` match.
  2. Category matching was an exact-match list (`['Bills & Utilities','Utilities',...]`) that missed Chase's real category names like "Phone & Communications", "Cable & Internet", and "Gas & Electric". Replaced with a keyword regex (`BILL_CAT_KW`) that matches any category *containing* terms like "bill", "utilit", "phone", "telecom", "subscri", "insur", etc.
- Added additional BILL_KW terms: `cable`, `wireless`, `telecom`, `subscription`, `membership`, `billing`, `gym`, `audible`, `patreon`, `substack`.

---

## [1.3.2] — 2026-04-26

### Overview
- **Date-range aware balances** — account KPI cards now compute the balance at end of the selected period rather than always showing the live current balance. Ally accounts use the running balance column from the CSV for precision; Chase accounts use current manual balance adjusted by transactions after the period end. Each card also shows a "Net ±$X" footnote for the period.
- **Last 5 panels respect date range** — Ally Checking and Ally Savings "Last 5" panels now filter by the active date range (previously always showed the most recent 5 transactions regardless of period). Title updated to "Last 5 (Period)".

### Refresh Data
- **No more re-prompting** — "Pick a Folder" now uses the File System Access API `showDirectoryPicker()` and stores the `FileSystemDirectoryHandle` in IndexedDB. The sidebar ↻ Refresh Data button (and the Data tab's Refresh button) re-use the stored handle and silently re-read CSVs without prompting. Falls back to the file-input picker on browsers that don't support the API or if the folder was picked via the legacy input.

### Transactions
- **Category filter cleaned up** — "Transfer in" and "Transfer out" are excluded from the category dropdown since they are now represented in the Type column.
- **Type filter added** — new dropdown next to Category lets you filter by: All Types / Income / Debit / Transfer in / Transfer out.
- **Transfer chip colors** — "Transfer in" chip uses green (credit style); "Transfer out" uses red (debit style), matching the Income/Debit color convention.

### Spending
- **Editable drill-down rows** — transactions in the category drill-down table are now clickable and open the standard edit drawer (same as the Transactions tab), letting you update description, categories, type, and notes without switching tabs.
- **"Visits" renamed to "Frequency"** — the Top Merchants table column now reads "Frequency" with a count and `×` suffix.

---

## [1.3.1] — 2026-04-25

### Bug Fixes
- **Custom date range** — date inputs from `<input type="date">` return strings (e.g. `"2026-04-01"`), but `inRange()` compared them to `Date` objects using `<`/`>`. Converted custom range `start`/`end` to proper `Date` objects (`T00:00:00` / `T23:59:59`) in `setRange()` so custom periods now filter correctly.
- **Bills tab blank** — the Bills transaction table was using `filteredTx()` which applies the date-range filter; if the selected month had no matching transactions, the table appeared empty. Changed to `State.transactions` (all-time) so bills are always shown regardless of the period selector. Title updated to "Bills, Utilities & Subscriptions (All Time)".
- **Spending drill-down** — category bars used `onclick="spendingDrillCategory='...'"` with inline string escaping, which could break on category names containing single-quotes or special characters. Replaced with `data-sp-cat-idx` attributes and `addEventListener` so the actual category object is accessed by index — no escaping issues.

### Overview
- **Upcoming Bills** — replaced the collapsible calendar widget with a clean list showing bill name, category, frequency, amount, and a color-coded badge (Overdue / Due today / Due in Nd / date). Falls back to a helpful prompt when no bills are added.
- **Credit Cards — Most Expensive Transactions** — renamed from "Top 5 Chase Transactions"; now shows an Account column so multi-card users can see which card each charge is on.

### Transactions
- **Type chip** — the Type column now shows `Transfer in`, `Transfer out`, or `Income` instead of generic `transfer`/`credit`/`debit`. Transfer direction is derived from the transaction's categories array; positive non-transfer transactions show `Income`. Transfer direction labels are also hidden from the Category column to avoid duplication.

### Transfers
- **Clickable rows** — removed the dedicated Edit button from each transfer row. The entire row is now clickable and opens the edit drawer, making it easier to access on both wide and narrow viewports.

### Data
- **Label update** — "Chase Credit Card(s)" section header in Account Balances renamed to "Credit Card(s)".

### Settings
- **Save All button** — when Local File Storage is connected, a "💾 Save All Now" button appears that immediately calls `FileStorage.write()` to force-flush all current state to `finlens-data.json`, useful after bulk changes.

---

## [1.3.0] — 2026-04-25

### General
- **Favicon** — added SVG bookmark icon (teal square with "FL") shown in browser tabs and bookmarks.
- **Refresh Data button** — now uses the teal sidebar color with dark text instead of ghost style, making it more prominent.
- **Forecast Investments icon** — changed from emoji `📈` to text character `◈` to match the consistent icon style of all other sidebar items.
- **Chart overflow fix** — sparkline canvases in account cards are now wrapped in a `.spark-wrap` div with an explicit 64px height. Chart.js reads the container height instead of expanding infinitely downward.
- **Supported format** — welcome screen and file picker messages now clearly state `.CSV only`.

### Transactions
- **Transfer in / Transfer out** — transfers are now labeled by direction. Outgoing transactions get category `Transfer out`; incoming get `Transfer in`. Both legs of a paired transfer are kept as separate transactions (no deduplication). Unmatched transfer-keyword transactions are also labeled by direction.
- **Transaction type drawer** — debit/credit labels updated to be clearer ("Debit (expense)" / "Credit (income / payment)").

### Income
- **Returns / Refunds KPI** — positive-amount transactions from Chase's "Shopping" or "Merchandise" category are now automatically classified as `Returns`. A dedicated "Returns / Refunds" KPI card appears on the Income tab.
- **Interest Earned KPI** — separate KPI card showing total interest payments detected (by description keyword or category). Income tab is now a 4-column grid.

### Bills
- **No longer blank** — the Bills & Utilities transaction table now uses a broad keyword match (`electric`, `water`, `internet`, `comcast`, `verizon`, `spotify`, `netflix`, etc.) in addition to category tags. Also includes any transaction flagged as a bill or subscription. Shows a clear informational message instead of a blank section when nothing matches.

### Transfers
- **FROM / TO filters** — dropdown filters above the Transfer History table let you filter by source and destination account.
- **Edit drawer** — each transfer row has an Edit button that opens a drawer to update description and notes for both legs of the transfer, same as the Transaction edit experience.

### Data
- **Dataset renaming** — each loaded file in the "Loaded Files" card now shows an editable "Display Name" input. Click "Save Names" to apply; the new name propagates to all charts, tables, and account filters.
- **Save Changes button** — account balance, initial balance, and credit limit inputs no longer auto-save on every keystroke (which was interrupting keyboard input). All fields are now saved together when you click "Save Changes".

---

## [1.2.0] — 2026-04-25

### New Features
- **Local File Storage (File System Access API)** — FinLens can now save all settings, budgets, debts, categories, AI history, and preferences to a `finlens-data.json` file directly on your computer instead of (or alongside) browser localStorage. Survives browser clears, syncs automatically with iCloud/Dropbox, and is readable in any text editor. Requires Chrome, Edge, Arc, or Brave — Safari/Firefox silently fall back to localStorage.

### Changed
- **Settings tab** — added "Local File Storage" card at the top with Connect / Reconnect / Disconnect controls and a live status indicator showing whether data is being written to file or localStorage.
- **API Key warning** — dynamically updates to say "stored in your finlens-data.json file" when file storage is connected, vs. "stored in browser localStorage" when not.
- **Version bump** — footer in Settings now shows v1.2.
- **`init.js`** — IIFE made `async`; calls `await FileStorage.restore()` before the first render so file-backed data is loaded before anything is displayed.

### Technical Details
- **`core.js`** — added `idbGet`/`idbSet`/`idbDel` IndexedDB helpers to persist the `FileSystemDirectoryHandle` across sessions (the only way to survive page reloads without re-prompting the user). Added `FS_STATE_MAP` constant mapping State property names to their localStorage key names. Added `FileStorage` object with `restore()`, `connect()`, `disconnect()`, `load()`, `write()`, and `scheduleWrite()` methods. Modified `lsSet()` to call `FileStorage.scheduleWrite()` whenever file storage is active — zero changes required in any other file.
- **`views-settings.js`** — added `fsConnect()`, `fsReconnect()`, `fsDisconnect()` async button handlers.
- **Debounced writes** — `scheduleWrite()` batches rapid `lsSet` calls into a single file write 400ms after the last change, preventing filesystem thrash.
- **Permission model** — on page load, `queryPermission` is called silently (no user gesture needed). If the browser still has the grant from the previous session, data loads automatically. If the grant expired, the Settings card shows a "Reconnect" button so the user can re-approve with a single click.

### Browser Compatibility
| Browser | Supported |
|---|---|
| Chrome / Arc / Brave | ✅ Full support |
| Edge | ✅ Full support |
| Safari | ❌ Falls back to localStorage |
| Firefox | ❌ Falls back to localStorage |

---

## [1.1.0] — 2026-04-25

### Architecture
- Split monolithic `index.html` into a multi-file structure: `core.js`, `ui.js`, and six view modules (`views-main.js`, `views-plan.js`, `views-invest.js`, `views-forecast.js`, `views-ai.js`, `views-data.js`), plus `views-settings.js` and `init.js` for app boot/wiring.
- All view modules share global scope via the browser's lexical environment (no ES module imports needed).

### New Features
- **Forecast Investments tab** — project portfolio growth with starting amount, monthly contributions, horizon slider, return presets (Conservative 5% / Moderate 8% / Aggressive 11% / Custom), inflation rate adjustment, and a year-by-year nominal vs. real value breakdown table.
- **Data tab** (split from Settings & Data) — dedicated file management screen with manual file-to-account assignment UI, grouped account balance inputs (Checking / Savings / Chase / Other), initial balance fields per account, credit limit labeled by account name, last-used folder display, and an "Add Manual Account" form.
- **Settings tab** (split from Settings & Data) — retains Categories, API Key, Backup & Restore, and Display settings. Added EUR (€) as a currency option. Removed "Load Sample Data" button.
- **Sidebar Refresh button** — "↻ Refresh Data" button above the last-refresh timestamp triggers `reloadDataFiles()` to re-load from the last selected folder.

### Changed
- **Bills & Subs tab** renamed to **Bills**; now shows a bills & utilities transactions table in addition to the recurring calendar.
- **Forecast tab** renamed to **Forecast Savings**; input labels updated: "Checking start" → "Checking Start Balance", "Savings start" → "Savings Start Balance", "Debt start" → "Debt Current Balance".
- **Investing Ideas tab** — added "Suggested %" column to ETF and stock tables, user-editable "My %" allocation inputs (saved to localStorage), "My Portfolio Summary" donut chart (visible when any allocation is set), and a "Recommended Strong Portfolio" section (VTI 40%, VXUS 20%, BND 20%, SCHD 10%, VNQ 5%, VTIP 5%).

### Fixed
- **Ally CSV parsing** — Ally Bank exports use `Date, Time, Amount, Type, Description` headers with a space after each comma. Added `transformHeader: h => h.trim()` to PapaParse config so all Ally transactions now parse correctly instead of being silently dropped.
- **Chart infinite scroll** — all Chart.js instances now use `responsive: true, maintainAspectRatio: false` with explicit pixel heights on `.chart-wrap` containers, preventing layout loops that caused charts to grow unboundedly.
- **Income tab "By Source" chart** — reduced donut to `.chart-wrap.sm` (200px) and moved legend to `position: 'right'` to prevent oversized rendering.
- **Forecast chart/table overflow** — chart container capped at 340px tall; month-by-month table capped at 320px with `overflow-y: auto`.
- **Bills calendar** — made collapsible via CSS `max-height` transition toggled by `.cal-toggle` click handler; same pattern applied to Overview calendar.

### Transactions Tab Enhancements
- Editable description field (saved to localStorage via `txOverrides`).
- Editable transaction type dropdown (debit / credit / transfer).
- Subscription flag checkbox.
- Multi-category support — categories stored as an array; a `get category()` accessor returns the first for backward compatibility.
- Transaction type displayed as colored chips (`.chip.debit` / `.chip.credit` / `.chip.sub`).

### Overview Tab Enhancements
- Top 5 most expensive Chase transactions panel for the selected period.
- Last 5 Ally Checking transactions panel.
- Last 5 Ally Savings transactions panel.
- Bills calendar made collapsible.

---

## [1.0.0] — 2026-04-01

### Initial Release
- Single-file `index.html` dashboard with embedded CSS and JavaScript.
- Tabs: Overview, Transactions, Income, Bills & Subs, Spending, Transfers, Budgeting, Savings Buckets, Debt Tracker, Trends & Insights, Investing Ideas, Forecast, AI Analysis, Settings & Data.
- CSV import for Ally Checking, Ally Savings, and Chase credit card files.
- AI Analysis powered by Claude (Anthropic API key required).
- LocalStorage persistence for budgets, buckets, debts, bills, categories, AI history, manual balances, and settings.
- Light/dark theme toggle.
- Savings forecast simulator with scenario save/load.
- Debt payoff simulator (avalanche vs. snowball).
- Recurring transaction detection.
