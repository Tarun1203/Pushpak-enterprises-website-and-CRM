// Safe local server for /qa-my-app runs.
//
// Every page hardcodes the live `makwell-websiteandcrm` Firebase project, so
// serving the files as-is would let a browser test write to production. This
// server serves the repo on http://localhost:8080 but rewrites every Firebase
// Web SDK import (https://www.gstatic.com/firebasejs/<v>/firebase-*.js) to the
// in-browser stub from tests/e2e/support/firebase-stub.js. Nothing leaves the
// browser: Firestore reads come from a seed, writes land in window.__stubWrites.
//
// Per-browser session (cookie `qa_sid`):
//   GET  /__stub/session?role=superadmin   sign in as a role (omit role = signed out)
//   POST /__stub/seed   {data:{coll:[docs]}, profile, uid}   set Firestore seed data
//   GET  /__stub/state                     show this session's role + seed
//
// The site is also served under /Pushpak-enterprises-website-and-CRM/ (the
// GitHub Pages base path), so absolute production links work locally.
//
//   node QA-tests/tools/safe-server.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '../..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const { MODULES } = createRequire(import.meta.url)(path.join(ROOT, 'tests/e2e/support/firebase-stub.js'));
const SDK = /https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+)\.js/g;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
const sessions = new Map();

const sid = (req) => (/(?:^|;\s*)qa_sid=([\w-]+)/.exec(req.headers.cookie || '') || [])[1];
function session(req, res) {
  let id = sid(req);
  if (!id || !sessions.has(id)) { id = id || Math.random().toString(36).slice(2, 12); sessions.set(id, sessions.get(id) || {}); res.setHeader('Set-Cookie', `qa_sid=${id}; Path=/; SameSite=Lax`); }
  return sessions.get(id);
}
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const s = session(req, res);
  if (url.pathname.startsWith('/__stub/firebase-')) {
    const name = url.pathname.slice(8).replace(/\.js$/, '');
    return send(res, 200, 'text/javascript', MODULES[name] || 'export {};');
  }
  if (url.pathname === '/__stub/session') {
    const role = url.searchParams.get('role');
    for (const k of Object.keys(s)) delete s[k];
    if (role) Object.assign(s, { role, uid: url.searchParams.get('uid') || 'qa-' + role });
    return send(res, 200, 'application/json', JSON.stringify({ ok: true, ...s }));
  }
  if (url.pathname === '/__stub/seed' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    return req.on('end', () => { try { Object.assign(s, JSON.parse(body || '{}')); send(res, 200, 'application/json', '{"ok":true}'); } catch (e) { send(res, 400, 'application/json', JSON.stringify({ ok: false, error: e.message })); } });
  }
  if (url.pathname === '/__stub/state') return send(res, 200, 'application/json', JSON.stringify(s, null, 2));

  // Production is GitHub Pages under /Pushpak-enterprises-website-and-CRM/ —
  // serve that prefix too so hard-coded base-path links resolve locally.
  const rel = decodeURIComponent(url.pathname).replace(/^\/Pushpak-enterprises-website-and-CRM(?=\/|$)/i, '') || '/';
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return send(res, 403, 'text/plain', 'forbidden');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) { file = path.join(ROOT, '404.html'); res.statusCode = 404; }
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  if (ext === '.html' || ext === '.js' || ext === '.mjs') {
    let text = fs.readFileSync(file, 'utf8').replace(SDK, '/__stub/$1.js');
    if (ext === '.html') {
      const boot = `<script>window.__STUB=${JSON.stringify(s).replace(/</g, '\\u003c')};window.__QA_SAFE_SERVER=true;</script>`;
      text = /<head[^>]*>/i.test(text) ? text.replace(/<head[^>]*>/i, (m) => m + boot) : boot + text;
    }
    res.writeHead(res.statusCode || 200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    return res.end(text);
  }
  res.writeHead(res.statusCode || 200, { 'Content-Type': type });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`QA safe server (Firebase stubbed) on http://localhost:${PORT}`));
