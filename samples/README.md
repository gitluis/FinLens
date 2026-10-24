# Sample data

Synthetic CSVs for trying FinLens without real bank exports. **All data here is fake**: no real accounts, people or balances.

| File | Format | What it exercises |
|---|---|---|
| `ally_checking_sample.csv` | Ally Checking | Leading-space headers, bank-assigned `Time`, biweekly payroll, bills, ATM and Zelle |
| `ally_savings_sample.csv` | Ally Savings | Monthly transfers in from checking (paired transfer detection), interest |
| `chase_card_sample.csv` | Chase credit card | Mixed date formats (`YYYY-MM-DD` / `MM/DD/YYYY`), Sale / Payment / Return types, subscriptions, two truly identical rows (occurrence-suffix dedup) |

Coverage: May 1 – Oct 20, 2026.

## Try it

1. Open `index.html` in Chrome, Edge, Arc or Brave.
2. Go to **Settings → Import → Pick a Folder** and choose this `samples/` folder (or **Pick CSV Files** and select all three).
3. Set the date range in the top bar to **All Time** (the data ends Oct 20, 2026).

FinLens will auto-save a `finlens-state.json` into the folder you pick. It's git-ignored, but delete it before sharing the folder.
