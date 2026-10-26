/* ================================================================
   FINLENS — views-eval.js
   AI Eval (developer only — not in the sidebar, like db-inspector).
   Measures whether the dollar amounts and percentages in AI Analysis
   answers are grounded in the data the model was sent.

   Open it from the DevTools console:   showView('ai-eval')

   - Data: only the synthetic CSVs in samples/, verified by SHA-256.
     They are parsed inside a State sandbox that is swapped in and
     restored synchronously (_withSampleState), so the user's own
     data is never read, sent to Claude or overwritten.
   - Requests: callClaude(question, label, { raw:true, summary }) —
     the same request the AI Analysis tab sends, with AI_MODEL and
     the key saved in Settings → General.
   - Results stay in memory (AIEval.*). Nothing is persisted; export
     them with "Download EVAL.md" / "Download results JSON".
   Loaded after views-db.js, before init.js. Method: docs/EVAL.md.
================================================================ */

const AIEval = {
  REPEATS: 3,
  MAX_RETRIES: 3,          // per call, for network errors, timeouts, 429 and 5xx
  CALIBRATION_DRAWS: 10,   // perturbed copies per figure for the chance-match check
  FORECAST_LABEL: /net worth prediction/i,   // AI_PROMPTS label treated as a forecast

  // The only files the eval will read. Hashes are of the committed files (LF line
  // endings). If you change samples/ on purpose, update these — the error shows the new hash.
  SAMPLES: [
    { name: 'ally_checking_sample.csv', sha256: 'bd48cc215c5bb99d0183dc4eadda79288efb739daa5aab33a0bb9d1546773606' },
    { name: 'ally_savings_sample.csv',  sha256: '4e2c73867340c98289fd6b283326cfbd483627b93915361637ca374ab05f99dc' },
    { name: 'chase_card_sample.csv',    sha256: 'fe69c5fe43808f88b21bbcaa25823643246179f83cc3312fe503ac87c9fbf62a' },
  ],

  /* ---------- in-memory state (cleared on reload) ---------- */
  samples: null,      // [{ name, text, sha256 }]
  dataset: null,      // { summary, txCount, accounts, minDate, maxDate } built from the samples
  sampleMsg: null,    // { kind: 'good'|'info'|'warn'|'bad', text }
  needsPick: false,   // fetch() was blocked (file://) — show the file picker
  running: false,
  cancelled: false,
  progress: { done: 0, total: 0, status: '' },
  runs: [],           // [{ prompt, label, question, rep, text, stopReason, usage, ms, attempts, error }]
  meta: null,         // { model, appVersion, startedAt, finishedAt, repeats }
  report: null,       // score() output

  /* ================================================================
     1. SAMPLE DATA
  ================================================================ */

  async loadSamples(fileList) {
    this.sampleMsg = null;
    const texts = {};
    try {
      if (!fileList && location.protocol === 'file:') {
        // Opened from disk: the browser won't let the page read other files on its own (a
        // fetch() would fail with a CORS error in the console), so go straight to the picker.
        this.needsPick = true;
        this.sampleMsg = { kind: 'info', text: 'FinLens is open from a file, so the browser won\'t let it read samples/ on its own. Pick the three CSV files in the samples/ folder below.' };
        return false;
      }
      if (fileList) {
        // Read only files whose names match the samples — anything else is never opened.
        for (const f of Array.from(fileList)) {
          if (this.SAMPLES.some(s => s.name === f.name)) texts[f.name] = await f.text();
        }
      } else {
        for (const s of this.SAMPLES) {
          const res = await fetch('samples/' + s.name, { cache: 'no-store' });
          if (!res.ok) throw new Error(`samples/${s.name}: HTTP ${res.status}`);
          texts[s.name] = await res.text();
        }
      }
    } catch (err) {
      // fetch() failed although FinLens is served over HTTP — fall back to the picker.
      this.needsPick = true;
      this.sampleMsg = { kind: 'warn', text: `Couldn't read samples/ directly (${err.message}). Pick the three CSV files in samples/ below.` };
      return false;
    }

    const samples = [];
    for (const s of this.SAMPLES) {
      if (!(s.name in texts)) {
        this.needsPick = true;
        this.sampleMsg = { kind: 'bad', text: `Missing ${s.name}. Pick all three files in samples/.` };
        return false;
      }
      const text = texts[s.name].replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const sha256 = await this._sha256(text);
      if (sha256 !== s.sha256) {
        this.sampleMsg = { kind: 'bad', text: `${s.name} doesn't match the committed sample (sha256 ${sha256}). The eval only runs on the synthetic files in samples/ — if you changed them on purpose, update AIEval.SAMPLES.` };
        return false;
      }
      samples.push({ name: s.name, text, sha256 });
    }

    this.samples = samples;
    try {
      this.dataset = this.buildDataset();
    } catch (err) {
      console.error('[FinLens] AI Eval: building the sample dataset failed:', err);
      this.dataset = null;
      this.sampleMsg = { kind: 'bad', text: `Couldn't build the sample summary: ${err.message || err}` };
      return false;
    }
    this.needsPick = false;
    this.sampleMsg = { kind: 'good', text: `Loaded and verified ${samples.length} sample files.` };
    return true;
  },

  async _sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // Runs fn() with State replaced by an empty, sample-only state, then restores every key.
  // fn must be synchronous: no other code (renders, saves, lsSet) can run while the sandbox
  // is in place, so the user's data is never mixed with samples, sent, or persisted.
  _withSampleState(fn) {
    const sandbox = {
      transactions: [], accounts: {}, txOverrides: {}, txRules: [], categoryRules: [],
      customSchemas: [], accountLabels: {}, accountOrder: [], manualBalances: {},
      transferKeywords: DEFAULT_TRANSFER_KEYWORDS.slice(),
      debts: [], buckets: [], budgets: [], bills: [], recurringConfirmed: {}, fileMeta: [],
      range: { mode: 'all', start: null, end: null },   // All Time
      selectedAccounts: 'all',
    };
    const saved = {};
    for (const k of Object.keys(sandbox)) { saved[k] = State[k]; State[k] = sandbox[k]; }
    try {
      const out = fn();
      if (out && typeof out.then === 'function') throw new Error('AIEval sandbox callbacks must be synchronous.');
      return out;
    } finally {
      for (const k of Object.keys(saved)) State[k] = saved[k];
    }
  },

  // Same parsing as parseCsvFile() (schema detection, normalizeRow, occurrence suffixes,
  // account ids, detectTransfers) without touching IndexedDB, then buildFinancialSummary().
  buildDataset() {
    return this._withSampleState(() => {
      for (const s of this.samples) {
        const res = Papa.parse(s.text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim() });
        const rows = res.data || [];
        const schema = detectSchema(rows.length ? Object.keys(rows[0]) : [], s.name);
        if (!schema) throw new Error(`No bank schema matched ${s.name}.`);
        const base = s.name.replace(/\.csv$/i, '');
        const acct = schema.id === 'chase'
          ? { id: 'chase_' + base.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: 'Chase (' + base + ')' }
          : schema.id === 'ally_savings' ? { id: 'ally_savings', name: 'Ally Savings' }
          : { id: 'ally_checking', name: 'Ally Checking' };
        State.accounts[acct.id] = { id: acct.id, name: acct.name, kind: schema.id, balance: null, limit: null, sourceFile: s.name };
        const allowSuffix = schema.allowOccurrenceSuffix ?? !schema.columns.time;
        const seen = {};
        for (const r of rows) {
          let tx = normalizeRow(r, schema, acct.id);
          if (!tx) continue;
          const n = seen[tx.id] = (seen[tx.id] || 0) + 1;
          if (n > 1) {
            if (!allowSuffix) continue;
            tx = normalizeRow(r, schema, acct.id, n);
          }
          State.transactions.push(tx);
        }
      }
      State.transactions.sort((a, b) => b.date - a.date);
      detectTransfers();
      const times = State.transactions.map(t => t.date.getTime());
      return {
        summary: buildFinancialSummary(),
        txCount: State.transactions.length,
        accounts: Object.values(State.accounts).map(a => a.name),
        minDate: new Date(Math.min(...times)),
        maxDate: new Date(Math.max(...times)),
      };
    });
  },

  /* ================================================================
     2. RUNNING — 8 prompts × REPEATS through callClaude() raw mode
  ================================================================ */

  async run() {
    if (this.running) return;
    if (!State.apiKey) { alert('Add your Anthropic API key in Settings → General first.'); return; }
    if (!this.dataset || this.dataset.fromFile) { alert('Load the sample data first (↻ Reload samples).'); return; }

    const jobs = [];
    for (let rep = 1; rep <= this.REPEATS; rep++) {
      AI_PROMPTS.forEach(([label, question], prompt) => jobs.push({ prompt, label, question, rep }));
    }
    this.running = true;
    this.cancelled = false;
    this.runs = [];
    this.report = null;
    this.meta = { model: AI_MODEL, maxTokens: AI_MAX_TOKENS, appVersion: this._appVersion(), startedAt: new Date().toISOString(), finishedAt: null, repeats: this.REPEATS };
    this.progress = { done: 0, total: jobs.length, status: 'Starting…' };
    if (State.currentView === 'ai-eval') renderActive();

    let fatal = null;
    try {
      for (const job of jobs) {
        if (this.cancelled) break;
        this._setProgress(`${job.label} — repeat ${job.rep}`);
        const t0 = performance.now();
        let result = null, error = null, attempts = 0;
        while (attempts <= this.MAX_RETRIES && !this.cancelled) {
          attempts++;
          try {
            result = await callClaude(job.question, job.label, { raw: true, summary: this.dataset.summary });
            error = null;
            break;
          } catch (err) {
            error = err;
            const retryable = !err.status || err.status === 429 || err.status >= 500;
            if (!retryable) break;
            if (attempts <= this.MAX_RETRIES) {
              this._setProgress(`${job.label} — repeat ${job.rep} (retry ${attempts} after ${err.status ? 'HTTP ' + err.status : err.name || 'error'})`);
              await new Promise(r => setTimeout(r, 2000 * 2 ** (attempts - 1)));
            }
          }
        }
        this.runs.push({
          ...job,
          text: result ? result.text : null,
          stopReason: result ? result.stopReason : null,
          usage: result ? result.usage : null,
          model: result ? result.model : null,
          ms: Math.round(performance.now() - t0),
          attempts,
          error: error ? this._errText(error) : null,
        });
        this.progress.done++;
        this._setProgress(error ? `failed: ${this._errText(error)}` : 'answered');
        this._renderLog();
        if (error && [400, 401, 403, 404].includes(error.status)) { fatal = this._errText(error); break; }
      }
    } finally {
      this.running = false;
      this.meta.finishedAt = new Date().toISOString();
      this.progress.status = fatal ? `Stopped: ${fatal}` : this.cancelled ? 'Cancelled.' : 'Done.';
      try {
        this.report = this.score(this.runs, this.dataset.summary);
      } catch (err) {
        console.error('[FinLens] AI Eval: scoring failed:', err);
        this.progress.status += ` Scoring failed: ${err.message}`;
      }
      if (State.currentView === 'ai-eval') renderActive();
    }
  },

  _errText(err) {
    const head = err.status ? `HTTP ${err.status}` : (err.name === 'AbortError' ? 'Timed out' : (err.name || 'Error'));
    const detail = err.detail ? ` — ${String(err.detail).slice(0, 200)}` : (err.message && !err.status ? ` — ${err.message}` : '');
    return head + detail;
  },

  _renderLog() {
    const el = $('#evalLog');
    if (!el) return;
    el.innerHTML = this.runs.map(r => `${escapeHtml(r.label)} #${r.rep}: ${r.error ? `<span style="color:var(--red)">${escapeHtml(r.error)}</span>` : `${(r.ms / 1000).toFixed(1)}s${r.attempts > 1 ? ` (${r.attempts} attempts)` : ''}`}`).join('<br>') || 'Waiting for the first answer…';
  },

  _setProgress(status) {
    this.progress.status = status;
    const bar = $('#evalProgressBar');
    if (bar) bar.style.width = `${this.progress.total ? Math.round(100 * this.progress.done / this.progress.total) : 0}%`;
    const st = $('#evalProgressText');
    if (st) st.textContent = `${this.progress.done}/${this.progress.total} done · ${status}`;
  },

  _appVersion() {
    const m = /v(\d+\.\d+\.\d+)\s*·\s*FinLens/.exec(document.body ? document.body.textContent : '');
    return m ? m[1] : 'unknown';
  },

  /* ================================================================
     3. EXTRACTION — every dollar amount and percentage in a text
  ================================================================ */

  // Returns { lines, figures, consts }. A figure is { kind: '$'|'%', value (absolute),
  // neg, raw, line, start, end, round } where `round` is the rounding the written precision
  // implies (half a unit of the last digit shown, capped at 2.5% of the value).
  extract(text) {
    const lines = String(text || '').split('\n');
    const figures = [], consts = [];
    const MULT = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, thousand: 1e3, million: 1e6, billion: 1e9 };
    const NUM = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
    const moneyRe = new RegExp(`(?<![\\w.$])(?:([-−+]))?\\$\\s?(${NUM})(?:\\s?([kKmM])\\b|\\s(thousand|million|billion)\\b)?`, 'g');
    const pctRe = new RegExp(`(?<![\\w.,$])(?:([-−+]))?(\\d+(?:\\.\\d+)?)(?:\\s?%|\\s(?:percentage points?|percent|pts?|pp)\\b)`, 'g');
    const pctRangeRe = new RegExp(`(?<![\\w.,$])(\\d+(?:\\.\\d+)?)\\s?(?:–|—|-|to)\\s?\\d+(?:\\.\\d+)?\\s?%`, 'g');
    const moneyRangeRe = new RegExp(`\\$\\s?${NUM}\\s?([kK])?\\s?(?:–|—|-|to)\\s?(?!\\$)(${NUM})\\s?([kK])?(?![\\d,%]|\\.\\d)`, 'g');
    const constRe = /(?<![\w.,$])(\d+(?:\.\d+)?)(?=\s?(?:months?|mos?\b|years?|yrs?\b|weeks?|paychecks?|periods?)\b)|(?<=[×x*\/÷]\s?)(\d+(?:\.\d+)?)(?![\d.,%])/g;
    const decimals = s => (s.split('.')[1] || '').length;
    const roundOf = (digits, mult, value) => {
      const plain = digits.replace(/,/g, '');
      let unit;
      if (plain.includes('.')) unit = 10 ** -decimals(plain);
      else { const z = (/0+$/.exec(plain) || [''])[0].length; unit = plain === '0' ? 1 : 10 ** z; }
      return Math.min(unit * mult / 2, 0.025 * value);
    };

    lines.forEach((line, li) => {
      const taken = [];
      const add = (f) => {
        if (taken.some(([s, e]) => f.start < e && f.end > s)) return;
        taken.push([f.start, f.end]);
        figures.push(f);
      };
      for (const m of line.matchAll(moneyRe)) {
        const mult = MULT[m[3] || m[4]] || 1;
        const value = parseFloat(m[2].replace(/,/g, '')) * mult;
        add({ kind: '$', value, neg: m[1] === '-' || m[1] === '−', raw: m[0].trim(), line: li, start: m.index, end: m.index + m[0].length, round: roundOf(m[2], mult, value) });
      }
      for (const m of line.matchAll(moneyRangeRe)) {
        // "$200–300": the second number has no "$" of its own
        const digits = m[2], mult = MULT[m[3] || m[1]] || 1;
        const value = parseFloat(digits.replace(/,/g, '')) * mult;
        const start = m.index + m[0].lastIndexOf(digits);
        add({ kind: '$', value, neg: false, raw: '$' + digits + (m[3] || m[1] || ''), line: li, start, end: start + digits.length, round: roundOf(digits, mult, value) });
      }
      for (const m of line.matchAll(pctRe)) {
        const value = parseFloat(m[2]);
        add({ kind: '%', value, neg: m[1] === '-' || m[1] === '−', raw: m[0].trim(), line: li, start: m.index, end: m.index + m[0].length, round: 0.5 * 10 ** -decimals(m[2]) });
      }
      for (const m of line.matchAll(pctRangeRe)) {
        // "10–15%": the first number has no "%" of its own
        add({ kind: '%', value: parseFloat(m[1]), neg: false, raw: m[1] + '%', line: li, start: m.index, end: m.index + m[1].length, round: 0.5 * 10 ** -decimals(m[1]) });
      }
      for (const m of line.matchAll(constRe)) {
        const v = parseFloat(m[1] || m[2]);
        if (v > 0 && v <= 120 && !taken.some(([s, e]) => m.index >= s && m.index < e)) consts.push({ value: v, line: li, start: m.index });
      }
    });
    figures.sort((a, b) => a.line - b.line || a.start - b.start);
    figures.forEach((f, i) => { f.idx = i; });
    return { lines, figures, consts };
  },

  /* ================================================================
     4. THE SUMMARY THE MODEL SAW — facts and derivations
  ================================================================ */

  // Words that name a summary item, for checking that an approximate match is about the
  // same thing: "Food & Drink" → food, drink, dining, restaurant, …
  SYN: {
    housing: ['rent', 'mortgage'], food: ['dining', 'restaurant', 'eating out', 'takeout', 'coffee'],
    groceries: ['grocer', 'supermarket'], shopping: ['retail', 'amazon', 'target'],
    bills: ['utilit', 'electric', 'internet', 'phone'], utilities: ['utilit', 'electric', 'internet', 'phone'],
    gas: ['fuel'], health: ['pharmac', 'medical'], fees: ['atm', 'fee'], travel: ['uber', 'ride', 'transport'],
    income: ['income', 'earn', 'paycheck', 'payroll', 'salary', 'take-home', 'take home'],
    spending: ['spend', 'spent', 'expens', 'outflow'], expense: ['spend', 'spent', 'expens', 'outflow'],
    net: ['net', 'sav', 'left over', 'leftover', 'surplus', 'kept'], cash: ['cash', 'liquid', 'bank', 'checking', 'saving'],
    debt: ['debt', 'owe', 'card', 'credit', 'balance'], worth: ['net worth', 'worth'], rate: ['sav', 'rate'],
    checking: ['checking'], savings: ['saving'], chase: ['chase', 'card', 'credit'], netflix: ['subscription', 'streaming'],
    spotify: ['subscription', 'streaming', 'music'],
  },
  MONTHS: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],

  _nameKeys(name) {
    const words = String(name).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 3 && !['total', 'period', 'top', 'usa', 'com', 'sample'].includes(w));
    return [...new Set(words.flatMap(w => [w, w.slice(0, 5), ...(this.SYN[w] || [])]))];
  },

  // monthKey 'YYYY-MM' at position i of n trend months → words that refer to it
  _monthKeys(key, i, n) {
    const mi = +key.slice(5, 7) - 1;
    const k = [key, this.MONTHS[mi], this.MONTHS[mi].slice(0, 3)];
    if (i === n - 1) k.push('this month', 'current month', 'latest month', 'so far');
    if (i === n - 2) k.push('last month', 'previous month', 'prior month');
    return k;
  },

  // keys = groups of words; every group needs one word present in the context
  _ctxHas(ctx, keys) { return keys.every(group => group.some(k => ctx.includes(k))); },

  // Parses buildFinancialSummary() output. Every $/% figure in it is a fact (for "grounded");
  // the labelled parts feed the derivation candidates.
  parseSummary(summary) {
    const ex = this.extract(summary);
    const monthLines = ex.lines.filter(l => /^\s*-\s*\d{4}-\d{2}:/.test(l)).map(l => /\d{4}-\d{2}/.exec(l)[0]);
    const facts = ex.figures.map(f => {
      const line = ex.lines[f.line];
      // "Total Cash: $1, Total Debt: $2" → "Total Debt"; "- 2026-08: income $1, expense $2" → "2026-08 expense"
      const before = line.slice(0, f.start).trim().replace(/\($/, '').trim().replace(/:$/, '').trim();
      let label = before.split(/,\s/).pop().split(/:\s/).pop().replace(/^-\s*/, '').trim();
      let keys = [this._nameKeys(label)];
      const month = /^\s*-\s*(\d{4}-\d{2}):/.exec(line);
      if (month && label !== month[1]) {
        keys = [this._monthKeys(month[1], monthLines.indexOf(month[1]), monthLines.length), this._nameKeys(label)];
        label = `${month[1]} ${label}`;
      }
      return { kind: f.kind, value: f.value, keys, label: `${label} ${f.neg ? '-' : ''}${f.kind === '$' ? fmt(f.value) : f.value + '%'}`.trim() };
    });
    const S = { facts, cats: [], incomes: [], months: [], subs: [], debts: [] };
    const money = s => { const v = parseFloat(String(s).replace(/[$,]/g, '')); return isNaN(v) ? null : v; };
    let section = null;
    for (const raw of ex.lines) {
      const line = raw.trim();
      let m;
      if ((m = /^Total Cash: (-?\$[\d,.]+), Total Debt: (-?\$[\d,.]+), Net Worth: (-?\$[\d,.]+)/.exec(line))) {
        S.cash = money(m[1]); S.debt = money(m[2]); S.netWorth = money(m[3]);
      } else if ((m = /^Period Income: (-?\$[\d,.]+), Spending: (-?\$[\d,.]+), Savings Rate: (-?[\d.]+)%/.exec(line))) {
        S.income = money(m[1]); S.spending = money(m[2]); S.savingsRate = parseFloat(m[3]);
      } else if (/:$/.test(line)) {
        section = line;
      } else if (line.startsWith('- ') && section) {
        const item = line.slice(2);
        if (section.startsWith('Top spending') && (m = /^(.+): (-?\$[\d,.]+)$/.exec(item))) S.cats.push({ name: m[1], value: money(m[2]) });
        else if (section.startsWith('Top income') && (m = /^(.+): (-?\$[\d,.]+)$/.exec(item))) S.incomes.push({ name: m[1], value: money(m[2]) });
        else if (section.startsWith('Recent monthly') && (m = /^(\d{4}-\d{2}): income (-?\$[\d,.]+), expense (-?\$[\d,.]+), net (-?\$[\d,.]+)$/.exec(item))) S.months.push({ key: m[1], income: money(m[2]), expense: money(m[3]), net: money(m[4]) });
        else if (section.startsWith('Subscriptions') && (m = /^(.+): (-?\$[\d,.]+) (\S+)$/.exec(item))) S.subs.push({ name: m[1], value: money(m[2]), freq: m[3] });
        else if (section.startsWith('Debts') && (m = /^(.+): balance (-?\$[\d,.]+), APR ([\d.]+)%, min pmt (-?\$[\d,.]+)$/.exec(item))) S.debts.push({ name: m[1], balance: money(m[2]), apr: parseFloat(m[3]), min: money(m[4]) });
      } else section = null;
    }
    S.candidates = this._candidates(S);
    return S;
  },

  // Derivations the model might reasonably make from the summary: { kind, value, desc, keys, always }.
  // keys: groups of words, one from each group must appear near the figure (_ctxHas). With
  // always=true they're required for every match — "18%" only counts as Groceries' share of
  // spending when the sentence is about groceries. With always=false (large, specific dollar
  // values) they're needed only when the match relies on the figure's rounding.
  _candidates(S) {
    const out = [];
    const add = (kind, value, desc, keys, always = true) => {
      if (value == null || !isFinite(value)) return;
      out.push({ kind, value: Math.abs(value), desc, keys, always });
    };
    const pctOf = (a, b) => (b ? 100 * a / b : null);
    const W = word => this.SYN[word];
    const I = S.income, E = S.spending, n = S.months.length;
    const AVG = ['avg', 'average', 'typical', 'per month', '/mo', 'monthly', 'a month', 'each month', 'run rate', 'run-rate'];
    const YEAR = ['year', 'annual', '/yr', '12 month', '12-month', '× 12', 'x 12', '* 12', 'pace'];
    const PROJ = ['worth', 'project', 'forecast', '12 month', '12-month', 'year', 'trajectory', 'reach', 'grow', 'end of', 'by '];
    const CHANGE = ['change', 'increase', 'decrease', 'drop', 'rose', 'rise', 'fell', 'fall', 'up ', 'down ', 'more', 'less', 'higher', 'lower', 'jump', 'swing', 'vs', 'versus', 'compared', 'from'];
    const COMBINED = ['top', 'combined', 'together', 'total', 'categor', 'these', 'those', 'largest', 'biggest'];

    // Headline arithmetic
    if (I != null && E != null) {
      add('$', I - E, 'Period income − spending', [[...W('net'), ...W('income')]], false);
      add('%', pctOf(E, I), 'Spending ÷ income', [W('spending')]);
      add('%', pctOf(I - E, I), '(Income − spending) ÷ income', [W('net')]);
    }
    if (S.cash != null && S.debt != null) {
      add('$', S.cash - S.debt, 'Cash − debt', [[...W('worth'), ...W('cash')]], false);
      add('%', pctOf(S.debt, S.cash), 'Debt ÷ cash', [W('debt'), W('cash')]);
      if (I) add('%', pctOf(S.debt, I), 'Debt ÷ period income', [W('debt'), W('income')]);
    }

    // Categories and income sources: shares, prefix totals
    let running = 0;
    S.cats.forEach((c, i) => {
      const keys = [this._nameKeys(c.name)];
      add('%', pctOf(c.value, E), `${c.name} ÷ spending`, keys);
      add('%', pctOf(c.value, I), `${c.name} ÷ income`, keys);
      running += c.value;
      if (i >= 1) {
        add('$', running, `Top ${i + 1} categories combined`, [COMBINED]);
        add('%', pctOf(running, E), `Top ${i + 1} categories ÷ spending`, [COMBINED]);
        add('%', pctOf(running, I), `Top ${i + 1} categories ÷ income`, [COMBINED]);
      }
    });
    S.incomes.forEach(s => add('%', pctOf(s.value, I), `${s.name} ÷ income`, [this._nameKeys(s.name)]));

    // Monthly trend: per-month rates, annualised months, month-over-month changes, averages
    S.months.forEach((m, i) => {
      const mk = this._monthKeys(m.key, i, n);
      add('%', pctOf(m.net, m.income), `${m.key} net ÷ income (savings rate)`, [mk]);
      add('%', pctOf(m.expense, m.income), `${m.key} expense ÷ income`, [mk]);
      add('$', m.income - m.expense, `${m.key} income − expense`, [mk]);
      ['income', 'expense', 'net'].forEach(f => add('$', 12 * m[f], `${m.key} ${f} × 12`, [mk, YEAR]));
    });
    const pairs = [];
    for (let i = 1; i < n; i++) pairs.push([i - 1, i]);
    if (n >= 3) pairs.push([0, n - 1]);
    pairs.forEach(([a, b]) => {
      const A = S.months[a], B = S.months[b];
      const keys = [[...this._monthKeys(A.key, a, n), ...this._monthKeys(B.key, b, n)], CHANGE];
      ['income', 'expense', 'net'].forEach(f => {
        add('$', B[f] - A[f], `${B.key} ${f} − ${A.key} ${f}`, keys);
        add('%', pctOf(B[f] - A[f], A[f]), `% change in ${f}, ${A.key} → ${B.key}`, keys);
      });
      const ra = pctOf(A.net, A.income), rb = pctOf(B.net, B.income);
      if (ra != null && rb != null) add('%', rb - ra, `Savings-rate change ${A.key} → ${B.key} (pts)`, keys);
    });
    const avgOf = (ms, f) => ms.reduce((s, m) => s + m[f], 0) / ms.length;
    const windows = [];
    if (n >= 2) windows.push(S.months);
    if (n >= 3) windows.push(S.months.slice(-2));
    windows.forEach(ms => {
      const tag = `${ms.length}-month avg`;
      const aI = avgOf(ms, 'income'), aE = avgOf(ms, 'expense'), aN = avgOf(ms, 'net');
      add('$', aI, `${tag} income`, [AVG]); add('$', aE, `${tag} expense`, [AVG]); add('$', aN, `${tag} net`, [AVG]);
      add('$', 12 * aI, `${tag} income × 12`, [YEAR], false);
      add('$', 12 * aE, `${tag} expense × 12`, [YEAR], false);
      add('$', 12 * aN, `${tag} net × 12`, [YEAR], false);
      add('%', pctOf(aN, aI), `${tag} net ÷ income`, [AVG]);
      if (S.netWorth != null) add('$', S.netWorth + 12 * aN, `Net worth + 12 × ${tag} net`, [PROJ], false);
      if (S.cash != null) add('$', S.cash + 12 * aN, `Cash + 12 × ${tag} net`, [PROJ], false);
    });
    if (n && S.netWorth != null) {
      const last = S.months[n - 1];
      add('$', S.netWorth + 12 * last.net, `Net worth + 12 × ${last.key} net`, [PROJ], false);
    }

    // Subscriptions and debts
    let subTotal = 0;
    S.subs.forEach(s => {
      subTotal += s.value;
      add('$', 12 * s.value, `${s.name} × 12`, [[...this._nameKeys(s.name), 'subscription'], YEAR]);
    });
    if (S.subs.length > 1) {
      const k = [['subscription', 'streaming', 'total', 'combined', 'together', 'both', 'all']];
      add('$', subTotal, 'Subscriptions combined', k);
      add('$', 12 * subTotal, 'Subscriptions combined × 12', k);
    }
    S.debts.forEach(d => add('$', d.balance * d.apr / 1200, `${d.name} monthly interest`, [[...this._nameKeys(d.name), 'interest']]));
    return out;
  },

  /* ================================================================
     5. CLASSIFICATION
     grounded    matches a figure in the summary (±$1 / ±0.5 pts, or the rounding the
                 figure's own precision implies — "$4.5K" may stand for $4,512.37)
     derived     arithmetic on summary figures, verified in code: an explicit equation in
                 the answer, arithmetic on anchored figures in the same line, or one of the
                 standard derivations in _candidates() (with its context words nearby)
     math-error  an explicit "a op b = c" in the answer whose arithmetic doesn't hold
     forecast    the forecast prompt only: projections that can't be verified (per spec,
                 counted as derived, never unsupported)
     unsupported none of the above
  ================================================================ */

  _tol(f, mode) {
    const money = f.kind === '$';
    switch (mode) {
      case 'base':     return money ? 1 : 0.5;                                              // the spec: ±$1 / ±0.5 pts
      case 'grounded': return Math.max(money ? 1 : 0.5, f.round);                           // + the figure's own rounding
      // derivations: + rounded intermediate steps. A derived percentage is held to the precision
      // it's written with ("49.3%" ±0.15, "49%" ±0.5) — percentages are dense, so a flat ±0.5
      // would accept many wrong ones.
      case 'tight':    return money ? Math.max(1, 0.0025 * f.value) : Math.max(0.15, f.round);
      case 'derived':  return money ? Math.max(1, 0.0025 * f.value, f.round) : Math.max(0.15, f.round);
      default:         return Math.max(money ? Math.max(1, 0.005 * f.value) : 0.5, f.round); // 'equation': the model's own arithmetic
    }
  },

  // Grounded = matches a summary figure within ±$1 / ±0.5 pts (the spec). To keep coincidences
  // out, a match must be named nearby (the fact's own words — "income" and "September") unless
  // it is unambiguous: identical to the cent / to 0.1 pt, or a dollar amount of $100+ within $1.
  // A match that needs the figure's rounding ("$5K" for $4,904.15) must always be named.
  // mode 'strict' is the literal spec: ±$1 / ±0.5 pts against any figure, no other rules.
  _grounded(f, S, mode, ctx) {
    const pick = (tol, named) => {
      let best = null;
      for (const fact of S.facts) {
        if (fact.kind !== f.kind) continue;
        const d = Math.abs(fact.value - f.value);
        if (d > tol || (best && d >= best.d)) continue;
        if (named && !named(fact, d)) continue;
        best = { d, fact };
      }
      return best && best.fact.label;
    };
    const base = this._tol(f, 'base');
    if (mode === 'strict') return pick(base, null);
    const identical = d => d <= (f.kind === '$' ? 0.005 : 0.05) + 1e-9;
    const close = pick(base, (fact, d) => identical(d) || (f.kind === '$' && f.value >= 100) || this._ctxHas(ctx, fact.keys));
    if (close) return close;
    const rounded = pick(this._tol(f, 'grounded'), fact => this._ctxHas(ctx, fact.keys));
    return rounded ? `${rounded} (rounded)` : null;
  },

  // For a Markdown table row: { header, column } — the table's header row and the header
  // cell above f's column. In a table the header names what a cell is ("Sep", "Benchmark").
  _tableHeader(ex, f) {
    const lines = ex.lines, row = lines[f.line];
    if (!/^\s*\|/.test(row)) return null;
    let i = f.line;
    while (i > 0 && /^\s*\|/.test(lines[i - 1])) i--;
    if (i === f.line) return null;                     // f is in the header row itself
    const header = lines[i];
    const col = (row.slice(0, f.start).match(/\|/g) || []).length;   // 1 = first cell
    const cells = header.split('|');
    return { header, column: (cells[col] || '').trim() };
  },

  _context(ex, f) {
    const lines = ex.lines, parts = [lines[f.line]];
    const tbl = this._tableHeader(ex, f);
    if (tbl) parts.push(tbl.column);
    for (let i = f.line - 1; i >= 0; i--) { if (lines[i].trim()) { parts.push(lines[i]); break; } }
    for (let i = f.line - 1; i >= 0; i--) { if (/^\s*(#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)/.test(lines[i])) { parts.push(lines[i]); break; } }
    return parts.join(' \n ').toLowerCase();
  },

  _structured(f, S, ctx) {
    const tight = this._tol(f, 'tight'), loose = this._tol(f, 'derived');
    let best = null;
    for (const c of S.candidates) {
      if (c.kind !== f.kind) continue;
      const d = Math.abs(c.value - f.value);
      if (d > loose || (best && d >= best.d)) continue;
      if ((c.always || d > tight) && !this._ctxHas(ctx, c.keys)) continue;
      best = { d, c };
    }
    return best ? best.c.desc + (best.d > tight ? ' (rounded)' : '') : null;
  },

  // Explicit arithmetic: "<expr> = <figure>" (also ≈). Returns { ok, desc } or null if the
  // figure isn't the result of a parseable expression with at least one operator.
  _equation(f, ex) {
    const line = ex.lines[f.line];
    const before = line.slice(0, f.start);
    const eq = /(=|≈|≅)\s*(?:~|about|approx\.?|roughly)?\s*(?:\*\*)?\s*$/.exec(before);
    if (!eq) return null;
    const lhsAll = before.slice(0, eq.index);
    const cut = Math.max(lhsAll.lastIndexOf('='), lhsAll.lastIndexOf('≈'), lhsAll.lastIndexOf('→'), lhsAll.lastIndexOf(':'), lhsAll.lastIndexOf('|'), lhsAll.lastIndexOf(';'));
    let lhsStart = cut + 1;
    // A list marker at the start of the line ("- ", "* ", "1. ") isn't an operator.
    const marker = cut < 0 && /^\s*(?:[-*+•]|\d+[.)])\s+/.exec(lhsAll);
    if (marker) lhsStart += marker[0].length;
    const lhs = lhsAll.slice(lhsStart);
    const toks = this._tokens(lhs, lhsStart, f.line, ex);
    if (!toks || toks.filter(t => t.t === 'op').length < 1) return null;
    const val = this._evaluate(toks);
    if (val == null || !isFinite(val)) return null;
    const tol = this._tol(f, 'equation');
    // A percentage result may be written as a ratio ("a ÷ b = 48%") or already ×100.
    const cands = f.kind === '%' ? [val, 100 * val] : [val];
    const ok = cands.some(v => Math.abs(Math.abs(v) - f.value) <= tol);
    const shown = f.kind === '%' && Math.abs(val) <= 1.5 ? 100 * val : val;
    return {
      ok,
      operands: toks.filter(t => t.t === 'num' && t.fig).map(t => t.fig),
      desc: `${lhs.replace(/\*\*/g, '').trim()} = ${f.raw}${ok ? '' : ` (actually ${Math.round(Math.abs(shown) * 100) / 100}${f.kind === '%' ? '%' : ''})`}`,
    };
  },

  // Tokenises an arithmetic expression, dropping words ("$2,057 net × 12 months").
  _tokens(s, offset, lineIdx, ex) {
    const toks = [];
    const re = /\$?\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s?(?:[kKmM]\b|%)?|[+\-−–×x*\/÷()]/g;
    for (const m of s.matchAll(re)) {
      const t = m[0].trim();
      if (/^[+\-−–×x*\/÷()]$/.test(t)) {
        const prevCh = s[m.index - 1] || '', nextCh = s[m.index + 1] || '';
        if (t === 'x' && (!/\s|\d|\)/.test(prevCh) || /[a-z]/i.test(nextCh))) continue;   // the letter x in a word
        if ((t === '-' || t === '–') && /[a-z]/i.test(prevCh)) continue;                    // hyphenated words
        if (t === '/' && /[a-z]/i.test(nextCh)) continue;                                    // a unit: $2,057/mo
        toks.push({ t: t === '(' || t === ')' ? t : 'op', v: { '−': '-', '–': '-', '×': '*', x: '*', '÷': '/' }[t] || t });
      } else {
        let v = parseFloat(t.replace(/[$,%\s]/g, '').replace(/[kKmM]$/, ''));
        if (/[kK]$/.test(t)) v *= 1e3; else if (/[mM]$/.test(t)) v *= 1e6;
        if (t.endsWith('%')) v /= 100;
        const pos = offset + m.index;
        const fig = ex.figures.find(g => g.line === lineIdx && pos >= g.start - 1 && pos < g.end);
        toks.push({ t: 'num', v, fig });
      }
    }
    // Drop parentheses that open before the expression ("(12 × $2,057 = …") or never close.
    const stack = [];
    toks.forEach((t, i) => { if (t.t === '(') stack.push(i); else if (t.t === ')') { if (stack.length) stack.pop(); else t.drop = true; } });
    stack.forEach(i => { toks[i].drop = true; });
    for (let i = toks.length - 1; i >= 0; i--) if (toks[i].drop) toks.splice(i, 1);
    // must alternate num / op (parens allowed); trim leading/trailing operators
    while (toks.length && toks[0].t === 'op' && toks[0].v !== '-') toks.shift();
    while (toks.length && toks[toks.length - 1].t === 'op') toks.pop();
    let prev = null;
    for (const t of toks) {
      if (t.t === 'num' && prev && (prev.t === 'num' || prev.t === ')')) return null;
      if (t.t === 'op' && prev && (prev.t === 'op' || prev.t === '(') && t.v !== '-') return null;
      prev = t;
    }
    return toks.length ? toks : null;
  },

  _evaluate(toks) {
    let i = 0;
    const peek = () => toks[i];
    const expr = () => {
      let v = term();
      while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) { const op = toks[i++].v; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    };
    const term = () => {
      let v = factor();
      while (peek() && peek().t === 'op' && (peek().v === '*' || peek().v === '/')) { const op = toks[i++].v; const r = factor(); v = op === '*' ? v * r : v / r; }
      return v;
    };
    const factor = () => {
      const t = toks[i++];
      if (!t) throw new Error('eof');
      if (t.t === 'num') return t.v;
      if (t.t === 'op' && t.v === '-') return -factor();
      if (t.t === '(') { const v = expr(); if (!peek() || peek().t !== ')') throw new Error('paren'); i++; return v; }
      throw new Error('token');
    };
    try { const v = expr(); return i === toks.length ? v : null; } catch (e) { return null; }
  },

  // Arithmetic on other figures in the same line: a±b, a×p%, a×(1±p%), a÷b, a×/÷ a constant.
  // At least one operand must be anchored in the data — `ok(g)` says whether g is grounded or
  // derived without depending on f itself (so "20%" can't be justified by the "$131.70" that
  // was computed from it). Returns { desc, ops } or null.
  _local(f, ex, ok) {
    const tol = this._tol(f, 'derived');
    const near = (v) => Math.abs(Math.abs(v) - f.value) <= tol;
    const others = ex.figures.filter(g => g.line === f.line && g.idx !== f.idx);
    const consts = ex.consts.filter(c => c.line === f.line).map(c => c.value).concat([12]);
    const money = others.filter(g => g.kind === '$'), pcts = others.filter(g => g.kind === '%');
    const hit = (desc, ...ops) => ({ desc, ops: ops.map(g => g.idx) });
    if (f.kind === '$') {
      for (const a of money) for (const b of money) {
        if (a.idx >= b.idx || !(ok(a) || ok(b))) continue;
        if (near(a.value + b.value)) return hit(`${a.raw} + ${b.raw}`, a, b);
        if (near(a.value - b.value)) return hit(`${a.raw} − ${b.raw}`, a, b);
      }
      for (const a of money) for (const p of pcts) {
        if (!ok(a)) continue;
        const r = p.value / 100;
        if (near(a.value * r)) return hit(`${a.raw} × ${p.raw}`, a, p);
        if (near(a.value * (1 - r))) return hit(`${a.raw} × (1 − ${p.raw})`, a, p);
        if (near(a.value * (1 + r))) return hit(`${a.raw} × (1 + ${p.raw})`, a, p);
      }
      for (const a of money) for (const c of consts) {
        if (!ok(a)) continue;
        if (near(a.value * c)) return hit(`${a.raw} × ${c}`, a);
        if (near(a.value / c)) return hit(`${a.raw} ÷ ${c}`, a);
      }
    } else {
      for (const a of money) for (const b of money) {
        if (a.idx === b.idx || !b.value || !(ok(a) && ok(b))) continue;
        if (near(100 * a.value / b.value)) return hit(`${a.raw} ÷ ${b.raw}`, a, b);
        if (a.idx < b.idx && near(100 * (b.value - a.value) / a.value)) return hit(`change ${a.raw} → ${b.raw}`, a, b);
      }
      for (const a of pcts) for (const b of pcts) {
        if (a.idx >= b.idx || !(ok(a) && ok(b))) continue;
        if (near(b.value - a.value)) return hit(`${b.raw} − ${a.raw}`, a, b);
      }
    }
    return null;
  },

  // A figure that repeats an earlier anchored figure in the same answer ("$112" again in the
  // final sum, "~$40,300" for an earlier "$40,296") takes that figure's class.
  // Same figure up to the precision either is written with: "$40,300" ~ "$40,296", "49%" ~ "49.3%",
  // but not "0.4 pts" ~ "-0.1%" (a flat ±0.5 pts would accept that).
  _restated(f, ex, ok) {
    return ex.figures.find(g => {
      if (g.idx >= f.idx || g.kind !== f.kind || !ok(g)) return false;
      const tol = Math.max(f.kind === '$' ? 1 : 0, f.round, g.round) + 1e-9;
      return Math.abs(g.value - f.value) <= tol;
    }) || null;
  },

  // ok(g) for target f: g is grounded/derived and its derivation doesn't rest on f.
  _anchoredFor(f, cls, deps) {
    return g => (cls[g.idx] === 'grounded' || cls[g.idx] === 'derived') && !(deps[g.idx] && deps[g.idx].has(f.idx));
  },

  // Classifies every figure in one answer. Returns { ex, figures } with each figure's
  // { cls, how, deps } (deps: figures its derivation used, transitively).
  classifyText(text, S, isForecast, mode = 'normal') {
    const ex = this.extract(text);
    const cls = {}, how = {}, eqs = {}, deps = {};
    const ctx = f => this._context(ex, f);
    const depend = (f, ops) => { deps[f.idx] = new Set(ops.flatMap(i => [i, ...(deps[i] || [])])); };
    // 1. grounded — the figure is in the summary
    for (const f of ex.figures) {
      const g = this._grounded(f, S, mode === 'strict' ? 'strict' : 'grounded', ctx(f));
      if (g) { cls[f.idx] = 'grounded'; how[f.idx] = g; }
    }
    // 2. an explicit equation decides when the answer shows its math: wrong arithmetic is a
    //    math error even if the number happens to sit near some other derivation
    for (const f of ex.figures) {
      if (cls[f.idx]) continue;
      const e = eqs[f.idx] = this._equation(f, ex);
      if (e && !e.ok) { cls[f.idx] = 'math-error'; how[f.idx] = `explicit: ${e.desc}`; }
    }
    // 3. standard derivations of the summary (with their context words)
    for (const f of ex.figures) {
      if (cls[f.idx]) continue;
      const d = this._structured(f, S, ctx(f));
      if (d) { cls[f.idx] = 'derived'; how[f.idx] = d; }
    }
    // 4. correct equations and same-line arithmetic on anchored figures, repeated so chains resolve
    for (let round = 0; round < 3; round++) {
      let changed = false;
      for (const f of ex.figures) {
        if (cls[f.idx]) continue;
        const ok = this._anchoredFor(f, cls, deps);
        const prior = this._restated(f, ex, ok);
        if (prior) { cls[f.idx] = cls[prior.idx]; how[f.idx] = `restates ${prior.raw}: ${how[prior.idx]}`; depend(f, [prior.idx]); changed = true; continue; }
        const e = eqs[f.idx];
        if (e && e.ok && e.operands.some(ok)) {
          cls[f.idx] = 'derived'; how[f.idx] = `explicit: ${e.desc}`; depend(f, e.operands.map(g => g.idx)); changed = true; continue;
        }
        const l = this._local(f, ex, ok);
        if (l) { cls[f.idx] = 'derived'; how[f.idx] = `same line: ${l.desc}`; depend(f, l.ops); changed = true; }
      }
      if (!changed) break;
    }
    // 5. what's left
    for (const f of ex.figures) {
      if (cls[f.idx]) continue;
      const e = eqs[f.idx];
      const note = e ? `explicit, inputs not in the data: ${e.desc}` : '';
      if (isForecast) { cls[f.idx] = 'forecast'; how[f.idx] = note || 'forecast assumption / projection'; }
      else { cls[f.idx] = 'unsupported'; how[f.idx] = note; }
    }
    return { ex, deps, figures: ex.figures.map(f => ({ ...f, cls: cls[f.idx], how: how[f.idx] })) };
  },

  // The sentence (or table cell) holding f, plus the nearest heading above — for tagging.
  _sentence(ex, f) {
    const line = ex.lines[f.line];
    const cuts = [...line.slice(0, f.start).matchAll(/[.!?;]\s+|\s[—–]\s|\|/g)];
    const s = cuts.length ? cuts[cuts.length - 1].index + cuts[cuts.length - 1][0].length : 0;
    const endM = /[.!?;](\s|$)|\s[—–]\s|\|/.exec(line.slice(f.end));
    const e = endM ? f.end + endM.index : line.length;
    let heading = '';
    for (let i = f.line - 1; i >= 0; i--) { if (/^\s*(#{1,6}\s|\*\*[^*]+\*\*\s*:?\s*$)/.test(ex.lines[i])) { heading = ex.lines[i]; break; } }
    const tbl = this._tableHeader(ex, f);
    return (line.slice(s, e) + ' \n ' + (tbl ? tbl.column + ' \n ' : '') + heading).toLowerCase();
  },

  // Rough reading of why an unsupported figure is there (keyword heuristic, for the report).
  _tag(ctx) {
    if (/benchmark|guideline|rule of thumb|50\/30\/20|typical|experts?|national average|average (american|household|person)|recommended (range|level)|standard advice|(most|many) (people|advisors)/.test(ctx)) return 'benchmark';
    if (/\b(assum|estimat|project|scenario|if you|would|could|hypothetical)/.test(ctx)) return 'assumption';
    if (/\b(target|goal|budget|limit|allocat|should|consider|recommend|suggest|reduce|emergency fund|set aside|set up|redirect|boost|automat)|\b(aim(s|ing)?|cap(s|ped|ping)?|try|trying|cut(s|ting)?|trim(s|med|ming)?|plan(s|ned|ning)?|keep|move|saves?)\b/.test(ctx)) return 'advice/target';
    return 'claim about the data';
  },

  _excerpt(ex, f) {
    const line = ex.lines[f.line];
    const s = Math.max(0, f.start - 70), e = Math.min(line.length, f.end + 70);
    const ws = t => t.replace(/\s+/g, ' ');   // collapse per piece, so positions don't shift
    return ((s > 0 ? '…' : '') + ws(line.slice(s, f.start)) + '⟦' + line.slice(f.start, f.end) + '⟧' + ws(line.slice(f.end, e)) + (e < line.length ? '…' : '')).trim();
  },

  /* ================================================================
     6. SCORING
  ================================================================ */

  CLASSES: ['grounded', 'derived', 'math-error', 'forecast', 'unsupported'],

  _tally(figs) {
    const t = { n: figs.length };
    this.CLASSES.forEach(c => { t[c] = figs.filter(f => f.cls === c).length; });
    t.pct = c => (t.n ? 100 * t[c] / t.n : 0);
    return t;
  },

  score(runs, summary) {
    const S = this.parseSummary(summary);
    const forecastIdx = AI_PROMPTS.findIndex(([label]) => this.FORECAST_LABEL.test(label));
    const rows = runs.filter(r => r.text != null).map(r => {
      const { ex, deps, figures } = this.classifyText(r.text, S, r.prompt === forecastIdx);
      const strict = this.classifyText(r.text, S, r.prompt === forecastIdx, 'strict').figures;
      figures.forEach((f, i) => {
        f.excerpt = this._excerpt(ex, f);
        f.strictCls = strict[i].cls;
        if (f.cls === 'unsupported') f.tag = this._tag(this._sentence(ex, f));
      });
      return { prompt: r.prompt, label: r.label, rep: r.rep, figures, ex, deps };
    });
    const all = rows.flatMap(r => r.figures);
    const byPrompt = AI_PROMPTS.map(([label], i) => {
      const rs = rows.filter(r => r.prompt === i);
      return { prompt: i, label, runs: rs.length, forecast: i === forecastIdx, ...this._tally(rs.flatMap(r => r.figures)) };
    });
    const byRep = [];
    for (let rep = 1; rep <= this.REPEATS; rep++) {
      const rs = rows.filter(r => r.rep === rep);
      if (rs.length) byRep.push({ rep, runs: rs.length, ...this._tally(rs.flatMap(r => r.figures)) });
    }
    const strictAll = this._tally(all.map(f => ({ cls: f.strictCls })));
    const failures = [];
    rows.forEach(r => r.figures.forEach(f => {
      if (f.cls === 'unsupported' || f.cls === 'math-error') failures.push({ prompt: r.prompt, label: r.label, rep: r.rep, cls: f.cls, raw: f.raw, tag: f.tag || '', how: f.how || '', excerpt: f.excerpt });
    }));
    const tags = {};
    failures.filter(x => x.cls === 'unsupported').forEach(x => { tags[x.tag] = (tags[x.tag] || 0) + 1; });
    return {
      summaryFacts: S.facts.length, candidates: S.candidates.length, forecastPrompt: forecastIdx,
      overall: this._tally(all), byKind: { '$': this._tally(all.filter(f => f.kind === '$')), '%': this._tally(all.filter(f => f.kind === '%')) },
      strict: strictAll, byPrompt, byRep, failures, tags,
      runsScored: rows.length, runsFailed: runs.filter(r => r.text == null).length,
      truncated: runs.filter(r => AI_CUT_OFF_REASONS.includes(r.stopReason)).length,
      tokens: this._tokenStats(runs),
      calibration: this._calibrate(rows, S, forecastIdx),
      rows: rows.map(r => ({ prompt: r.prompt, label: r.label, rep: r.rep, figures: r.figures.map(f => ({ raw: f.raw, kind: f.kind, value: f.value, cls: f.cls, strictCls: f.strictCls, how: f.how, tag: f.tag, excerpt: f.excerpt })) })),
    };
  },

  // Output tokens per answer, and how many went to thinking (it counts toward max_tokens but
  // isn't shown). maxTokens: the run's own setting, or for runs before v1.10.1 (which didn't
  // record it) the size every cut-off answer stopped at.
  _tokenStats(runs) {
    const ok = runs.filter(r => r.usage && r.usage.output_tokens != null);
    const think = ok.filter(r => r.usage.output_tokens_details && r.usage.output_tokens_details.thinking_tokens != null);
    const avg = xs => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    const cut = ok.filter(r => AI_CUT_OFF_REASONS.includes(r.stopReason)).map(r => r.usage.output_tokens);
    return {
      maxTokens: (this.meta && this.meta.maxTokens) || (cut.length && cut.every(t => t === cut[0]) ? cut[0] : null),
      output: avg(ok.map(r => r.usage.output_tokens)),
      thinking: think.length === ok.length ? avg(think.map(r => r.usage.output_tokens_details.thinking_tokens)) : null,
      thinkingCut: avg(think.filter(r => AI_CUT_OFF_REASONS.includes(r.stopReason)).map(r => r.usage.output_tokens_details.thinking_tokens)),
    };
  },

  // Chance-match check: perturb every non-forecast figure by ±3–25% (seeded) and re-classify
  // it in place. The share still counted as grounded/derived estimates how often the matcher
  // would accept a wrong number — the false-positive rate behind the headline.
  _calibrate(rows, S, forecastIdx) {
    let seed = 20261024;
    const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const out = { draws: 0, grounded: 0, derived: 0, byKind: { '$': { draws: 0, hit: 0 }, '%': { draws: 0, hit: 0 } } };
    for (const r of rows) {
      if (r.prompt === forecastIdx) continue;
      const cls = {};
      r.figures.forEach(f => { cls[f.idx] = f.cls; });
      for (const f of r.figures) {
        for (let k = 0; k < this.CALIBRATION_DRAWS; k++) {
          const delta = (0.03 + 0.22 * rand()) * (rand() < 0.5 ? -1 : 1);
          const g = { ...f, value: f.value * (1 + delta) };
          const ex = { ...r.ex, figures: r.ex.figures.map(x => (x.idx === f.idx ? g : x)) };
          // same order as classifyText()
          const ctx = this._context(ex, g), ok = this._anchoredFor(g, cls, r.deps);
          let hit = null;
          if (this._grounded(g, S, 'grounded', ctx)) hit = 'grounded';
          else {
            const e = this._equation(g, ex);
            if (e && !e.ok) hit = null;
            else if (this._structured(g, S, ctx)) hit = 'derived';
            else if (this._restated(g, ex, ok)) hit = 'derived';
            else if (e && e.ok && e.operands.some(ok)) hit = 'derived';
            else if (this._local(g, ex, ok)) hit = 'derived';
          }
          out.draws++;
          out.byKind[f.kind].draws++;
          if (hit) { out[hit]++; out.byKind[f.kind].hit++; }
        }
      }
    }
    out.rate = out.draws ? 100 * (out.grounded + out.derived) / out.draws : 0;
    Object.values(out.byKind).forEach(k => { k.rate = k.draws ? 100 * k.hit / k.draws : 0; });
    return out;
  },

  /* ================================================================
     7. EXPORT
  ================================================================ */

  headline(rep) {
    const o = rep.overall, p = c => o.pct(c).toFixed(1);
    const runs = rep.runsScored;
    const repeats = (this.meta && this.meta.repeats) || this.REPEATS;
    return `Across ${runs} AI Analysis runs (${AI_PROMPTS.length} prompts × ${repeats}) on synthetic data, ` +
      `${p('grounded')}% of the ${o.n} dollar and percentage figures matched the data sent to the model and ` +
      `${p('derived')}% were arithmetic on it verified in code (${(o.pct('grounded') + o.pct('derived')).toFixed(1)}% traceable); ` +
      `${p('unsupported')}% were unsupported` +
      (o['math-error'] ? `, ${p('math-error')}% were math errors` : '') +
      (o.forecast ? `; a further ${p('forecast')}% were forecast assumptions in the 12-month projection, treated as derived rather than unsupported but not verifiable` : '') + '.';
  },

  _cell(t, c) { return t[c] ? `${t[c]} (${t.pct(c).toFixed(1)}%)` : '0'; },

  toJSON() {
    const rep = this.report;
    return JSON.stringify({
      kind: 'finlens-ai-eval', version: 1,
      meta: this.meta,
      dataset: {
        files: (this.samples || []).map(s => ({ name: s.name, sha256: s.sha256 })),
        range: 'All Time', txCount: this.dataset && this.dataset.txCount,
        minDate: this.dataset && dayjs(this.dataset.minDate).format('YYYY-MM-DD'),
        maxDate: this.dataset && dayjs(this.dataset.maxDate).format('YYYY-MM-DD'),
        summary: this.dataset && this.dataset.summary,
      },
      prompts: AI_PROMPTS.map(([label, question]) => ({ label, question })),
      runs: this.runs,
      results: rep ? {
        headline: this.headline(rep),
        overall: this._plain(rep.overall), strict: this._plain(rep.strict),
        byPrompt: rep.byPrompt.map(t => ({ label: t.label, ...this._plain(t) })),
        byRep: rep.byRep.map(t => ({ rep: t.rep, ...this._plain(t) })),
        calibration: rep.calibration, tags: rep.tags, figures: rep.rows,
      } : null,
    }, null, 2);
  },

  _plain(t) { const o = { n: t.n }; this.CLASSES.forEach(c => { o[c] = t[c]; }); return o; },

  // Loads a results JSON exported earlier and re-scores it (no API calls).
  async loadResults(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.kind !== 'finlens-ai-eval' || !Array.isArray(data.runs) || !data.dataset || !data.dataset.summary) throw new Error('Not a FinLens AI Eval results file.');
      const files = data.dataset.files || [];
      const okData = this.SAMPLES.every(s => files.some(f => f.name === s.name && f.sha256 === s.sha256));
      if (!okData) throw new Error('This results file was not produced from the committed samples/.');
      // Re-scoring maps runs to AI_PROMPTS by index (labels, the forecast prompt), so the run
      // must have used the prompts this build has.
      const samePrompts = Array.isArray(data.prompts) && data.prompts.length === AI_PROMPTS.length &&
        data.prompts.every((p, i) => p.label === AI_PROMPTS[i][0] && p.question === AI_PROMPTS[i][1]);
      if (!samePrompts) throw new Error('These results were produced with different AI_PROMPTS than this version of FinLens. Run the eval again.');
      if (!data.meta || !data.meta.model || !data.meta.repeats) throw new Error('The results file is missing its run details (meta).');
      this.meta = data.meta; this.runs = data.runs;
      this.samples = files.map(f => ({ name: f.name, sha256: f.sha256, text: null }));
      // fromFile: the summary came from the JSON, not from verified samples — it can be
      // re-scored locally but never sent to Claude (Run stays disabled until samples reload).
      this.dataset = { fromFile: true, summary: data.dataset.summary, txCount: data.dataset.txCount, accounts: [], minDate: new Date(data.dataset.minDate + 'T00:00:00'), maxDate: new Date(data.dataset.maxDate + 'T00:00:00') };
      this.report = this.score(this.runs, this.dataset.summary);
      this.progress = { done: this.runs.length, total: this.runs.length, status: `Re-scored ${file.name}.` };
      this.sampleMsg = { kind: 'good', text: `Loaded results from ${file.name} (run ${dayjs(this.meta.startedAt).format('MMM D, YYYY h:mm A')}).` };
    } catch (err) {
      this.sampleMsg = { kind: 'bad', text: `Couldn't load results: ${err.message}` };
    }
    renderActive();
  },

  toMarkdown() {
    const rep = this.report, meta = this.meta, ds = this.dataset;
    // Model text goes into Markdown table cells: escape pipes, newlines and HTML.
    const pipe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const L = [];
    const o = rep.overall;
    L.push('# AI Analysis grounding eval', '');
    L.push(`> ${this.headline(rep)}`, '');
    L.push('| | |', '|---|---|');
    L.push(`| Model | \`${meta.model}\` (\`AI_MODEL\` in \`js/views-ai.js\`) |`);
    const utc = iso => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');   // same text wherever it's re-scored
    L.push(`| Run | ${utc(meta.startedAt)} – ${utc(meta.finishedAt).slice(11)} UTC, FinLens v${meta.appVersion} |`);
    L.push(`| Calls | ${AI_PROMPTS.length} prompts × ${meta.repeats} repeats = ${AI_PROMPTS.length * meta.repeats} (${rep.runsScored} answered${rep.runsFailed ? `, ${rep.runsFailed} failed` : ''}${rep.truncated ? `, ${rep.truncated} cut off at max_tokens` : ''}); \`max_tokens\` ${rep.tokens.maxTokens || 'not recorded'}, default temperature |`);
    if (rep.tokens.output != null) L.push(`| Tokens | ${rep.tokens.output} output tokens per answer on average${rep.tokens.thinking != null ? `, of which ${rep.tokens.thinking} thinking (not shown, but counted toward \`max_tokens\`)${rep.tokens.thinkingCut != null ? `; ${rep.tokens.thinkingCut} in the answers that were cut off` : ''}` : ''} |`);
    L.push(`| Data | \`samples/\` only — synthetic Ally Checking, Ally Savings and Chase CSVs (${ds.txCount} transactions, ${dayjs(ds.minDate).format('MMM D')} – ${dayjs(ds.maxDate).format('MMM D, YYYY')}), date range **All Time** |`);
    L.push(`| Files | ${(this.samples || []).map(s => `\`${s.name}\` sha256 \`${s.sha256.slice(0, 12)}…\``).join(', ')} |`);
    L.push(`| Path | \`buildFinancialSummary()\` → \`callClaude()\` — the same request the AI Analysis tab sends |`);
    L.push('');
    L.push('## Results', '');
    L.push('| | Figures | Grounded | Derived ✓ | Math error | Forecast (unverified) | Unsupported |', '|---|---:|---:|---:|---:|---:|---:|');
    const row = (name, t) => `| ${name} | ${t.n} | ${this._cell(t, 'grounded')} | ${this._cell(t, 'derived')} | ${this._cell(t, 'math-error')} | ${this._cell(t, 'forecast')} | ${this._cell(t, 'unsupported')} |`;
    rep.byPrompt.forEach(t => L.push(row(`${pipe(t.label)}${t.forecast ? ' †' : ''}`, t)));
    L.push(row('**All prompts**', o));
    L.push('', '† The forecast prompt. By the eval\'s rules its projections are treated as derived, never unsupported. Those the code can verify are in *Derived ✓*; the rest (assumed growth rates, rounded end values, ranges) are in *Forecast*, kept out of the verified share.', '');
    L.push('**Stability across repeats** — each repeat is one pass over all 8 prompts:', '');
    L.push('| Repeat | Figures | Grounded | Derived ✓ | Unsupported |', '|---|---:|---:|---:|---:|');
    rep.byRep.forEach(t => L.push(`| ${t.rep} | ${t.n} | ${t.pct('grounded').toFixed(1)}% | ${t.pct('derived').toFixed(1)}% | ${t.pct('unsupported').toFixed(1)}% |`));
    L.push('');
    L.push('**By figure type:**', '');
    L.push('| Type | Figures | Grounded | Derived ✓ | Unsupported |', '|---|---:|---:|---:|---:|');
    [['Dollar amounts', '$'], ['Percentages', '%']].forEach(([n, k]) => { const t = rep.byKind[k]; L.push(`| ${n} | ${t.n} | ${t.pct('grounded').toFixed(1)}% | ${t.pct('derived').toFixed(1)}% | ${t.pct('unsupported').toFixed(1)}% |`); });
    L.push('');
    const cal = rep.calibration;
    L.push('**How much to trust the matcher**', '');
    L.push(`- *Chance matches:* every non-forecast figure was also perturbed by a random 3–25% (${this.CALIBRATION_DRAWS} draws each, ${cal.draws} total) and re-classified. **${cal.rate.toFixed(1)}%** of those wrong numbers were still accepted as grounded or derived (dollar amounts ${cal.byKind['$'].rate.toFixed(1)}%, percentages ${cal.byKind['%'].rate.toFixed(1)}%). That is the matcher's approximate false-positive rate, so the traceable share above is an upper bound by roughly that margin.`);
    L.push(`- *Literal grounding rule:* grounding a figure only by "within ±$1 / ±0.5 pts of any summary figure" — no rounding allowance and no check that the same item is meant — gives ${rep.strict.pct('grounded').toFixed(1)}% grounded, ${rep.strict.pct('derived').toFixed(1)}% derived and ${rep.strict.pct('unsupported').toFixed(1)}% unsupported.`);
    L.push('');
    L.push('## Method', '');
    L.push('1. **Data.** The eval view loads the three CSVs in `samples/` (refusing any file whose SHA-256 differs from the committed one) and parses them the way an import does — `detectSchema()`, `normalizeRow()`, occurrence suffixes, `detectTransfers()` — inside a sandboxed copy of `State` with no overrides, rules, manual balances, budgets or debts, and the date range set to All Time. The real `State` is restored before any request is sent; nothing is persisted.');
    L.push('2. **Requests.** `buildFinancialSummary()` produces the summary below once; each of the 8 `AI_PROMPTS` is sent 3 times through `callClaude()`, exactly as the AI Analysis tab sends it (same system prompt, model and `max_tokens`).');
    L.push('3. **Extraction.** Every dollar amount (`$1,234.56`, `-$617`, `$4.5K`, the second half of `$200–300`) and percentage (`48.4%`, `12 percent`, `3 percentage points`, both ends of `10–15%`) in each answer is one figure; repeated mentions count each time. Plain numbers without `$` or `%` are not counted.');
    L.push('4. **Classification**, in this order:');
    L.push('   - **Grounded** — equals a figure in the summary within ±$1 / ±0.5 pts. To keep coincidences out, the item it stands for must be named nearby (e.g. "income" and "September") unless the match is exact to the cent / 0.1 pt, or is a dollar amount of $100 or more. A rounded figure ("$5K", "48%") may match within the rounding its precision implies — half a unit of its last digit, at most 2.5% of the value — but only when it is named nearby.');
    L.push('   - **Derived ✓** — arithmetic on summary figures, verified in code: an explicit equation in the answer (`$2,057 × 12 = $24,684`) whose result checks out and that uses at least one figure already grounded or derived; arithmetic on such figures on the same line (sums, differences, ratios, a stated % of an amount, ×/÷ a stated number of months), never resting on the figure being checked; or one of ' + rep.candidates + ' standard derivations of this summary (period net, category shares of spending or income, monthly savings rates, month-over-month changes, 2- and 3-month averages, ×12 annualisation, net worth + 12 × average net, subscription totals). A derivation tied to a category or month only counts when that category or month is named nearby. Tolerance for dollar amounts: the larger of $1, 0.25% of the value, or the figure\'s rounding; for percentages: the figure\'s rounding (±0.05 pts for "49.3%", ±0.5 for "49%"), at least ±0.15 pts. A figure that repeats an earlier verified one counts as that one.');
    L.push('   - **Math error** — an explicit equation whose arithmetic doesn\'t hold.');
    L.push('   - **Forecast (unverified)** — only in "12-month net worth prediction": projections resting on assumptions the code can\'t verify. By the eval\'s rules they are treated as derived, not unsupported, but they are reported separately and not counted as verified.');
    L.push('   - **Unsupported** — everything else. Each one is tagged with a keyword heuristic as *advice/target* (a recommended budget or goal), *benchmark* (a rule of thumb), *assumption*, or *claim about the data*.');
    L.push('');
    L.push('<details><summary>The financial summary the model received (every run)</summary>', '', '```text', ds.summary, '```', '', '</details>', '');
    const uns = rep.failures.filter(f => f.cls === 'unsupported');
    const errs = rep.failures.filter(f => f.cls === 'math-error');
    L.push('## Failures', '');
    if (uns.length) {
      const order = ['claim about the data', 'assumption', 'advice/target', 'benchmark'];
      L.push(`**${uns.length} unsupported figures:** ` + order.filter(t => rep.tags[t]).map(t => `${rep.tags[t]} ${t}`).join(', ') + '.', '');
      const claims = uns.filter(f => f.tag === 'claim about the data');
      if (claims.length) {
        L.push('Unsupported figures stated as facts about the user\'s data — the ones that matter most:', '');
        L.push('⟦ ⟧ marks the figure in each excerpt.', '');
        L.push('| Prompt | Run | Figure | Excerpt |', '|---|---:|---|---|');
        claims.forEach(f => L.push(`| ${pipe(f.label)} | ${f.rep} | \`${pipe(f.raw)}\` | ${pipe(f.excerpt)} |`));
        L.push('');
      }
    } else L.push('No unsupported figures.', '');
    if (errs.length) {
      L.push(`**${errs.length} math errors:**`, '');
      L.push('| Prompt | Run | Equation | Excerpt |', '|---|---:|---|---|');
      errs.forEach(f => L.push(`| ${pipe(f.label)} | ${f.rep} | ${pipe(f.how.replace(/^explicit: /, ''))} | ${pipe(f.excerpt)} |`));
      L.push('');
    }
    if (uns.length) {
      L.push(`<details><summary>Every unsupported figure (${uns.length})</summary>`, '');
      L.push('| Prompt | Run | Figure | Reading | Excerpt |', '|---|---:|---|---|---|');
      uns.forEach(f => L.push(`| ${pipe(f.label)} | ${f.rep} | \`${pipe(f.raw)}\` | ${pipe(f.tag)} | ${pipe(f.excerpt)} |`));
      L.push('', '</details>', '');
    }
    L.push('## Limitations', '');
    L.push('- Grounding is not correctness: a figure can match the data and still be used wrongly (e.g. a period total described as monthly). The eval checks where numbers come from, not whether the advice is good.');
    L.push('- The summary shows "Period: All time" without dates, so the model doesn\'t know the period is ~6 months; per-month figures it infers from period totals usually land in *unsupported*.');
    L.push('- Derivations outside the checked forms (multi-step reasoning across sentences, rounding chains) are counted as unsupported — the derived share is a lower bound in that sense, while the chance-match rate above bounds how much the matcher over-accepts.');
    L.push('- The *advice / benchmark / assumption / claim* reading of unsupported figures is a keyword heuristic.');
    L.push('- One dataset, one model, ' + rep.runsScored + ' answers. Responses vary run to run (default temperature); see the repeat table.');
    L.push('');
    L.push('## Reproduce', '');
    L.push('1. Save an Anthropic API key in **Settings → General**.');
    L.push('2. Open DevTools and run `showView(\'ai-eval\')`. (Over `file://`, pick the three files in `samples/` when asked.)');
    L.push('3. Click **Run eval** (24 calls). When it finishes, **Download EVAL.md** and **Download results JSON** (raw answers and every figure\'s classification; **Load results JSON** re-scores a saved run without new calls).');
    L.push('');
    L.push(`Raw answers and per-figure classifications for this run: [\`docs/eval-results.json\`](eval-results.json).`);
    return L.join('\n') + '\n';
  },
};

