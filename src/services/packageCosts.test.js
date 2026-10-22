const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePackageCosts, resolvePackageCosts, sourceCategory, costAt } = require("./packageCosts.js");
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
  assert.equal(summary.paidTravelers, 3);
  assert.equal(summary.receivedSatang, 200000);
  assert.equal(summary.moreAdultsNeeded, 1);
  assert.equal(summary.unverifiedBookingCount, 2);
});

test("rejects excess people, unselected sources, shop stops and overpayment", async () => {
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ minimum_travelers: 4, cost_items: [] }), selected), /3 ที่นั่ง/);
  await assert.rejects(resolvePackageCosts(tx, parsePackageCosts({ cost_items: [{ partner_id: 3, amount_satang: 1000 }] }), { ...selected, partnerIds: [] }), /อยู่ในแพ็กเกจ/);
  assert.equal(sourceCategory("ร้านของฝาก"), null);
  assert.throws(() => parsePackageCosts({ cost_items: [{ location_id: 2, amount_satang: 1000, deposit_satang: 2000 }] }), /เกินต้นทุน/);
  assert.throws(() => parsePackageCosts({ cost_items: [{ location_id: 2, amount_satang: 1000 }, { location_id: 2, amount_satang: 1000 }] }), /ซ้ำ/);
});
