const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePackageCosts, resolvePackageCosts, sourceCategory, itineraryPlaces, costAt } = require("./packageCosts.js");
const { summarizePackage } = require("./bookingDashboard.js");

const tx = {
  bus: { findMany: async () => [{ id: 1, layout: { decks: [["1101"]] } }] },
  location: { findMany: async ({ where }) => where.id.in.includes(2) ? [{ id: 2, name: "วัดใหญ่", lct_type: { name: "วัด" } }] : [] },
  partner: { findMany: async ({ where }) => where.id.in.includes(3) ? [{ id: 3, name: "ร้านอาหารอยุธยา", pt_type: { name: "ร้านอาหารและคาเฟ่" } }] : [] },
};
const selected = { busIds: [1], locationIds: [2], partnerIds: [3] };

test("capacity comes from bus seats and costs link to selected places", async () => {
  const plan = parsePackageCosts({ minimum_travelers: 2, cost_items: [
    { partner_id: 3, amount_satang: 100000, deposit_satang: 20000, paid_deposit_satang: 20000 },
    { location_id: 2, amount_satang: 50000 },
  ] });
  const resolved = await resolvePackageCosts(tx, plan, selected);
  assert.equal(resolved.target_travelers, 3);
  assert.equal(resolved.items[0].supplier_name, "ร้านอาหารอยุธยา");
  assert.equal(resolved.items[0].category, "FOOD");
  assert.equal(costAt(resolved.items, 2), 150000);
  const summary = summarizePackage({ price: 1000, minimum_travelers: 2, costItems: resolved.items, packageBuses: [{ bus: { layout: { decks: [["1101"]] } } }], bookings: [] });
  assert.equal(summary.targetTravelers, 3);
  assert.equal(summary.supplierPaidSatang, 20000);
  assert.equal(summary.totalDepositSatang, 20000);
});

test("per-person deposits use the package minimum and require it to be set", () => {
  const costItems = [{ pricing_mode: "PER_PERSON", amount_satang: 10000, deposit_satang: 2500, paid_deposit_satang: 0, paid_balance_satang: 0 }];
  assert.equal(summarizePackage({ minimum_travelers: 15, costItems }).totalDepositSatang, 37500);
  assert.equal(summarizePackage({ minimum_travelers: null, costItems }).totalDepositSatang, null);
});

test("only confirmed bookings with approved payment count as paid", () => {
  const booking = (status, payments) => ({ status, adult_count: 2, child_count: 1, total_price: 2000, addon_total: 0, insurance_total_satang: 0, payments });
  const summary = summarizePackage({ price: 1000, costItems: [{ pricing_mode: "FIXED", amount_satang: 300000, paid_deposit_satang: 0, paid_balance_satang: 0 }], bookings: [
    booking("CONFIRMED", [{ status: "APPROVED", amount: 2000, payment_method: "STRIPE_LIVE_CARD" }]),
    booking("PENDING_PAYMENT", []),
    booking("CANCELLED", [{ status: "APPROVED", amount: 2000, payment_method: "STRIPE_LIVE_CARD" }]),
    booking("AWAITING_VERIFICATION", []),
    booking("CONFIRMED", [{ status: "APPROVED", amount: 500, payment_method: "STRIPE_LIVE_CARD" }]),
    booking("CONFIRMED", [{ status: "APPROVED", amount: 2000, payment_method: "PROMPTPAY_MOCK" }]),
    booking("CONFIRMED", [{ status: "APPROVED", amount: 2000, payment_method: "STRIPE_CARD" }]),
  ] });
  assert.equal(summary.bookingCount, 6);
  assert.equal(summary.reservedTravelers, 18);
  assert.equal(summary.confirmedBookingCount, 4);
  assert.equal(summary.confirmedTravelers, 12);
  assert.equal(summary.paidTravelers, 3);
  assert.equal(summary.receivedSatang, 200000);
  assert.equal(summary.moreAdultsNeeded, 1);
  assert.equal(summary.unverifiedBookingCount, 2);
});

