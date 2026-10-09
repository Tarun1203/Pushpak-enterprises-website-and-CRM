// Master data keys (pure, unit-testable). Each master record has one or more
// "this is the same thing" keys; two records with the same key are duplicates
// (e.g. the same spare part imported twice, or two active warranty plans for
// one brand + category, which makes the warranty answer ambiguous).
const norm = (v) => String(v == null ? '' : v).toLowerCase().replace(/[\s\-_/.]+/g, ' ').trim();

const KEYS = {
  spareParts: (d) => [d.partCode && `code:${norm(d.partCode)}`, d.name && `name:${norm(d.name)}|${norm(d.brandCompatibility || 'all')}`],
  productModels: (d) => [d.modelNumber && `model:${norm(d.brandId)}|${norm(d.modelNumber)}`],
  products: (d) => [d.name && `product:${norm(d.brandId || d.brand)}|${norm(d.categoryId || d.categoryName)}|${norm(d.name)}`],
  productCategories: (d) => [d.name && `category:${norm(d.name)}`],
  brands: (d) => [d.name && `brand:${norm(d.name)}`],
  warrantyPlans: (d) => [d.status === 'active' && d.brandId && d.categoryId && `plan:${norm(d.brandId)}|${norm(d.categoryId)}`]
};

const keysOf = (coll, d) => (KEYS[coll] ? KEYS[coll](d || {}).filter(Boolean) : []);

module.exports = { KEYS, keysOf, norm };
