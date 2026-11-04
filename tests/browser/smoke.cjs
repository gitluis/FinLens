// FinLens browser smoke tests — run with: node tests/browser/smoke.cjs
//
// Serves the repo over HTTP, opens it in a real browser (Playwright) and checks:
//   1. the app boots with no errors
//   2. every registered view renders with no errors, empty and with sample data
//   3. the files in samples/ import, and the numbers are sane to the cent
//   4. known bugs (KNOWN_BUGS) still fail — when one starts passing, CI says so
//
// Uses only samples/ (synthetic data). Never point it at real exports.
//
// Env:
//   BROWSER_CHANNEL  ''/chromium (default) or msedge
//   CDN_MIRROR       optional folder holding local copies of the CDN scripts, for
//                    machines that can't reach the CDNs. CI uses the real CDNs.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}/`;
const CHANNEL = process.env.BROWSER_CHANNEL && process.env.BROWSER_CHANNEL !== 'chromium'
  ? process.env.BROWSER_CHANNEL : undefined;

// Known bugs: each is a check that SHOULD pass once the bug is fixed.
// While it still fails, CI stays green and reports it as "expected failure".
// When a fix makes it pass, CI fails and asks you to remove it from this list,
// so a fixed bug is locked in by a normal test instead of quietly coming back.
const KNOWN_BUGS = new Set([
  'fmt never shows -$0.00',
]);

let passed = 0, failed = 0, xfail = 0, xpass = 0;
function result(name, ok, detail) {
  const known = KNOWN_BUGS.has(name);
  if (ok && !known) { passed++; console.log(`  ok    ${name}`); }
  else if (!ok && known) { xfail++; console.log(`  xfail ${name} (known bug)${detail ? ' — ' + detail : ''}`); }
  else if (ok && known) { xpass++; console.log(`::error::"${name}" now passes. Remove it from KNOWN_BUGS in tests/browser/smoke.cjs.`); }
  else { failed++; console.log(`::error::${name}${detail ? ' — ' + detail : ''}`); }
}

