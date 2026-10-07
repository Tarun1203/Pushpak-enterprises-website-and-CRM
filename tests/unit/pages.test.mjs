// Static checks over every HTML page in the site and CRM: each inline
// script parses, every Firebase import is a real SDK export from one SDK
// version, and every local module import points at a file that exports
// what is imported. Catches a broken page before it is published.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SKIP = new Set(['node_modules', '.git', 'qa-results', 'test-results', 'functions']);
function htmlFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const PAGES = htmlFiles(ROOT);
const rel = (p) => path.relative(ROOT, p);
const scriptsOf = (html) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], body: m[2] }));

// Exports of the Firebase Web SDK v10 modules this project can use.
const SDK = {
  'firebase-app': ['initializeApp', 'deleteApp', 'getApp', 'getApps'],
  'firebase-auth': ['getAuth', 'onAuthStateChanged', 'onIdTokenChanged', 'signOut', 'signInWithEmailAndPassword', 'createUserWithEmailAndPassword',
    'sendPasswordResetEmail', 'RecaptchaVerifier', 'signInWithPhoneNumber', 'linkWithPhoneNumber', 'updatePassword', 'updateProfile',
    'setPersistence', 'browserLocalPersistence', 'browserSessionPersistence', 'reauthenticateWithCredential', 'EmailAuthProvider', 'sendEmailVerification'],
  'firebase-firestore': ['getFirestore', 'collection', 'collectionGroup', 'doc', 'getDoc', 'getDocs', 'setDoc', 'addDoc', 'updateDoc', 'deleteDoc',
    'query', 'where', 'orderBy', 'limit', 'startAfter', 'endBefore', 'onSnapshot', 'serverTimestamp', 'Timestamp', 'runTransaction', 'writeBatch',
    'arrayUnion', 'arrayRemove', 'increment', 'deleteField', 'documentId', 'getCountFromServer', 'or', 'and'],
  'firebase-storage': ['getStorage', 'ref', 'uploadBytes', 'uploadBytesResumable', 'getDownloadURL', 'deleteObject', 'listAll'],
  'firebase-functions': ['getFunctions', 'httpsCallable'],
  'firebase-analytics': ['getAnalytics', 'logEvent']
};

test('every inline script on every page parses', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-pages-'));
  const problems = [];
  let n = 0;
  for (const file of PAGES) {
    scriptsOf(fs.readFileSync(file, 'utf8')).forEach((s, i) => {
      if (/\bsrc\s*=/.test(s.attrs) || !s.body.trim()) return;
      const type = (/type\s*=\s*["']?([^"'\s>]+)/i.exec(s.attrs) || [])[1] || 'text/javascript';
      n++;
      try {
        if (type === 'module') {
          const f = path.join(tmp, `s${n}.mjs`);
          fs.writeFileSync(f, s.body);
          execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
        } else if (/json/.test(type)) JSON.parse(s.body);
        else if (/javascript/.test(type)) new vm.Script(s.body, { filename: `${rel(file)}#script${i + 1}` });
      } catch (e) {
        problems.push(`${rel(file)} script #${i + 1}: ${String(e.stderr || e.message).split('\n').find((l) => /Error/.test(l)) || e.message}`);
      }
    });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.ok(n > 10, 'found the page scripts');
  assert.deepStrictEqual(problems, []);
});

test('Firebase imports are real SDK exports, all from one SDK version', () => {
  const versions = new Set();
  const problems = [];
  const files = [...PAGES, ...fs.readdirSync(path.join(ROOT, 'crm')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'crm', f))];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']https:\/\/www\.gstatic\.com\/firebasejs\/([\d.]+)\/(firebase-[a-z]+)\.js["']/g)) {
      versions.add(m[2]);
      const allowed = SDK[m[3]];
      if (!allowed) { problems.push(`${rel(file)}: unknown module ${m[3]}`); continue; }
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name && !allowed.includes(name)) problems.push(`${rel(file)}: ${m[3]} has no export "${name}"`);
      }
    }
  }
  assert.deepStrictEqual(problems, []);
  assert.strictEqual(versions.size, 1, 'one Firebase SDK version everywhere: ' + [...versions].join(', '));
});

test('local module imports resolve and the imported names are exported', () => {
  const problems = [];
  const exportsOf = (file) => new Set([...fs.readFileSync(file, 'utf8').matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
  const files = [...PAGES, ...fs.readdirSync(path.join(ROOT, 'crm')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'crm', f))];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s+(\*\s+as\s+\w+|\{[^}]*\})\s+from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), m[2]);
      if (!fs.existsSync(target)) { problems.push(`${rel(file)}: ${m[2]} does not exist`); continue; }
      if (m[1].startsWith('{')) {
        const ex = exportsOf(target);
        for (const raw of m[1].slice(1, -1).split(',')) {
          const name = raw.trim().split(/\s+as\s+/)[0].trim();
          if (name && !ex.has(name)) problems.push(`${rel(file)}: ${m[2]} does not export "${name}"`);
        }
      }
    }
    // Module namespaces used as X.fn( must exist too.
    for (const m of src.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
      const target = path.resolve(path.dirname(file), m[2]);
      if (!fs.existsSync(target)) continue;
      const ex = exportsOf(target);
      for (const u of src.matchAll(new RegExp(`\\b${m[1]}\\.([A-Za-z_$][\\w$]*)`, 'g'))) {
        if (!ex.has(u[1])) problems.push(`${rel(file)}: ${m[1]}.${u[1]} is not exported by ${m[2]}`);
      }
    }
  }
  assert.deepStrictEqual([...new Set(problems)], []);
});

test('shared helper files in crm/ are identical to the Cloud Functions copies', () => {
  for (const f of ['tradePricing.js', 'finance.js', 'technicianMatch.js', 'appointment.js']) {
    const a = path.join(ROOT, 'crm', f), b = path.join(ROOT, 'functions', f);
    if (!fs.existsSync(a)) continue;
    assert.strictEqual(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'), f + ' differs between crm/ and functions/');
  }
});
