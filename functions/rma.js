// RMA (replacing a customer's defective unit) and returns to the brand
// (pure, unit-testable).
const MAX_BRAND_RETURN_ITEMS = 300;

// Is this serial a valid replacement for the RMA?
// serialDoc: unitSerials doc or null; stock: productStock warehouse doc or null.
function checkReplacement(rma, serial, serialDoc, stock) {
  if (rma.status !== 'approved') return 'The RMA must be approved first.';
  if (!rma.modelId) return 'The RMA has no product model set.';
  if (!serial) return 'Enter the replacement unit\'s serial.';
  if (rma.serialNumber && String(rma.serialNumber).trim().toUpperCase() === serial) return 'That is the customer\'s own (defective) unit.';
  if (!serialDoc) return `Serial ${serial} was never received into stock.`;
  if (serialDoc.modelId !== rma.modelId) return `Serial ${serial} is a different model.`;
  if (serialDoc.status !== 'in_stock' || serialDoc.location !== 'warehouse') return `Serial ${serial} is not in the Head Office warehouse stock.`;
  const free = ((stock && stock.onHand) || 0) - ((stock && stock.reserved) || 0);
  if (free < 1) return 'Every unit of this model in stock is reserved for approved orders.';
  return null;
}

// The replacement keeps the original unit's warranty: same purchase date
// and warranty length, so it ends when the original would have.
function carriedWarranty(originalReg) {
  if (!originalReg || !originalReg.purchaseDate) return null;
  return { purchaseDate: originalReg.purchaseDate, warrantyMonths: originalReg.warrantyMonths || 12 };
}

// A shipment back to the brand: defective units held at the warehouse
// and/or defective spare-part returns.
function checkBrandReturn(units, spares) {
  if (!units.length && !spares.length) return 'Select at least one defective unit or spare part.';
  if (units.length + spares.length > MAX_BRAND_RETURN_ITEMS) return `At most ${MAX_BRAND_RETURN_ITEMS} items per shipment.`;
  for (const u of units) {
    if (!u.doc) return `Unit ${u.id} is not on record.`;
    if (u.doc.status !== 'defective' || u.doc.location !== 'warehouse_defective') return `Unit ${u.id} is not a defective unit held at the warehouse.`;
  }
  for (const s of spares) {
    if (!s.doc) return 'A spare-part return is not on record.';
    if (s.doc.status !== 'defective') return `Spare return ${s.doc.returnId || s.id} is not marked defective.`;
  }
  return null;
}

module.exports = { MAX_BRAND_RETURN_ITEMS, checkReplacement, carriedWarranty, checkBrandReturn };
