// helper: run axe-core in a page and return violations
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
async function runAxe(page, opts) {
  await page.evaluate(axeSrc);
  return page.evaluate(async (o) => {
    const r = await window.axe.run(document, Object.assign({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }, o || {}));
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 3).map((n) => n.target.join(' ') + ' :: ' + (n.any[0] ? n.any[0].message : (n.all[0] ? n.all[0].message : '')).slice(0, 140)) }));
  }, opts);
}
module.exports = { runAxe };
