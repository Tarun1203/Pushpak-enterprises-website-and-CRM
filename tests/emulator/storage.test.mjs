// Phase 5 item 2 (Storage) — upload/read rules for photos and documents,
// including the Firestore lookups the Storage rules make (who owns the
// ticket / roster record).
import test from 'node:test';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { makeEnv, reset, USERS, assertSucceeds, assertFails } from './env.mjs';

const IMG = { contentType: 'image/jpeg' };
const PDF = { contentType: 'application/pdf' };
const EXE = { contentType: 'application/x-msdownload' };
const small = () => new Uint8Array([1, 2, 3, 4]);
const big = () => new Uint8Array(10 * 1024 * 1024 + 1);

test.describe('Storage rules', () => {
  let env;
  const as = (who) => {
    if (who === 'anon') return env.unauthenticatedContext().storage();
    return env.authenticatedContext(who, USERS[who] && USERS[who].email ? { email: USERS[who].email } : {}).storage();
  };
  test.before(async () => {
    env = await makeEnv({ storage: true });
    await reset(env);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const s = ctx.storage();
      for (const p of ['serviceJobs/j1/diagnosis/a.jpg', 'centerRequests/cr1/attachments/a.jpg', 'serviceCenterProfiles/sc1/documents/gst.pdf',
        'centerTechnicians/ct1/documents/id.pdf', 'claims/t1/bill.jpg', 'products/p1/photo.jpg', 'random/secret.txt']) {
        await uploadBytes(ref(s, p), small(), IMG);
      }
    });
  });
  test.after(async () => { if (env) await env.cleanup(); });

  const cases = [
    ['t1', 'put', 'serviceJobs/j1/diagnosis/b.jpg', IMG, 'allow', 'own job photo'],
    ['t2', 'put', 'serviceJobs/j1/diagnosis/b.jpg', IMG, 'deny', 'someone else\'s job'],
    ['t1', 'put', 'serviceJobs/j1/diagnosis/b.exe', EXE, 'deny', 'not an image'],
    ['t1', 'putBig', 'serviceJobs/j1/diagnosis/c.jpg', IMG, 'deny', 'over 10 MB'],
    ['t1', 'get', 'serviceJobs/j1/diagnosis/a.jpg', null, 'allow'], ['t2', 'get', 'serviceJobs/j1/diagnosis/a.jpg', null, 'deny'],
    ['anon', 'get', 'serviceJobs/j1/diagnosis/a.jpg', null, 'deny'], ['wh', 'get', 'serviceJobs/j1/diagnosis/a.jpg', null, 'allow'],
    ['t1', 'delete', 'serviceJobs/j1/diagnosis/a.jpg', null, 'deny', 'evidence cannot be deleted'],
    ['sc1', 'put', 'centerRequests/cr1/attachments/b.pdf', PDF, 'allow'], ['t1', 'get', 'centerRequests/cr1/attachments/a.jpg', null, 'allow'],
    ['sc2', 'get', 'centerRequests/cr1/attachments/a.jpg', null, 'deny'], ['sc2', 'put', 'centerRequests/cr1/attachments/x.jpg', IMG, 'deny'],
    ['d1', 'put', 'centerRequests/cr1/attachments/x.jpg', IMG, 'deny', 'dealer is not staff'],
    ['c1', 'put', 'centerRequests/cr1/attachments/x.jpg', IMG, 'deny', 'customer is not staff'],
    ['sc1', 'put', 'serviceCenterProfiles/sc1/documents/pan.pdf', PDF, 'allow'], ['sc2', 'get', 'serviceCenterProfiles/sc1/documents/gst.pdf', null, 'deny'],
    ['sc1', 'put', 'serviceCenterProfiles/sc1/documents/gst.pdf', PDF, 'deny', 'uploaded documents are write-once'],
    ['t1', 'put', 'centerTechnicians/ct1/documents/dl.pdf', PDF, 'allow', 'own roster record'], ['sc1', 'get', 'centerTechnicians/ct1/documents/id.pdf', null, 'allow'],
    ['t2', 'get', 'centerTechnicians/ct1/documents/id.pdf', null, 'deny'],
    ['t1', 'put', 'claims/t1/bill2.jpg', IMG, 'allow'], ['t2', 'put', 'claims/t1/bill2.jpg', IMG, 'deny'], ['t2', 'get', 'claims/t1/bill.jpg', null, 'deny'],
    ['c1', 'put', 'claims/c1/bill.jpg', IMG, 'deny', 'customers do not file claims'],
    ['anon', 'get', 'products/p1/photo.jpg', null, 'allow', 'public'], ['t1', 'put', 'products/p1/x.jpg', IMG, 'deny'], ['wh', 'put', 'products/p1/x.jpg', IMG, 'allow'],
    ['sa', 'get', 'random/secret.txt', null, 'deny', 'deny by default'], ['sa', 'put', 'random/x.jpg', IMG, 'deny']
  ];
  for (const [who, op, p, meta, expected, note] of cases) {
    test(`${who} ${op} ${p} -> ${expected}${note ? ' (' + note + ')' : ''}`, async () => {
      const r = ref(as(who), p);
      const run = op === 'get' ? getBytes(r) : op === 'delete' ? deleteObject(r) : uploadBytes(r, op === 'putBig' ? big() : small(), meta);
      await (expected === 'allow' ? assertSucceeds(run) : assertFails(run));
    });
  }
});
