const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePackageCosts, costAt } = require("./packageCosts.js");
const { summarizePackage } = require("./bookingDashboard.js");

test("cost plan counts fixed and per-person costs without adding deposits twice", () => {
  const plan = parsePackageCosts({ target_travelers: 20, minimum_travelers: 10, cost_items: [
    { category: "TRANSPORT", supplier_name: "Bus", pricing_mode: "FIXED", amount_satang: 1000000, deposit_satang: 200000, paid_deposit_satang: 200000 },
    { category: "FOOD", supplier_name: "Restaurant", pricing_mode: "PER_PERSON", amount_satang: 20000, deposit_satang: 100000, paid_deposit_satang: 100000 },
  ] });
  assert.equal(costAt(plan.items, 10), 1200000);
  assert.equal(costAt(plan.items, 20), 1400000);
  const summary = summarizePackage({ price: 1000, target_travelers: 20, minimum_travelers: 10, costItems: plan.items, bookings: [] });
  assert.equal(summary.breakEvenAdults, 13);
  assert.equal(summary.supplierPaidSatang, 300000);
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

test("rejects invalid deposit and impossible capacity", () => {
  assert.throws(() => parsePackageCosts({ target_travelers: 10, minimum_travelers: 20, cost_items: [] }));
  assert.throws(() => parsePackageCosts({ target_travelers: 20, cost_items: [{ category: "FOOD", supplier_name: "A", pricing_mode: "FIXED", amount_satang: 1000, deposit_satang: 2000 }] }));
});
