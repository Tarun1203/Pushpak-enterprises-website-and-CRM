// node:test reporter that turns each failed test into a GitHub Actions
// error annotation (visible on the run page and through the API), plus one
// summary notice.
const esc = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');
export default async function* ghReporter(source) {
  let pass = 0, fail = 0;
  for await (const ev of source) {
    if (ev.type === 'test:pass' && ev.data.details && ev.data.details.type !== 'suite') pass++;
    if (ev.type === 'test:fail' && ev.data.details && ev.data.details.type !== 'suite') {
      fail++;
      const err = ev.data.details.error || {};
      const cause = err.cause || err;
      const msg = (cause && (cause.message || String(cause))) || 'failed';
      yield `::error title=${esc(ev.data.name).slice(0, 200)}::${esc(msg).slice(0, 2000)}\n`;
    }
  }
  yield `::notice title=Emulator QA::${pass} passed, ${fail} failed\n`;
}
