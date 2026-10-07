// Runs a table of access cases: [who, op, target, data, expected] where
// expected is 'allow' or 'deny'. The seed is restored after any write that
// went through, so every case starts from the same data.
import test from 'node:test';
import { makeEnv, reset, dbAs, attempt, assertSucceeds, assertFails } from './env.mjs';

export function runCases(title, cases, { storage = false } = {}) {
  test.describe(title, () => {
    let env, dirty = true;
    test.before(async () => { env = await makeEnv({ storage }); });
    test.after(async () => { if (env) await env.cleanup(); });
    test.beforeEach(async () => { if (dirty) { await reset(env); dirty = false; } });
    for (const [who, op, target, data, expected, note] of cases) {
      const label = `${who} ${op} ${Array.isArray(target) ? target.map((t) => (Array.isArray(t) ? t.join(' ') : t)).join(' where ') : target} -> ${expected}${note ? ' (' + note + ')' : ''}`;
      test(label, async () => {
        const db = dbAs(env, who);
        if (expected === 'allow') {
          await assertSucceeds(attempt(db, op, target, data));
          if (op !== 'get' && op !== 'list') dirty = true;
        } else {
          await assertFails(attempt(db, op, target, data));
        }
      });
    }
  });
}
