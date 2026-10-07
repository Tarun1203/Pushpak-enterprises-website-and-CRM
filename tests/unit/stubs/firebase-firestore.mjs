// In-memory stand-in for the Firebase Web SDK's Firestore module, so the
// CRM's browser modules (crm/*.js) can be unit tested in Node. Only what
// those modules use is implemented. Tests seed data with __seed() and read
// what was written via __store / __writes.
export const __store = new Map(); // 'coll/id' -> data
export const __writes = [];       // [op, path, data]
let auto = 0;

export class Timestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = 0; }
  static now() { return new Timestamp(Date.now()); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static fromMillis(ms) { return new Timestamp(ms); }
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
}
const SERVER_TS = Symbol('serverTimestamp');
export const serverTimestamp = () => SERVER_TS;
export const arrayUnion = (...v) => ({ __union: v });
export const arrayRemove = (...v) => ({ __remove: v });
export const increment = (n) => ({ __inc: n });
export const deleteField = () => ({ __delete: true });

export function __reset() { __store.clear(); __writes.length = 0; auto = 0; }
export function __seed(path, data) { __store.set(path, JSON.parse(JSON.stringify(data, (k, v) => (v instanceof Timestamp ? { __ts: v.ms } : v)), (k, v) => (v && v.__ts !== undefined ? new Timestamp(v.__ts) : v))); }

export const getFirestore = () => ({ __fake: true });
export const collection = (db, name, ...rest) => ({ type: 'collection', path: [name, ...rest].join('/'), filters: [], orders: [], max: null });
export const doc = (dbOrColl, ...parts) => {
  if (dbOrColl && dbOrColl.type === 'collection') return { type: 'doc', path: dbOrColl.path + '/' + (parts[0] || ('auto' + (++auto))), get id() { return this.path.split('/').pop(); } };
  const path = parts.join('/');
  return { type: 'doc', path, get id() { return path.split('/').pop(); } };
};
export const where = (field, op, value) => ({ kind: 'where', field, op, value });
export const orderBy = (field, dir = 'asc') => ({ kind: 'orderBy', field, dir });
export const limit = (n) => ({ kind: 'limit', n });
export const documentId = () => '__name__';
export function query(base, ...cs) {
  const q = { ...base, filters: [...base.filters], orders: [...base.orders] };
  for (const c of cs) {
    if (c.kind === 'where') q.filters.push(c);
    else if (c.kind === 'orderBy') q.orders.push(c);
    else if (c.kind === 'limit') q.max = c.n;
  }
  return q;
}

function get(obj, field) { return field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function match(data, id, f) {
  const v = f.field === '__name__' ? id : get(data, f.field);
  switch (f.op) {
    case '==': return v === f.value;
    case '!=': return v !== f.value;
    case 'in': return f.value.includes(v);
    case 'not-in': return !f.value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(f.value);
    case '<': return v < f.value; case '<=': return v <= f.value;
    case '>': return v > f.value; case '>=': return v >= f.value;
    default: throw new Error('unsupported op ' + f.op);
  }
}
function snapOf(path) {
  const data = __store.get(path);
  const id = path.split('/').pop();
  return { id, ref: { type: 'doc', path, id }, exists: () => data !== undefined, data: () => (data === undefined ? undefined : data), get: (f) => (data ? get(data, f) : undefined) };
}
export async function getDoc(ref) { return snapOf(ref.path); }
export async function getDocs(q) {
  const depth = q.path.split('/').length + 1;
  let docs = [];
  for (const [p, d] of __store) {
    if (!p.startsWith(q.path + '/') || p.split('/').length !== depth) continue;
    const id = p.split('/').pop();
    if (q.filters.every((f) => match(d, id, f))) docs.push(snapOf(p));
  }
  for (const o of [...q.orders].reverse()) {
    docs.sort((a, b) => {
      const x = get(a.data(), o.field), y = get(b.data(), o.field);
      const xv = x && x.toMillis ? x.toMillis() : x, yv = y && y.toMillis ? y.toMillis() : y;
      return (xv > yv ? 1 : xv < yv ? -1 : 0) * (o.dir === 'desc' ? -1 : 1);
    });
  }
  if (q.max != null) docs = docs.slice(0, q.max);
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
}
export async function getCountFromServer(q) { const s = await getDocs(q); return { data: () => ({ count: s.size }) }; }

function resolve(prev, v) {
  if (v === SERVER_TS) return Timestamp.now();
  if (v && v.__union) return [...(Array.isArray(prev) ? prev : []), ...v.__union.filter((x) => !(prev || []).includes(x))];
  if (v && v.__remove) return (Array.isArray(prev) ? prev : []).filter((x) => !v.__remove.includes(x));
  if (v && v.__inc !== undefined) return (typeof prev === 'number' ? prev : 0) + v.__inc;
  return v;
}
function write(path, data, mode) {
  const prev = __store.get(path);
  if (mode === 'update' && prev === undefined) { const e = new Error('No document to update: ' + path); e.code = 'not-found'; throw e; }
  const base = mode === 'set' ? {} : { ...(prev || {}) };
  for (const [k, v] of Object.entries(data)) {
    if (v && v.__delete) { delete base[k]; continue; }
    if (k.includes('.') && mode === 'update') {
      const keys = k.split('.'); let o = base;
      keys.slice(0, -1).forEach((kk) => { o[kk] = { ...(o[kk] || {}) }; o = o[kk]; });
      o[keys[keys.length - 1]] = resolve(get(prev || {}, k), v);
    } else base[k] = resolve((prev || {})[k], v);
  }
  __store.set(path, base);
  __writes.push([mode, path, data]);
}
export async function setDoc(ref, data, opts) { write(ref.path, data, opts && opts.merge ? 'merge' : 'set'); }
export async function updateDoc(ref, data) { write(ref.path, data, 'update'); }
export async function addDoc(coll, data) { const ref = doc(coll); write(ref.path, data, 'set'); return ref; }
export async function deleteDoc(ref) { __store.delete(ref.path); __writes.push(['delete', ref.path, null]); }
export function writeBatch() {
  const ops = [];
  return {
    set: (r, d, o) => ops.push(() => write(r.path, d, o && o.merge ? 'merge' : 'set')),
    update: (r, d) => ops.push(() => write(r.path, d, 'update')),
    delete: (r) => ops.push(() => { __store.delete(r.path); __writes.push(['delete', r.path, null]); }),
    commit: async () => ops.forEach((f) => f())
  };
}
export async function runTransaction(db, fn) {
  const ops = [];
  const tx = {
    get: async (r) => snapOf(r.path),
    set: (r, d, o) => { ops.push(() => write(r.path, d, o && o.merge ? 'merge' : 'set')); return tx; },
    update: (r, d) => { ops.push(() => write(r.path, d, 'update')); return tx; },
    delete: (r) => { ops.push(() => __store.delete(r.path)); return tx; }
  };
  const out = await fn(tx);
  ops.forEach((f) => f());
  return out;
}
export function onSnapshot(q, next) { (q.type === 'doc' ? getDoc(q) : getDocs(q)).then(next); return () => {}; }
