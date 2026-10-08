// Minimal in-memory Firestore Admin SDK stand-in for exercising functions/index.js.
const store = new Map();
let autoId = 0;
class Timestamp {
  constructor(ms) { this.ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  toMillis() { return this.ms; } toDate() { return new Date(this.ms); }
  get seconds() { return Math.floor(this.ms / 1000); }
}
const SERVER_TS = { __st: true };
const FieldValue = {
  serverTimestamp: () => SERVER_TS,
  increment: (n) => ({ __inc: n }),
  arrayUnion: (...x) => ({ __union: x }),
  delete: () => ({ __del: true }),
};
function resolve(prev, val) {
  if (val === SERVER_TS) return Timestamp.now();
  if (val && val.__inc !== undefined) return (typeof prev === 'number' ? prev : 0) + val.__inc;
  if (val && val.__union) return [...(Array.isArray(prev) ? prev : []), ...val.__union];
  return val;
}
function applyWrite(path, data, mode) {
  const prev = store.get(path);
  if (mode === 'update' && !prev) throw new Error('update on missing doc ' + path);
  const base = mode === 'set' ? {} : { ...(prev || {}) };
  for (const [k, v] of Object.entries(data)) { if (v && v.__del) delete base[k]; else base[k] = resolve((prev || {})[k], v); }
  store.set(path, base);
}
class Snap {
  constructor(ref) { this.ref = ref; this.id = ref.id; const d = store.get(ref.path); this._d = d ? JSON.parse(JSON.stringify(d), rev) : undefined; this.exists = !!d; }
  data() { return this._d; } get(f) { return this._d ? this._d[f] : undefined; }
}
function rev(k, v) { return v && typeof v === 'object' && 'ms' in v && Object.keys(v).length === 1 ? new Timestamp(v.ms) : v; }
class DocRef {
  constructor(coll, id) { this.coll = coll; this.id = id; this.path = coll + '/' + id; this.parent = { id: coll }; }
  async get() { return new Snap(this); }
  async set(d, o) { applyWrite(this.path, d, o && o.merge ? 'merge' : 'set'); }
  async update(d) { applyWrite(this.path, d, 'update'); }
  async delete() { store.delete(this.path); }
  collection(name) { return new CollRef(this.path + '/' + name); }
}
class Query {
  constructor(coll, filters = [], max) { this.coll = coll; this.filters = filters; this.max = max; }
  where(f, op, v) { return new Query(this.coll, [...this.filters, [f, op, v]], this.max); }
  limit(n) { return new Query(this.coll, this.filters, n); }
  async get() {
    const docs = [];
    for (const [p] of store) {
      const cut = p.lastIndexOf('/');
      const c = p.slice(0, cut), id = p.slice(cut + 1);
      if (c !== this.coll) continue;
      const s = new Snap(new DocRef(c, id));
      if (this.filters.every(([f, op, v]) => op === '==' ? s.get(f) === v : op === 'in' ? v.includes(s.get(f)) : false)) docs.push(s);
    }
    const out = this.max ? docs.slice(0, this.max) : docs;
    return { docs: out, empty: !out.length, forEach: (fn) => out.forEach(fn) };
  }
}
class CollRef extends Query {
  constructor(name) { super(name); this.id = name; }
  doc(id) { return new DocRef(this.coll, id || ('auto' + (++autoId))); }
  async add(d) { const r = this.doc(); await r.set(d); return r; }
}
const db = {
  collection: (n) => new CollRef(n),
  batch: () => { const w = []; return { set: (r, d, o) => w.push([r.path, d, o && o.merge ? 'merge' : 'set']), update: (r, d) => w.push([r.path, d, 'update']), commit: async () => w.forEach(([p, d, m]) => applyWrite(p, d, m)) }; },
  getAll: async (...refs) => refs.map((r) => new Snap(r)),
  runTransaction: async (fn) => {
    const writes = [];
    const tx = {
      get: async (r) => (r instanceof Query ? r.get() : new Snap(r)),
      getAll: async (...refs) => refs.map((r) => new Snap(r)),
      set: (r, d, o) => writes.push([r.path, d, o && o.merge ? 'merge' : 'set']),
      update: (r, d) => writes.push([r.path, d, 'update']),
      delete: (r) => writes.push([r.path, null, 'delete']),
      create: (r, d) => { if (store.has(r.path)) throw new Error('already exists ' + r.path); writes.push([r.path, d, 'set']); },
    };
    const out = await fn(tx);
    writes.forEach(([p, d, m]) => (m === 'delete' ? store.delete(p) : applyWrite(p, d, m)));
    return out;
  }
};
module.exports = { store, db, FieldValue, Timestamp, Snap, DocRef };
