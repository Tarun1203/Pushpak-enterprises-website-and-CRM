const test = require('node:test');
const assert = require('node:assert');
const { assignCodeIfMissing } = require('./codes');

// Minimal in-memory stand-in for the bits of Firestore the function uses.
// Transactions run one at a time, like a real contended transaction would
// after retries.
function fakeDb(initial) {
  const store = new Map(Object.entries(initial));
  const snapOf = (path) => ({
    exists: store.has(path),
    get: (f) => (store.get(path) || {})[f]
  });
  const ref = (path) => ({ path });
  let chain = Promise.resolve();
  return {
    store,
    ref,
    collection: (c) => ({ doc: (id) => ref(`${c}/${id}`) }),
    runTransaction: (fn) => {
      const run = chain.then(() => fn({
        get: async (r) => snapOf(r.path),
        set: (r, data) => store.set(r.path, { ...data }),
        update: (r, data) => store.set(r.path, { ...store.get(r.path), ...data })
      }));
      chain = run.catch(() => {});
      return run;
    }
  };
}
const cfg = { field: 'serviceCenterCode', counterId: 'servicecenter-master', prefix: 'SC-' };

test('first code is SC-0001 and the counter is created', async () => {
  const db = fakeDb({ 'serviceCenterProfiles/a': { name: 'A' } });
  assert.strictEqual(await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/a'), cfg), 'SC-0001');
  assert.strictEqual(db.store.get('serviceCenterProfiles/a').serviceCenterCode, 'SC-0001');
  assert.strictEqual(db.store.get('counters/servicecenter-master').value, 1);
});

test('continues from an existing counter value', async () => {
  const db = fakeDb({ 'counters/servicecenter-master': { value: 41 }, 'serviceCenterProfiles/a': {} });
  assert.strictEqual(await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/a'), cfg), 'SC-0042');
});

test('a document that already has a code is untouched and uses no number', async () => {
  const db = fakeDb({ 'counters/servicecenter-master': { value: 5 }, 'serviceCenterProfiles/a': { serviceCenterCode: 'SC-0003' } });
  assert.strictEqual(await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/a'), cfg), 'SC-0003');
  assert.strictEqual(db.store.get('counters/servicecenter-master').value, 5);
});

test('an empty-string legacy code counts as missing', async () => {
  const db = fakeDb({ 'centerTechnicians/t': { technicianCode: '' } });
  const c = { field: 'technicianCode', counterId: 'technician-master', prefix: 'TC-' };
  assert.strictEqual(await assignCodeIfMissing(db, db.ref('centerTechnicians/t'), c), 'TC-0001');
});

test('a deleted document gets nothing and uses no number', async () => {
  const db = fakeDb({});
  assert.strictEqual(await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/gone'), cfg), null);
  assert.strictEqual(db.store.has('counters/servicecenter-master'), false);
});

test('concurrent documents get distinct numbers', async () => {
  const db = fakeDb({ 'serviceCenterProfiles/a': {}, 'serviceCenterProfiles/b': {}, 'serviceCenterProfiles/c': {} });
  const codes = await Promise.all(['a', 'b', 'c'].map(id => assignCodeIfMissing(db, db.ref(`serviceCenterProfiles/${id}`), cfg)));
  assert.deepStrictEqual([...codes].sort(), ['SC-0001', 'SC-0002', 'SC-0003']);
});

test('running twice for the same document is idempotent', async () => {
  const db = fakeDb({ 'serviceCenterProfiles/a': {} });
  const first = await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/a'), cfg);
  const second = await assignCodeIfMissing(db, db.ref('serviceCenterProfiles/a'), cfg);
  assert.strictEqual(first, second);
  assert.strictEqual(db.store.get('counters/servicecenter-master').value, 1);
});
