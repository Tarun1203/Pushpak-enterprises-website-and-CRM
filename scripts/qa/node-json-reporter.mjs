// node:test reporter that writes one JSON summary — {passed, failed,
// skipped, failures:[...]} — read by scripts/qa/regression-summary.mjs.
export default async function* jsonReporter(source) {
  const out = { passed: 0, failed: 0, skipped: 0, failures: [] };
  for await (const ev of source) {
    const d = ev.data || {};
    if (!d.details || d.details.type === 'suite') continue;
    if (ev.type === 'test:pass') { if (d.skip || d.todo) out.skipped++; else out.passed++; }
    if (ev.type === 'test:fail') {
      out.failed++;
      const err = d.details.error || {};
      out.failures.push({ name: d.name, message: String((err.cause && err.cause.message) || err.message || 'failed').slice(0, 500) });
    }
  }
  yield JSON.stringify(out);
}
