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
  for (const [k, v] of Object.entries(data)) base[k] = resolve((prev || {})[k], v);
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
}
class Query {
  constructor(coll, filters = []) { this.coll = coll; this.filters = filters; }
  where(f, op, v) { return new Query(this.coll, [...this.filters, [f, op, v]]); }
  async get() {
    const docs = [];
    for (const [p] of store) {
      const [c, id] = p.split('/');
      if (c !== this.coll) continue;
      const s = new Snap(new DocRef(c, id));
      if (this.filters.every(([f, op, v]) => op === '==' ? s.get(f) === v : op === 'in' ? v.includes(s.get(f)) : false)) docs.push(s);
    }
    return { docs, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
  }
}
class CollRef extends Query {
  constructor(name) { super(name); this.id = name; }
  doc(id) { return new DocRef(this.coll, id || ('auto' + (++autoId))); }
  async add(d) { const r = this.doc(); await r.set(d); return r; }
}
const db = {
  collection: (n) => new CollRef(n),
  getAll: async (...refs) => refs.map((r) => new Snap(r)),
  runTransaction: async (fn) => {
    const writes = [];
    const tx = {
      get: async (r) => (r instanceof Query ? r.get() : new Snap(r)),
      getAll: async (...refs) => refs.map((r) => new Snap(r)),
      set: (r, d, o) => writes.push([r.path, d, o && o.merge ? 'merge' : 'set']),
      update: (r, d) => writes.push([r.path, d, 'update']),
      create: (r, d) => { if (store.has(r.path)) throw new Error('already exists ' + r.path); writes.push([r.path, d, 'set']); },
    };
    const out = await fn(tx);
    writes.forEach(([p, d, m]) => applyWrite(p, d, m));
    return out;
  }
};
module.exports = { store, db, FieldValue, Timestamp, Snap, DocRef };
