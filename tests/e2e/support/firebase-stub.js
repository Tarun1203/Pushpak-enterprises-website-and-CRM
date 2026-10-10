// Serves stand-ins for the Firebase Web SDK modules so CRM pages can be
// rendered signed in as any role, with sample data, without a real
// Firebase project or test accounts. Used by the mobile/responsive suites.
// Nothing is written anywhere: writes are recorded in window.__stubWrites.

const FIRESTORE = `
const S = () => window.__STUB || {};
const TS = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms });
export class Timestamp { static now() { return TS(Date.now()); } static fromDate(d) { return TS(d.getTime()); } static fromMillis(ms) { return TS(ms); } }
export const getFirestore = () => ({});
export const serverTimestamp = () => TS(Date.now());
export const arrayUnion = (...a) => a; export const arrayRemove = (...a) => a; export const increment = (n) => n; export const deleteField = () => null;
export const documentId = () => '__name__';
export const collection = (db, ...p) => ({ kind: 'coll', path: p.join('/'), filters: [] });
export const collectionGroup = (db, id) => ({ kind: 'coll', path: id, filters: [] });
export const doc = (a, ...p) => { const path = a && a.kind === 'coll' ? a.path + '/' + (p[0] || 'auto' + Math.random().toString(36).slice(2, 8)) : p.join('/'); return { kind: 'doc', path, id: path.split('/').pop() }; };
export const where = (f, op, v) => ({ w: [f, op, v] }); export const orderBy = () => ({}); export const limit = (n) => ({ lim: n }); export const startAfter = () => ({}); export const or = (...a) => ({}); export const and = (...a) => ({});
export const query = (c, ...cs) => ({ ...c, filters: c.filters.concat(cs.filter((x) => x.w).map((x) => x.w)), lim: (cs.find((x) => x.lim) || {}).lim || c.lim });
const conv = (v) => (v && typeof v === 'object' && v.__ms !== undefined ? TS(v.__ms) : v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)])) : Array.isArray(v) ? v.map(conv) : v);
const rows = (coll) => ((S().data || {})[coll] || []).map((r, i) => ({ id: r.id || coll + i, ...r }));
const match = (d, [f, op, v]) => { const x = d[f]; return op === '==' ? x === v : op === 'in' ? v.includes(x) : op === 'array-contains' ? (x || []).includes(v) : op === '!=' ? x !== v : op === 'not-in' ? !v.includes(x) : true; };
const snapOf = (id, d) => ({ id, ref: { id }, exists: () => !!d, data: () => (d ? conv(d) : undefined), get: (f) => (d ? conv(d[f]) : undefined) });
export async function getDoc(r) {
  (window.__reads = window.__reads || []).push({ kind: 'doc', path: r.path });
  const [coll, id] = r.path.split('/');
  if (coll === 'users' && id === (S().uid || 'u1') && !(S().data || {}).users) return snapOf(id, S().profile || { role: S().role, name: 'Test ' + S().role, email: 'test@pe.test' });
  const d = rows(coll).find((x) => x.id === id);
  return snapOf(id, d);
}
export async function getDocs(q) {
  (window.__reads = window.__reads || []).push({ kind: 'query', path: q.path, filtered: q.filters.length > 0 || !!q.lim });
  let docs = rows(q.path.split('/')[0]).filter((d) => q.filters.every((f) => match(d, f))).map((d) => snapOf(d.id, d));
  if (q.lim) docs = docs.slice(0, q.lim);
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) };
}
export async function getCountFromServer(q) { (window.__reads = window.__reads || []).push({ kind: 'count', path: q.path }); const docs = rows(q.path.split('/')[0]).filter((d) => q.filters.every((f) => match(d, f))); return { data: () => ({ count: docs.length }) }; }
const rec = (op, p, d) => { (window.__stubWrites = window.__stubWrites || []).push([op, p, d]); };
export async function setDoc(r, d) { rec('set', r.path, d); } export async function updateDoc(r, d) { rec('update', r.path, d); }
export async function addDoc(c, d) { rec('add', c.path, d); return { id: 'new' + Date.now() }; } export async function deleteDoc(r) { rec('delete', r.path); }
export function writeBatch() { return { set() {}, update() {}, delete() {}, commit: async () => {} }; }
export async function runTransaction(db, fn) { return fn({ get: getDoc, set: () => {}, update: () => {}, delete: () => {} }); }
export function onSnapshot(q, next) {
  if (q.kind === 'doc') { getDoc(q).then(next); return () => {}; }
  const L = (window.__listeners = window.__listeners || []);
  const entry = { q, next };
  L.push(entry);
  getDocs(q).then((s) => next({ ...s, docChanges: () => s.docs.map((d) => ({ type: 'added', doc: { ...d, metadata: { hasPendingWrites: false } } })) }));
  return () => { const i = L.indexOf(entry); if (i >= 0) L.splice(i, 1); };
}
// Test helper: deliver a change to every open listener on a collection.
window.__stubPush = (coll, id, data, type = 'added') => {
  (window.__listeners || []).filter((e) => e.q.path.split('/')[0] === coll && e.q.filters.every((f) => match({ id, ...data }, f))).forEach((e) => {
    const d = snapOf(id, data);
    e.next({ docs: [d], size: 1, empty: false, forEach: (fn) => fn(d), docChanges: () => [{ type, doc: { ...d, metadata: { hasPendingWrites: false } } }] });
  });
};
`;

