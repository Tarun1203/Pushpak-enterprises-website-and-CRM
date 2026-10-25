// Closure form: customer confirmation input -> fields sent with "completed".
import test from 'node:test';
import assert from 'node:assert';
import { confirmationFields, validCode } from '../../crm/close-confirm.js';

test('completion code: 4 digits; empty is fine unless required', () => {
  assert.deepStrictEqual(confirmationFields({ mode: 'code', code: ' 0427 ' }), { kind: 'code', closeOtp: '0427' });
  assert.strictEqual(confirmationFields({ mode: 'code', code: '' }), null);
  assert.throws(() => confirmationFields({ mode: 'code', code: '', required: true }), /completion code/);
  assert.throws(() => confirmationFields({ mode: 'code', code: '12a4' }), /4 digits/);
  assert.ok(validCode('0000') && !validCode('12345'));
});
test('signature: needs ink and the signer\'s name', () => {
  assert.deepStrictEqual(confirmationFields({ mode: 'signature', hasInk: true, signer: ' Asha ' }), { kind: 'signature', name: 'Asha' });
  assert.throws(() => confirmationFields({ mode: 'signature', hasInk: true, signer: '' }), /name/);
  assert.strictEqual(confirmationFields({ mode: 'signature', hasInk: false }), null);
  assert.throws(() => confirmationFields({ mode: 'signature', hasInk: false, required: true }), /sign/);
});
