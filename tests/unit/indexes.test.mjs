// Phase 5 item 9 — every Firestore query the app runs must be servable by
// Firestore's automatic single-field indexes, or be listed in
// firestore.indexes.json. A query that needs a missing composite index
// fails in production with "The query requires an index" (the emulator
// doesn't check this, so it would otherwise only show up live).
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = path.resolve(import.meta.dirname, '../..');
const EQUALITY = ['==', 'in', 'array-contains', 'array-contains-any'];
const files = [
  ...['index.html', 'portal.html'],
  ...fs.readdirSync(path.join(ROOT, 'crm')).filter((f) => /\.(html|js)$/.test(f)).map((f) => 'crm/' + f)
];

function scripts(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  if (file.endsWith('.js')) return [{ start: 0, code: src, src }];
  return [...src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/\bsrc=/.test(m[1]))
    .map((m) => ({ start: m.index + m[0].indexOf('>') + 1, code: m[2], src, module: /module/.test(m[1]) }));
}

function declaredIndexes() {
  const f = path.join(ROOT, 'firestore.indexes.json');
  if (!fs.existsSync(f)) return [];
  return (JSON.parse(fs.readFileSync(f, 'utf8')).indexes || []).map((i) => `${i.collectionGroup}:${i.fields.map((x) => x.fieldPath).join(',')}`);
}

test('no browser query needs a composite index that is not declared', () => {
  const declared = declaredIndexes();
  const needs = [];
  for (const file of files) {
    for (const b of scripts(file)) {
      let ast;
      try { ast = acorn.parse(b.code, { ecmaVersion: 'latest', sourceType: file.endsWith('.js') || b.module ? 'module' : 'script', allowAwaitOutsideFunction: true }); } catch { continue; }
      walk.full(ast, (n) => {
        if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'query') return;
        const coll = n.arguments[0] && n.arguments[0].type === 'CallExpression' && n.arguments[0].arguments[1] && n.arguments[0].arguments[1].type === 'Literal' ? n.arguments[0].arguments[1].value : '?';
        const parts = n.arguments.slice(1).filter((a) => a.type === 'CallExpression' && a.callee.type === 'Identifier')
          .map((a) => ({ fn: a.callee.name, field: a.arguments[0] && a.arguments[0].type === 'Literal' ? a.arguments[0].value : '?', op: a.arguments[1] && a.arguments[1].type === 'Literal' ? a.arguments[1].value : '' }));
        const range = parts.filter((p) => (p.fn === 'where' && !EQUALITY.includes(p.op)) || p.fn === 'orderBy');
        const fields = [...new Set(parts.filter((p) => p.fn === 'where' || p.fn === 'orderBy').map((p) => p.field))];
        if (!range.length || fields.length < 2) return;
        const key = `${coll}:${fields.join(',')}`;
        if (!declared.some((d) => d.startsWith(coll + ':') && fields.every((f) => d.includes(f)))) {
          needs.push(`${file}:${b.src.slice(0, b.start + n.start).split('\n').length}: ${key} (${parts.map((p) => `${p.fn}(${p.field}${p.op ? ' ' + p.op : ''})`).join(' + ')})`);
        }
      });
    }
  }
  assert.deepStrictEqual(needs, [], 'add these to firestore.indexes.json, or restructure the query');
});

test('Cloud Functions queries do not sort or range-filter on a second field', () => {
  const src = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
  const chains = [...src.matchAll(/\.collection\(([^)]*)\)((?:\s*\.(?:where|orderBy|limit)\([^)]*\))+)/g)];
  const bad = [];
  for (const m of chains) {
    const calls = [...m[2].matchAll(/\.(where|orderBy)\(\s*'([^']+)'(?:\s*,\s*'([^']+)')?/g)].map((c) => ({ fn: c[1], field: c[2], op: c[3] || '' }));
    const range = calls.filter((c) => c.fn === 'orderBy' || (c.fn === 'where' && !EQUALITY.includes(c.op)));
    const fields = new Set(calls.map((c) => c.field));
    if (range.length && fields.size > 1) bad.push(`functions/index.js:${src.slice(0, m.index).split('\n').length}: ${m[1]} ${m[2].replace(/\s+/g, ' ')}`);
  }
  assert.deepStrictEqual(bad, []);
});