const AUTH = `
const S = () => window.__STUB || {};
const user = () => (S().role ? { uid: S().uid || 'u1', email: 'test@pe.test', getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: { phone_number: '+919000000001' } }) } : null);
export const getAuth = () => ({ get currentUser() { return user(); } });
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(user()), 0); return () => {}; };
export const onIdTokenChanged = onAuthStateChanged;
export const signOut = async () => {}; export const signInWithEmailAndPassword = async () => ({ user: user() });
export const createUserWithEmailAndPassword = async () => ({ user: user() }); export const sendPasswordResetEmail = async () => {};
export class RecaptchaVerifier { clear() {} } export const signInWithPhoneNumber = async () => ({ confirm: async () => ({}) }); export const linkWithPhoneNumber = signInWithPhoneNumber;
export const setPersistence = async () => {}; export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export const updatePassword = async () => {}; export const updateProfile = async () => {}; export const reauthenticateWithCredential = async () => {}; export const EmailAuthProvider = { credential: () => ({}) }; export const sendEmailVerification = async () => {};
`;
const APP = 'export const initializeApp = () => ({}); export const deleteApp = async () => {}; export const getApp = () => ({}); export const getApps = () => [];';
const STORAGE = "export const getStorage = () => ({}); export const ref = () => ({}); export const uploadBytes = async () => ({}); export const uploadBytesResumable = () => ({}); export const getDownloadURL = async () => ''; export const deleteObject = async () => {}; export const listAll = async () => ({ items: [] });";
const FUNCTIONS = 'export const getFunctions = () => ({}); export const httpsCallable = () => async () => ({ data: {} });';
const ANALYTICS = 'export const getAnalytics = () => ({}); export const logEvent = () => {};';
const MODULES = { 'firebase-firestore': FIRESTORE, 'firebase-auth': AUTH, 'firebase-app': APP, 'firebase-storage': STORAGE, 'firebase-functions': FUNCTIONS, 'firebase-analytics': ANALYTICS };

// stub: { role, uid, profile, data: { collection: [docs] } } — omit role to be signed out.
async function installFirebaseStub(page, stub = {}) {
  await page.addInitScript((s) => { window.__STUB = s; }, stub);
  await page.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(firebase-[a-z]+)\.js/, (route) => {
    const name = /(firebase-[a-z]+)\.js/.exec(route.request().url())[1];
    return route.fulfill({ contentType: 'text/javascript', body: MODULES[name] || 'export {};' });
  });
}

module.exports = { installFirebaseStub };
