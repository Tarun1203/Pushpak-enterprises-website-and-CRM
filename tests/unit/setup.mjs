// Loaded with `node --import ./tests/unit/setup.mjs`: a DOM (linkedom),
// the Firebase CDN -> stub mapping, and the UMD helpers the CRM pages load
// with <script src> (window.TradePricing / window.TradeFinance).
import { register, createRequire } from 'node:module';
import { parseHTML } from 'linkedom';
register('./loader.mjs', import.meta.url);
const { window, document } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.window = window;
globalThis.document = document;
for (const k of ['HTMLElement', 'Node', 'Event', 'CustomEvent']) if (window[k] && !globalThis[k]) globalThis[k] = window[k];
globalThis.CSS = globalThis.CSS || { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
const require = createRequire(import.meta.url);
window.TradePricing = require('../../crm/tradePricing.js');
window.TradeFinance = require('../../crm/finance.js');
globalThis.alert = (m) => { (globalThis.__alerts = globalThis.__alerts || []).push(String(m)); };
globalThis.confirm = () => true;
globalThis.prompt = () => null;
window.alert = globalThis.alert; window.confirm = globalThis.confirm; window.prompt = globalThis.prompt;