test("booking target compares confirmed reservations, including legacy confirmed rows", () => {
  const booking = (status, people) => ({ status, adult_count: people, child_count: 0, total_price: 1000, addon_total: 0, insurance_total_satang: 0, payments: [] });
  const bookings = [booking("CONFIRMED", 2), booking("CONFIRMED", 1), booking("PENDING_PAYMENT", 1)];
  const legacy = summarizePackage({ minimum_travelers: 15, bookings });
  assert.equal(legacy.bookingCount, 3);
  assert.equal(legacy.confirmedBookingCount, 2);
  assert.equal(legacy.confirmedTravelers, 3);
  assert.equal(legacy.targetBookings, 15);
  assert.equal(legacy.bookingGap, -13);
  assert.equal(legacy.bookingTargetInferred, true);
  assert.equal(summarizePackage({ target_bookings: 1, minimum_travelers: 15, bookings }).bookingGap, 1);
});

test("rejects excess people, unselected sources, shop stops and overpayment", async () => {
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ minimum_travelers: 4, cost_items: [] }), selected), /3 ที่นั่ง/);
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ target_bookings: 4, cost_items: [] }), selected), /3 ที่นั่ง/);
  assert.throws(() => parsePackageCosts({ target_bookings: -1, cost_items: [] }), /เป้าจำนวนการจอง/);
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ cost_items: [{ partner_id: 3, amount_satang: 1000 }] }), { ...selected, partnerIds: [] }), /อยู่ในแพ็กเกจ/);
  assert.equal(sourceCategory("ร้านของฝาก"), null);
  assert.throws(() => parsePackageCosts({ cost_items: [{ location_id: 2, amount_satang: 1000, deposit_satang: 2000 }] }), /เกินต้นทุน/);
  assert.throws(() => parsePackageCosts({ cost_items: [{ location_id: 2, amount_satang: 1000 }, { location_id: 2, amount_satang: 1000 }] }), /ซ้ำ/);
});

test("costs can be attached to included itinerary places without a separate location record", async () => {
  const days = [{ hotel: "ไม่มีค้างคืน (ไปเช้า-เย็นกลับ)", activities: [
    { landmark: "กรุงเทพมหานคร", activity: "ออกเดินทางจากจุดนัดพบ" },
    { landmark: "วัดใหญ่ชัยมงคล", activity: "ชมวัด" },
    { landmark: "วัดมหาธาตุ", activity: "ชมวัด" },
    { landmark: "ร้านอาหารริมน้ำเจ้าพระยา", activity: "รับประทานอาหารกลางวัน" },
    { landmark: "ท่าเรือโบราณ", activity: "ขึ้นเรือ" },
    { landmark: "วัดไชยวัฒนาราม", activity: "ชมวัด" },
    { landmark: "ตลาดของฝากอยุธยา", activity: "ซื้อของฝาก" },
    { landmark: "วัดอื่น", activity: "แวะชม", status: "optional" },
  ] }];
  assert.deepEqual([...itineraryPlaces(days).keys()], ["วัดใหญ่ชัยมงคล", "วัดมหาธาตุ", "ร้านอาหารริมน้ำเจ้าพระยา", "วัดไชยวัฒนาราม"]);
  const plan = parsePackageCosts({ cost_items: [{ itinerary_place: "ร้านอาหารริมน้ำเจ้าพระยา", amount_satang: 100000, deposit_satang: 30000, paid_deposit_satang: 20000 }] });
  const resolved = await resolvePackageCosts(tx, plan, { ...selected, days });
  assert.equal(resolved.items[0].category, "FOOD");
  assert.equal(resolved.items[0].supplier_name, "ร้านอาหารริมน้ำเจ้าพระยา");
  assert.equal(resolved.items[0].itinerary_place, "ร้านอาหารริมน้ำเจ้าพระยา");
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ cost_items: [{ itinerary_place: "ตลาดของฝากอยุธยา", amount_satang: 1000 }] }), { ...selected, days }), /ไม่อยู่ในแพ็กเกจ/);
});
