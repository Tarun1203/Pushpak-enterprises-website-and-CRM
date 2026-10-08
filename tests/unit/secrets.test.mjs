// Phase 5 item 8 — no secrets in the repository. GitHub Pages publishes
// every file, so a private key, service-account file or access token here
// would be public. (The Firebase web "apiKey" in the pages is meant to be
// public — access is controlled by the security rules — so it is allowed,
// but only the project's own key.)
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SKIP = new Set(['node_modules', '.git', 'qa-results', 'test-results']);
const TEXT = /\.(html|js|mjs|cjs|json|css|md|txt|yml|yaml|rules|env|sh|py|csv|xml)$|^\.env/i;
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const FILES = walk(ROOT);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const PATTERNS = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY( BLOCK)?-----/],
  ['Google service-account file', /"type"\s*:\s*"service_account"/],
  ['service-account private key field', /"private_key"\s*:\s*"-----BEGIN/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe / Razorpay secret key', /\b(?:sk_live_[A-Za-z0-9]{20,}|rzp_live_[A-Za-z0-9]{10,})\b/],
  ['OpenAI / Anthropic key', /\bsk-(?:ant-)?[A-Za-z0-9_-]{32,}\b/],
  ['password in code', /\b(?:password|passwd|pwd)\s*[:=]\s*["'][^"'\s]{6,}["']/i]
];
// Test fixtures use obviously fake passwords.
const ALLOW_PASSWORD_IN = [/^tests\//, /^functions\/.*\.test\.js$/];
const FIREBASE_WEB_KEY = /AIza[0-9A-Za-z_-]{35}/g;

test('no private keys, service-account files or access tokens are committed', () => {
  const problems = [];
  for (const f of FILES) {
    const r = rel(f);
    if (!TEXT.test(path.basename(f))) continue;
    if (fs.statSync(f).size > 3 * 1024 * 1024) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const [name, re] of PATTERNS) {
      if (name === 'password in code' && ALLOW_PASSWORD_IN.some((a) => a.test(r))) continue;
      const m = re.exec(src);
      if (m) problems.push(`${r}:${src.slice(0, m.index).split('\n').length}: ${name}`);
    }
  }
  assert.deepStrictEqual(problems, []);
});

test('no credential files (.env, service-account JSON, key files) are committed', () => {
  const bad = FILES.map(rel).filter((r) => /(^|\/)\.env(\.|$)|serviceAccount.*\.json$|-firebase-adminsdk-.*\.json$|\.(pem|p12|pfx|key)$/i.test(r) && !/^tests\//.test(r));
  assert.deepStrictEqual(bad, []);
});

test('only the project\'s own public Firebase web key appears', () => {
  const keys = new Map();
  for (const f of FILES) {
    if (!/\.(html|js|mjs)$/.test(f)) continue;
    for (const m of fs.readFileSync(f, 'utf8').matchAll(FIREBASE_WEB_KEY)) {
      if (!keys.has(m[0])) keys.set(m[0], rel(f));
    }
  }
  assert.ok(keys.size <= 1, 'more than one Google API key in the code: ' + JSON.stringify([...keys]));
});
