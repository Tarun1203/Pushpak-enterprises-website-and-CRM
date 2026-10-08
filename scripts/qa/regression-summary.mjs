// Phase 5 item 10 — regression gate. Reads every suite's results from
// qa-results/json/*.json (Playwright JSON or the node:test summary), compares
// them with tests/regression-baseline.json, and fails if any test failed, a
// suite produced no results, or a suite now has FEWER tests than the
// baseline (tests silently deleted or no longer discovered). Writes a single
// pass/fail table to the GitHub run summary and qa-results/regression.md.
//   node scripts/qa/regression-summary.mjs            check
//   node scripts/qa/regression-summary.mjs --update   raise the baseline to today's counts
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const DIR = path.join(ROOT, 'qa-results/json');
const BASELINE = path.join(ROOT, 'tests/regression-baseline.json');
const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

function fromPlaywright(j) {
  const r = { passed: 0, failed: 0, skipped: 0, flaky: 0, failures: [] };
  const walk = (suite) => {
    for (const s of suite.suites || []) walk(s);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const st = t.status || (t.results && t.results.length ? t.results[t.results.length - 1].status : 'skipped');
        if (st === 'expected') r.passed++;
        else if (st === 'skipped') r.skipped++;
        else if (st === 'flaky') { r.passed++; r.flaky++; }
        else { r.failed++; r.failures.push({ name: spec.title, message: ((t.results || []).map((x) => x.error && x.error.message).find(Boolean) || st).split('\n')[0].slice(0, 300) }); }
      }
    }
  };
  for (const s of j.suites || []) walk(s);
  return r;
}

const results = {};
if (fs.existsSync(DIR)) {
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const id = f.replace(/\.json$/, '');
    try {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
      results[id] = j.suites ? fromPlaywright(j) : { flaky: 0, ...j };
    } catch (e) { results[id] = { passed: 0, failed: 1, skipped: 0, flaky: 0, failures: [{ name: f, message: 'unreadable results: ' + e.message }] }; }
  }
}

if (process.argv.includes('--update')) {
  for (const [id, r] of Object.entries(results)) {
    const total = r.passed + r.failed + r.skipped;
    if (!baseline.suites[id] || total > baseline.suites[id].minTests) baseline.suites[id] = { ...(baseline.suites[id] || {}), minTests: total };
  }
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log('Baseline updated.');
  process.exit(0);
}

const rows = [];
const problems = [];
for (const [id, cfg] of Object.entries(baseline.suites)) {
  const r = results[id];
  if (!r) { rows.push([cfg.label || id, '—', '—', '—', '**no results**']); problems.push(`${cfg.label || id}: produced no results (step skipped or crashed)`); continue; }
  const total = r.passed + r.failed + r.skipped;
  let verdict = r.failed ? '**FAIL**' : 'pass';
  if (total < cfg.minTests) { verdict = '**FEWER TESTS**'; problems.push(`${cfg.label || id}: ${total} tests, baseline is ${cfg.minTests} — tests were removed or are no longer found`); }
  if (r.failed) problems.push(...r.failures.slice(0, 5).map((f) => `${cfg.label || id}: ${f.name} — ${f.message}`));
  rows.push([cfg.label || id, r.passed + (r.flaky ? ` (${r.flaky} flaky)` : ''), r.failed, r.skipped, verdict]);
}
for (const id of Object.keys(results)) if (!baseline.suites[id]) rows.push([id + ' (new — not in baseline)', results[id].passed, results[id].failed, results[id].skipped, results[id].failed ? '**FAIL**' : 'pass']);

const total = Object.values(results).reduce((a, r) => ({ p: a.p + r.passed, f: a.f + r.failed, s: a.s + r.skipped }), { p: 0, f: 0, s: 0 });
const md = [
  `### Regression gate: ${problems.length ? '❌ FAILED' : '✅ PASSED'}`,
  '',
  `${total.p} passed · ${total.f} failed · ${total.s} skipped across ${Object.keys(results).length} suites`,
  '',
  '| Suite | Passed | Failed | Skipped | Result |', '|---|---:|---:|---:|---|',
  ...rows.map((r) => `| ${r.join(' | ')} |`),
  ...(problems.length ? ['', '**Problems**', '', ...problems.map((p) => `- ${p}`)] : [])
].join('\n');
fs.mkdirSync(path.join(ROOT, 'qa-results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'qa-results/regression.md'), md + '\n');
fs.writeFileSync(path.join(ROOT, 'qa-results/regression.json'), JSON.stringify({ passed: !problems.length, totals: total, results, problems }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
console.log(md);
for (const p of problems) console.log(`::error title=Regression::${p.replace(/\n/g, ' ')}`);
process.exit(problems.length ? 1 : 0);
