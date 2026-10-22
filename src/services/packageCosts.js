function parsePackageCosts(body) {
  if (body.cost_items === undefined && body.target_travelers === undefined && body.minimum_travelers === undefined) return null;
  const target = body.target_travelers === "" || body.target_travelers == null ? null : Number(body.target_travelers);
  const minimum = body.minimum_travelers === "" || body.minimum_travelers == null ? null : Number(body.minimum_travelers);
  if (target !== null && (!Number.isSafeInteger(target) || target < 1 || target > 10000)) throw new Error("จำนวนผู้เดินทางที่รองรับไม่ถูกต้อง");
  if (minimum !== null && (!Number.isSafeInteger(minimum) || minimum < 1 || target === null || minimum > target)) throw new Error("จำนวนขั้นต่ำต้องไม่เกินจำนวนที่รองรับ");
  const items = body.cost_items === undefined ? null : body.cost_items;
  if (items !== null && (!Array.isArray(items) || items.length > 100)) throw new Error("รายการต้นทุนไม่ถูกต้อง");
  if (items === null) throw new Error("กรุณาส่งรายการต้นทุนพร้อมจำนวนผู้เดินทาง");
  const parsedItems = items?.map((item, index) => {
    const supplier = String(item.supplier_name || "").trim();
    const category = String(item.category || "OTHER");
    const mode = String(item.pricing_mode || "FIXED");
    if (!supplier || supplier.length > 200 || !["FOOD", "LOCATION", "TRANSPORT", "GUIDE", "HOTEL", "OTHER"].includes(category) || !["FIXED", "PER_PERSON"].includes(mode)) throw new Error(`รายการต้นทุนที่ ${index + 1} ไม่ถูกต้อง`);
    const fields = ["amount_satang", "deposit_satang", "paid_deposit_satang", "paid_balance_satang"];
    const amounts = Object.fromEntries(fields.map((field) => [field, Number(item[field] ?? 0)]));
    if (fields.some((field) => !Number.isSafeInteger(amounts[field]) || amounts[field] < 0 || amounts[field] > 2147483647) || amounts.amount_satang === 0) throw new Error(`ยอดเงินรายการต้นทุนที่ ${index + 1} ไม่ถูกต้อง`);
    if (mode === "PER_PERSON" && target === null) throw new Error("ต้นทุนต่อคนต้องระบุจำนวนผู้เดินทางที่รองรับ");
    const plannedTotal = amounts.amount_satang * (mode === "PER_PERSON" ? target : 1);
    if (amounts.deposit_satang > plannedTotal || amounts.paid_deposit_satang > amounts.deposit_satang || amounts.paid_deposit_satang + amounts.paid_balance_satang > plannedTotal) throw new Error(`ยอดมัดจำหรือยอดจ่ายรายการที่ ${index + 1} เกินต้นทุนรวม`);
    return { category, supplier_name: supplier, pricing_mode: mode, ...amounts };
  });
  return { target_travelers: target, minimum_travelers: minimum, items: parsedItems };
}

function costAt(items, travelers) {
  return items.reduce((sum, item) => sum + item.amount_satang * (item.pricing_mode === "PER_PERSON" ? travelers : 1), 0);
}

module.exports = { parsePackageCosts, costAt };