function waitForServer(url, tries = 50) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => http.get(url, (r) => { r.resume(); resolve(); })
      .on('error', () => n ? setTimeout(() => attempt(n - 1), 100) : reject(new Error('server did not start')));
    attempt(tries);
  });
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch(CHANNEL ? { channel: CHANNEL } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
    page.on('dialog', (d) => { errors.push(`dialog: ${d.message()}`); d.dismiss(); });

    if (process.env.CDN_MIRROR) {
      const mirror = process.env.CDN_MIRROR;
      await page.route(/^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\//, (route) => {
        const file = path.join(mirror, path.basename(new URL(route.request().url()).pathname));
        if (fs.existsSync(file)) route.fulfill({ path: file, contentType: 'application/javascript' });
        else route.abort();
      });
      await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.abort());
      // Aborted font requests log console errors; they are not app errors.
      page.removeAllListeners('console');
      page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts\.g|ERR_FAILED/.test(m.text())) errors.push(`console.error: ${m.text()}`);
      });
    }

    console.log(`Browser: ${CHANNEL || 'chromium'} ${browser.version()}`);

    // 1. Boot ----------------------------------------------------------------
    console.log('Boot');
    await page.goto(BASE + 'index.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof VIEWS === 'object' && document.querySelector('.view.active'), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    result('app boots with no errors', errors.length === 0, errors.join(' | '));
    const footer = await page.locator('text=/v\\d+\\.\\d+\\.\\d+ · /').first().textContent().catch(() => '');
    const version = (fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').match(/## \[(\d+\.\d+\.\d+)\]/) || [])[1];
    result('footer shows the CHANGELOG version', footer.includes(`v${version}`), `footer "${footer.trim()}", CHANGELOG ${version}`);

    // 2. Every view, empty ---------------------------------------------------
    async function renderAllViews(label) {
      const ids = await page.evaluate(() => Object.keys(VIEWS));
      const bad = [];
      for (const id of ids) {
        errors.length = 0;
        await page.evaluate((v) => showView(v), id);
        await page.waitForTimeout(80); // charts draw in setTimeout(..., 0)
        if (errors.length) bad.push(`${id}: ${errors.join(' | ')}`);
      }
      result(`every view renders with no errors (${label}, ${ids.length} views)`, bad.length === 0, bad.join(' || '));
      return ids;
    }
    console.log('Views, no data');
    await renderAllViews('no data');

    // 3. Import samples ------------------------------------------------------
    console.log('Sample import');
    const samples = fs.readdirSync(path.join(ROOT, 'samples')).filter((f) => f.endsWith('.csv')).sort();
    const csvRows = samples.reduce((n, f) =>
      n + fs.readFileSync(path.join(ROOT, 'samples', f), 'utf8').trim().split(/\r?\n/).length - 1, 0);
    errors.length = 0;
    const stats = await page.evaluate(async (names) => {
      const files = [];
      for (const n of names) {
        const text = await (await fetch('samples/' + n, { cache: 'no-store' })).text();
        files.push(new File([text], n, { type: 'text/csv' }));
      }
      await loadFiles(files);
      const tx = State.transactions;
      const cents = (x) => Math.round(x * 100);
      const transfers = tx.filter((t) => t.type === 'transfer');
      return {
        count: tx.length,
        accounts: Object.keys(State.accounts).length,
        badAmounts: tx.filter((t) => !Number.isFinite(t.amount) || Math.abs(t.amount * 100 - cents(t.amount)) > 1e-6).length,
        badDates: tx.filter((t) => !(t.date instanceof Date) || isNaN(t.date)).length,
        dupIds: tx.length - new Set(tx.map((t) => t.id)).size,
        transferCount: transfers.length,
        transferNetCents: transfers.reduce((s, t) => s + cents(t.amount), 0),
        incomeCents: cents(sumIncome(tx)),
        expenseCents: cents(sumExpense(tx)),
        netCents: tx.filter((t) => t.type !== 'transfer' && t.type !== 'payment').reduce((s, t) => s + cents(t.amount), 0),
      };
    }, samples);
    console.log('  ' + JSON.stringify(stats));
    result('sample import has no errors', errors.length === 0, errors.join(' | '));
    result(`every sample row imported (${csvRows} rows in ${samples.length} files)`, stats.count === csvRows, `${stats.count} transactions`);
    result('one account per sample file', stats.accounts === samples.length, `${stats.accounts} accounts`);
    result('every amount is a finite number in whole cents', stats.badAmounts === 0, `${stats.badAmounts} bad`);
    result('every date is a valid Date', stats.badDates === 0, `${stats.badDates} bad`);
    result('transaction ids are unique', stats.dupIds === 0, `${stats.dupIds} duplicates`);
    result('transfers are detected in the samples', stats.transferCount > 0, `${stats.transferCount} transfers`);
    result('income − spending equals the net of non-transfer rows, to the cent',
      stats.incomeCents - stats.expenseCents === stats.netCents,
      `income ${stats.incomeCents} − spending ${stats.expenseCents} ≠ net ${stats.netCents} (cents)`);

    // 4. Views with data, and money formatting ------------------------------
    console.log('Views, sample data');
    await renderAllViews('sample data');

    const fmtChecks = await page.evaluate(() => ({
      negZero: [fmt(-0), fmt(-0.001), fmt(-0.004)],
      cents: [fmt(0.1 + 0.2), fmt(1234.5), fmt(-12.345)],
    }));
    console.log('  ' + JSON.stringify(fmtChecks));
    result('fmt never shows -$0.00', !fmtChecks.negZero.some((s) => /^-\$0\.00$|^\$-0\.00$/.test(s)), fmtChecks.negZero.join(', '));
    result('fmt rounds float drift to the cent', fmtChecks.cents[0] === '$0.30' && fmtChecks.cents[1] === '$1,234.50', fmtChecks.cents.join(', '));

    // Re-importing the same files must not add rows
    const again = await page.evaluate(async (names) => {
      const files = [];
      for (const n of names) files.push(new File([await (await fetch('samples/' + n)).text()], n, { type: 'text/csv' }));
      await loadFiles(files);
      return State.transactions.length;
    }, samples);
    result('re-importing the same files adds no rows', again === stats.count, `${stats.count} → ${again}`);
  } catch (e) {
    failed++;
    console.log(`::error::test run crashed — ${e.stack || e}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  console.log(`\n${passed} passed, ${failed} failed, ${xfail} known bugs still failing, ${xpass} known bugs now fixed`);
  process.exit(failed || xpass ? 1 : 0);
})();
