import * as FS from './stubs/firebase-firestore.mjs';
export { FS };
export const XSS = '<img src=x onerror="window.__xss=1">';
export const db = FS.getFirestore();
export const el = () => { const d = document.createElement('div'); document.body.appendChild(d); return d; };
// Lets the renderers' awaited reads and follow-up renders finish.
export const settle = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
export const ts = (iso) => FS.Timestamp.fromDate(new Date(iso));
export function assertNoInjectedMarkup(assert, root, label) {
  assert.strictEqual(root.querySelector('img[onerror], script, [onerror]'), null, `${label}: data was rendered as HTML`);
}
export const text = (node) => node.textContent.replace(/\s+/g, ' ');