/* ================================================================
   VIEW
================================================================ */

registerView('ai-eval', 'AI Eval', (root) => {
  const E = AIEval, rep = E.report;
  const msg = m => m ? `<div class="insight ${m.kind === 'good' || m.kind === 'info' ? '' : m.kind}" style="margin-top:12px">${escapeHtml(m.text)}</div>` : '';

  /* ---- header / dataset / controls ---- */
  const head = document.createElement('div'); head.className = 'card';
  const ds = E.dataset;
  head.innerHTML = `
    <h2 class="section-title">AI Eval — grounding of AI Analysis answers</h2>
    <p class="muted" style="font-size:12px;margin-top:4px;max-width:760px">Runs each of the ${AI_PROMPTS.length} AI Analysis prompts ${E.REPEATS}× on the synthetic data in <code>samples/</code> (date range All Time) through the same request the AI tab sends, then checks every dollar amount and percentage in the answers against the summary the model received. Your own data, date range and settings are never used or changed. Developer view — not in the sidebar.</p>
    <div class="grid grid-4" style="margin-top:14px">
      <div><label class="lbl">Model</label><div class="mono">${escapeHtml(rep && E.meta ? E.meta.model : AI_MODEL)}</div></div>
      <div><label class="lbl">Sample data</label><div>${ds ? `${ds.txCount} transactions · ${dayjs(ds.minDate).format('MMM D')} – ${dayjs(ds.maxDate).format('MMM D, YYYY')}` : '<span class="muted">not loaded</span>'}</div></div>
      <div><label class="lbl">API key</label><div>${State.apiKey ? '<span class="pill good">Saved in Settings</span>' : '<span class="pill warn">None — add one in Settings → General</span>'}</div></div>
      <div><label class="lbl">Calls</label><div>${AI_PROMPTS.length} prompts × ${E.REPEATS} = ${AI_PROMPTS.length * E.REPEATS}</div></div>
    </div>
    ${msg(E.sampleMsg)}
    ${E.needsPick ? `<div style="margin-top:10px"><label class="lbl">Pick ${E.SAMPLES.map(s => s.name).join(', ')} from samples/</label><input type="file" id="evalSamplePick" accept=".csv" multiple></div>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center">
      <button class="btn sm" id="evalRun" ${E.running || !ds || ds.fromFile || !State.apiKey ? 'disabled' : ''}>▶ Run eval (${AI_PROMPTS.length * E.REPEATS} calls)</button>
      ${E.running ? '<button class="btn danger sm" id="evalCancel">Cancel</button>' : ''}
      <button class="btn ghost sm" id="evalReload" ${E.running ? 'disabled' : ''}>↻ Reload samples</button>
      <label class="btn ghost sm" style="cursor:pointer" ${E.running ? 'hidden' : ''}>📂 Load results JSON<input type="file" id="evalLoadJson" accept=".json,application/json" style="display:none"></label>
      ${rep ? '<button class="btn ghost sm" id="evalDlMd">⬇ Download EVAL.md</button><button class="btn ghost sm" id="evalDlJson">⬇ Download results JSON</button>' : ''}
    </div>
    ${E.progress.total ? `<div style="margin-top:14px"><div class="progress"><div id="evalProgressBar" style="width:${Math.round(100 * E.progress.done / E.progress.total)}%"></div></div>
      <div class="muted" id="evalProgressText" style="font-size:12px;margin-top:6px">${E.progress.done}/${E.progress.total} done · ${escapeHtml(E.progress.status)}</div></div>` : ''}`;
  root.appendChild(head);

  $('#evalRun').addEventListener('click', () => E.run());
  if ($('#evalCancel')) $('#evalCancel').addEventListener('click', () => { E.cancelled = true; E._setProgress('Cancelling after the current call…'); });
  $('#evalReload').addEventListener('click', async () => { E.dataset = null; await E.loadSamples(); renderActive(); });
  if ($('#evalSamplePick')) $('#evalSamplePick').addEventListener('change', async e => { await E.loadSamples(e.target.files); renderActive(); });
  if ($('#evalLoadJson')) $('#evalLoadJson').addEventListener('change', e => { if (e.target.files[0]) E.loadResults(e.target.files[0]); });
  if ($('#evalDlMd')) $('#evalDlMd').addEventListener('click', () => downloadFile('EVAL.md', E.toMarkdown(), 'text/markdown'));
  if ($('#evalDlJson')) $('#evalDlJson').addEventListener('click', () => downloadFile('eval-results.json', E.toJSON(), 'application/json'));

  if (ds) {
    const sum = document.createElement('div'); sum.className = 'card';
    sum.innerHTML = `<details><summary style="cursor:pointer;font-weight:600;font-size:13px">Financial summary sent to the model (sample data, All Time)</summary>
      <pre class="mono" style="white-space:pre-wrap;font-size:11.5px;margin-top:10px;color:var(--text-2)">${escapeHtml(ds.summary)}</pre></details>`;
    root.appendChild(sum);
  }

  /* ---- live run log ---- */
  if (E.running || (E.runs.length && !rep)) {
    const log = document.createElement('div'); log.className = 'card';
    log.innerHTML = `<h2 class="section-title">Calls</h2><div class="muted" id="evalLog" style="font-size:12px;margin-top:6px"></div>`;
    root.appendChild(log);
    E._renderLog();
  }

  if (!rep) {
    if (!ds && !E.sampleMsg) setTimeout(async () => { await E.loadSamples(); if (State.currentView === 'ai-eval') renderActive(); }, 0);
    return;
  }

  /* ---- results ---- */
  const o = rep.overall;
  const kpi = document.createElement('div'); kpi.className = 'grid grid-4';
  const tile = (label, value, foot) => `<div class="card"><h3>${label}</h3><div class="big num">${value}</div><div class="footnote">${foot}</div></div>`;
  kpi.innerHTML =
    tile('Grounded', o.pct('grounded').toFixed(1) + '%', `${o.grounded} of ${o.n} figures match the summary`) +
    tile('Derived ✓', o.pct('derived').toFixed(1) + '%', `${o.derived} verified arithmetic on it`) +
    tile('Unsupported', o.pct('unsupported').toFixed(1) + '%', `${o.unsupported} figures` + (o['math-error'] ? ` · ${o['math-error']} math errors` : '')) +
    tile('Chance-match rate', rep.calibration.rate.toFixed(1) + '%', 'wrong numbers the matcher would still accept');
  root.appendChild(kpi);

  const head2 = document.createElement('div'); head2.className = 'insight'; head2.style.marginBottom = '14px';
  head2.textContent = E.headline(rep);
  root.appendChild(head2);

  const tbl = document.createElement('div'); tbl.className = 'card';
  const cell = (t, c) => `<td class="num">${t[c]}<span class="muted"> · ${t.pct(c).toFixed(1)}%</span></td>`;
  tbl.innerHTML = `<h2 class="section-title">By prompt</h2>
    <div style="overflow-x:auto;margin-top:8px"><table class="tbl">
      <thead><tr><th>Prompt</th><th>Figures</th><th>Grounded</th><th>Derived ✓</th><th>Math error</th><th>Forecast</th><th>Unsupported</th></tr></thead>
      <tbody>${rep.byPrompt.map(t => `<tr><td>${escapeHtml(t.label)}${t.forecast ? ' <span class="chip">forecast</span>' : ''}</td><td class="num">${t.n}</td>${['grounded', 'derived', 'math-error', 'forecast', 'unsupported'].map(c => cell(t, c)).join('')}</tr>`).join('')}
      <tr style="font-weight:600"><td>All prompts</td><td class="num">${o.n}</td>${['grounded', 'derived', 'math-error', 'forecast', 'unsupported'].map(c => cell(o, c)).join('')}</tr></tbody>
    </table></div>
    <div class="footnote">Repeats: ${rep.byRep.map(t => `#${t.rep} grounded ${t.pct('grounded').toFixed(1)}% · derived ${t.pct('derived').toFixed(1)}% · unsupported ${t.pct('unsupported').toFixed(1)}%`).join(' &nbsp;|&nbsp; ')}<br>
    Strict ±$1 / ±0.5 pts (no rounding allowance): grounded ${rep.strict.pct('grounded').toFixed(1)}% · unsupported ${rep.strict.pct('unsupported').toFixed(1)}%.
    ${rep.runsFailed ? ` · <span style="color:var(--red)">${rep.runsFailed} calls failed</span>` : ''}${rep.truncated ? ` · ${rep.truncated} answers cut off at max_tokens` : ''}${rep.tokens.thinking != null ? ` · thinking ${rep.tokens.thinking} of ${rep.tokens.output} output tokens per answer` : ''}</div>`;
  root.appendChild(tbl);

  const fail = document.createElement('div'); fail.className = 'card';
  fail.innerHTML = `<h2 class="section-title">Unsupported figures and math errors (${rep.failures.length})</h2>
    <div class="muted" style="font-size:12px;margin-top:4px">${Object.entries(rep.tags).map(([k, v]) => `${v} ${escapeHtml(k)}`).join(' · ')}</div>
    <div style="overflow-x:auto;margin-top:8px;max-height:520px;overflow-y:auto"><table class="tbl" style="font-size:12px">
      <thead><tr><th>Prompt</th><th>#</th><th>Figure</th><th>Reading</th><th>Excerpt</th></tr></thead>
      <tbody>${rep.failures.map(f => `<tr><td>${escapeHtml(f.label)}</td><td>${f.rep}</td><td class="mono">${escapeHtml(f.raw)}</td><td>${f.cls === 'math-error' ? '<span class="pill bad">math error</span>' : escapeHtml(f.tag)}</td><td style="min-width:320px">${escapeHtml(f.excerpt).replace(/⟦(.*?)⟧/, '<mark style="background:var(--amber-soft);color:var(--text);padding:0 2px;border-radius:3px">$1</mark>')}${f.cls === 'math-error' ? `<div class="muted">${escapeHtml(f.how)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">None.</td></tr>'}</tbody>
    </table></div>`;
  root.appendChild(fail);

  const answers = document.createElement('div'); answers.className = 'card';
  answers.innerHTML = `<h2 class="section-title">Answers</h2>` + E.runs.map((r, i) => `
    <details style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
      <summary style="cursor:pointer;font-size:12.5px">${escapeHtml(r.label)} — repeat ${r.rep} ${r.error ? `<span class="pill bad">${escapeHtml(r.error)}</span>` : `<span class="muted">${(r.ms / 1000).toFixed(1)}s${AI_CUT_OFF_REASONS.includes(r.stopReason) ? ' · cut off' : ''}</span>`}</summary>
      <div class="eval-answer" data-run="${i}" style="font-size:13px;margin-top:8px"></div>
    </details>`).join('');
  root.appendChild(answers);
  answers.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => {
    const holder = d.querySelector('.eval-answer');
    if (d.open && !holder.innerHTML) holder.innerHTML = renderMarkdown(E.runs[+holder.dataset.run].text || '');
  }));
});
