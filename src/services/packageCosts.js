const { seatList } = require("../lib/seats.js");

const moneyFields = ["amount_satang", "deposit_satang", "paid_deposit_satang", "paid_balance_satang"];
const invalid = (message) => { const error = new Error(message); error.isCustom = true; throw error; };

function parsePackageCosts(body) {
  if (body.cost_items === undefined && body.minimum_travelers === undefined) return null;
  const minimum = body.minimum_travelers === "" || body.minimum_travelers == null ? null : Number(body.minimum_travelers);
  if (minimum !== null && (!Number.isSafeInteger(minimum) || minimum < 1)) invalid("จำนวนขั้นต่ำที่วางแผนไม่ถูกต้อง");
  if (!Array.isArray(body.cost_items) || body.cost_items.length > 100) invalid("รายการต้นทุนไม่ถูกต้อง");
  const seen = new Set();
  const items = body.cost_items.map((item, index) => {
    const locationId = item.location_id == null || item.location_id === "" ? null : Number(item.location_id);
    const partnerId = item.partner_id == null || item.partner_id === "" ? null : Number(item.partner_id);
    if ((locationId === null) === (partnerId === null) || [locationId, partnerId].some((id) => id !== null && (!Number.isSafeInteger(id) || id < 1))) {
      invalid(`กรุณาเลือกสถานที่หรือร้านของรายการต้นทุนที่ ${index + 1}`);
    }
    const key = locationId === null ? `partner:${partnerId}` : `location:${locationId}`;
    if (seen.has(key)) invalid("สถานที่หรือร้านในรายการต้นทุนซ้ำกัน");
    seen.add(key);
    const amounts = Object.fromEntries(moneyFields.map((field) => [field, Number(item[field] ?? 0)]));
    if (moneyFields.some((field) => !Number.isSafeInteger(amounts[field]) || amounts[field] < 0 || amounts[field] > 2147483647) || amounts.amount_satang === 0) {
      invalid(`ยอดเงินรายการต้นทุนที่ ${index + 1} ไม่ถูกต้อง`);
    }
    if (amounts.deposit_satang > amounts.amount_satang || amounts.paid_deposit_satang > amounts.deposit_satang || amounts.paid_deposit_satang + amounts.paid_balance_satang > amounts.amount_satang) {
      invalid(`ยอดมัดจำหรือยอดจ่ายรายการที่ ${index + 1} เกินต้นทุนรวม`);
    }
    return { location_id: locationId, partner_id: partnerId, ...amounts };
  });
  return { minimum_travelers: minimum, items };
}

function sourceCategory(type, partner = false) {
  const name = String(type || "");
  if (/ร้านอาหาร|ภัตตาคาร|คาเฟ่|restaurant|cafe/i.test(name)) return "FOOD";
  if (/โรงแรม|ที่พัก|รีสอร์ท|hotel|resort/i.test(name)) return "HOTEL";
  if (/สถานที่ท่องเที่ยว|แหล่งท่องเที่ยว|attraction/i.test(name)) return "LOCATION";
  if (partner || /ร้านค้า|ของฝาก|จุดแวะ|แวะพัก|ขนส่ง|ยานพาหนะ|สถานี|สนามบิน|shopping|shop/i.test(name)) return null;
  return "LOCATION";
}

async function resolvePackageCosts(tx, costs, { busIds, locationIds, partnerIds }, existingMinimum = null) {
  const buses = await tx.bus.findMany({ where: { id: { in: busIds } }, select: { id: true, layout: true } });
  if (buses.length !== busIds.length) invalid("ไม่พบรถบัสที่เลือก");
  const capacity = buses.reduce((sum, bus) => sum + seatList(bus.layout).length, 0);
  const minimum = costs ? costs.minimum_travelers : existingMinimum;
  if (minimum !== null && minimum > capacity) invalid(`จำนวนขั้นต่ำที่วางแผนต้องไม่เกิน ${capacity} ที่นั่งของรถที่เลือก`);
  const result = { target_travelers: capacity || null, minimum_travelers: minimum };
  if (!costs) return result;

  const locations = await tx.location.findMany({ where: { id: { in: [...new Set(locationIds)] } }, include: { lct_type: true } });
  const partners = await tx.partner.findMany({ where: { id: { in: [...new Set(partnerIds)] } }, include: { pt_type: true } });
  const locationMap = new Map(locations.map((location) => [location.id, location]));
  const partnerMap = new Map(partners.map((partner) => [partner.id, partner]));
  result.items = costs.items.map((item, index) => {
    const source = item.location_id !== null ? locationMap.get(item.location_id) : partnerMap.get(item.partner_id);
    const category = sourceCategory(item.location_id !== null ? source?.lct_type?.name : source?.pt_type?.name, item.partner_id !== null);
    if (!source || !category) invalid(`รายการต้นทุนที่ ${index + 1} ต้องเลือกโรงแรม ร้านอาหาร หรือจุดท่องเที่ยวที่อยู่ในแพ็กเกจ`);
    return { ...item, category, supplier_name: source.name, pricing_mode: "FIXED" };
  });
  return result;
}

function costAt(items, travelers) {
  return items.reduce((sum, item) => sum + item.amount_satang * (item.pricing_mode === "PER_PERSON" ? travelers : 1), 0);
}

module.exports = { parsePackageCosts, resolvePackageCosts, sourceCategory, costAt };
