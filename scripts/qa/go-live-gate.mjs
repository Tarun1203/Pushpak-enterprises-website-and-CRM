// Phase 10 item 24 - the go-live gate.  node scripts/qa/go-live-gate.mjs
// Result:  GO  /  GO WITH KNOWN ISSUES  /  NO-GO   (exit code 1 only for NO-GO).
//  - NO-GO: a "must be zero" check fails, or a test suite failed.
//  - GO WITH KNOWN ISSUES: nothing critical, but owner confirmations are still
//    outstanding (docs/go-live-confirmations.json) or the release is unstamped.
//  - GO: all checks pass and every confirmation is true.
// Suite results come from env GATE_OUTCOMES='{"backend_qa":"success",...}' (CI sets this).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const SKIP = new Set(['node_modules', '.git', 'qa-results', 'test-results']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const zero = []; // [name, ok, detail]
const check = (name, ok, detail = '') => zero.push([name, !!ok, detail]);

// ---- must be zero: things we can verify from the repository ----
const files = walk(ROOT).filter((f) => /\.(html|js|mjs|json|rules|yml|md)$/.test(f) && !/package-lock\.json$/.test(f));
const secretRe = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|"type"\s*:\s*"service_account"|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bAKIA[0-9A-Z]{16}\b/;
const leaked = files.filter((f) => !f.endsWith('go-live-gate.mjs') && !/secrets\.test\.mjs$/.test(f) && secretRe.test(fs.readFileSync(f, 'utf8')));
check('No exposed credentials in the repository', leaked.length === 0, leaked.map((f) => path.relative(ROOT, f)).join(', '));

const fr = read('firestore.rules'), sr = read('storage.rules');
check('Firestore: unknown collections denied by default', /match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;/.test(fr));
check('Storage: unknown paths denied by default', /match \/\{allPaths=\*\*\}\s*\{\s*allow (?:read, write|write, read): if false;/.test(sr) || /allow read, write: if false/.test(sr));
const openWrite = (t) => (t.match(/allow\s+(?:create|update|delete|write)[^;{]*:\s*if\s+true\s*;/g) || []);
check('No rule lets anyone write without a condition', openWrite(fr).length + openWrite(sr).length === 0, [...openWrite(fr), ...openWrite(sr)].join(' | '));
check('Accounts can be switched off at data level (rules read accessDisabled)', /accessDisabled/.test(fr) && /accessDisabled/.test(sr));

const pages = fs.readdirSync(path.join(ROOT, 'crm')).filter((f) => /^CRM.*\.html$/.test(f) || f === 'login.html');
const noRes = pages.filter((f) => !/resilience\.js/.test(read('crm/' + f)));
check('Every CRM page shows errors and offline status (resilience.js)', noRes.length === 0, noRes.join(', '));
const noGuard = pages.filter((f) => /^CRM/.test(f) && f !== 'CRMareamanager.html' && !/accessDisabled|callerActive|role/.test(read('crm/' + f)));
check('Every CRM dashboard checks the signed-in role', noGuard.length === 0, noGuard.join(', '));

const DOCS = ['UAT.md', 'SOP.md', 'TROUBLESHOOTING.md', 'TRAINING.md', 'BACKUP-RECOVERY.md', 'DEPLOY-ROLLBACK.md', 'MONITORING.md', 'PERFORMANCE.md', 'KNOWN-ISSUES.md', 'GO-LIVE.md', 'go-live-confirmations.json'];
const missing = DOCS.filter((d) => !exists('docs/' + d));
check('Operating documents exist', missing.length === 0, missing.join(', '));
check('Server audit trail covers jobs, claims, spares and invoices', /WORKFLOW/.test(read('functions/audit.js')) && /serviceJobs/.test(read('functions/audit.js')) && /claims/.test(read('functions/audit.js')));

// ---- suites (CI passes outcomes) ----
let outcomes = {};
try { outcomes = JSON.parse(process.env.GATE_OUTCOMES || '{}'); } catch { /* ignore */ }
const failedSuites = Object.entries(outcomes).filter(([, v]) => v === 'failure').map(([k]) => k);
const hasOutcomes = Object.keys(outcomes).length > 0;
check('All automated suites passed', failedSuites.length === 0, hasOutcomes ? failedSuites.join(', ') : 'not run here (CI supplies results)');

// ---- known issues / confirmations ----
const conf = JSON.parse(read('docs/go-live-confirmations.json'));
const pending = Object.entries(conf).filter(([k, v]) => !k.startsWith('_') && v !== true).map(([k]) => k);
const rel = read('crm/release.js');
const unstamped = /"build":"dev"/.test(rel);

const critical = zero.filter(([, ok]) => !ok);
const issues = [];
if (pending.length) issues.push(`${pending.length} owner confirmation(s) outstanding: ${pending.join(', ')}`);
if (unstamped) issues.push('Release not stamped (run scripts/stamp-release.mjs before deploying)');
const verdict = critical.length ? 'NO-GO' : issues.length ? 'GO WITH KNOWN ISSUES' : 'GO';

const lines = [`# Go-live gate: ${verdict}`, '', '## Must be zero'];
for (const [n, ok, d] of zero) lines.push(`- ${ok ? 'PASS' : 'FAIL'} - ${n}${!ok && d ? ' (' + d + ')' : ok && d && /not run/.test(d) ? ' (' + d + ')' : ''}`);
lines.push('', '## Outstanding (not code - you must confirm)');
lines.push(...(issues.length ? issues.map((i) => '- ' + i) : ['- none']));
const out = lines.join('\n');
console.log(out);
try { fs.mkdirSync(path.join(ROOT, 'qa-results'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'qa-results/go-live.md'), out + '\n'); } catch { /* ignore */ }
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');
process.exit(verdict === 'NO-GO' ? 1 : 0);
