const test = require("node:test");
const assert = require("node:assert/strict");

test("booking charges and enrolls only when the customer selects insurance", async () => {
  const dbPath = require.resolve("../config/db.js");
  const routePath = require.resolve("./booking.js");
  const previousDb = require.cache[dbPath];
  const previousRoute = require.cache[routePath];
  const previousStripeKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_booking_route";

  let saved;
  let enrolled;
  const updatedAt = new Date("2026-10-22T00:00:00.000Z");
  const plan = { id: 5, active: true, is_demo: false, premium_satang: 9900,
    min_age: 1, max_age: 120, min_trip_days: 1, max_trip_days: 4,
    insurer_name: "Test insurer", plan_name: "Test plan",
    master_policy_no: null, terms_url: "https://example.org/terms", updatedAt };
  const pkg = { id: 2, name: "Test tour", status: "Published", price: 1290,
    start_date: new Date("2099-10-22T00:00:00.000Z"), end_date: new Date("2099-10-22T00:00:00.000Z"),
    booking_start_date: null, booking_end_date: null, insurance_plan_id: 5, addons: [], dayplans: [] };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
    package: { findUnique: async () => pkg },
    insurancePlan: { findUnique: async () => plan },
    $transaction: async (work) => work({
      booking: { create: async ({ data }) => {
        saved = data;
        return { id: 42, ...data, travelers: [{ id: 43, ...data.travelers.create[0] }], booking_addons: [], bookingCollaps: [], package: pkg };
      } },
      insuranceEnrollment: { createMany: async () => { enrolled = true; } },
    }),
  } } };
  delete require.cache[routePath];

  try {
    const router = require("./booking.js");
    const handler = router.stack.find((layer) => layer.route?.path === "/" && layer.route.methods.post).route.stack.at(-1).handle;
    const body = { package_id: 2, travel_date: pkg.start_date.toISOString(), adult_count: 1,
      child_count: 0, contact_name: "Guest One", contact_phone: "0800000000", contact_email: "guest@example.org",
      travelers: [{ full_name: "Guest One", passenger_type: "adult", id_card_or_passport: "1234567890123", date_of_birth: "2000-10-22" }] };
    const request = async (insuranceFields) => {
      const response = { status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
      enrolled = false;
      await handler({ body: { ...body, ...insuranceFields }, user: { id: 7, isEmployee: false, portal: "customer" } }, response);
      return response;
    };

    assert.equal((await request({ insurance_selected: false, insurance_plan_id: 5 })).statusCode, 201);
    assert.equal(saved.insurance_opted_in, false);
    assert.equal(saved.insurance_total_satang, 0);
    assert.equal(saved.insurance_terms_accepted_at, null);
    assert.equal(saved.total_price, 1290);
    assert.equal(enrolled, false);

    plan.active = false;
    assert.equal((await request({ insurance_selected: false })).statusCode, 201);
    assert.equal(saved.insurance_total_satang, 0);
    assert.equal(enrolled, false);
    assert.equal((await request({ insurance_selected: true, insurance_plan_id: 5,
      insurance_plan_updated_at: updatedAt.toISOString(), insurance_terms_acknowledged: true })).statusCode, 409);
    assert.equal(enrolled, false);
    plan.active = true;

    assert.equal((await request({ insurance_selected: true, insurance_plan_id: 5,
      insurance_plan_updated_at: updatedAt.toISOString(), insurance_terms_acknowledged: true })).statusCode, 201);
    assert.equal(saved.insurance_opted_in, true);
    assert.equal(saved.insurance_total_satang, 9900);
    assert.equal(saved.total_price, 1389);
    assert.equal(enrolled, true);

    pkg.end_date = new Date("2099-10-26T00:00:00.000Z");
    assert.equal((await request({ insurance_selected: true, insurance_plan_id: 5,
      insurance_plan_updated_at: updatedAt.toISOString(), insurance_terms_acknowledged: true })).statusCode, 409);
    assert.equal(enrolled, false);
  } finally {
    if (previousRoute) require.cache[routePath] = previousRoute;
    else delete require.cache[routePath];
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousStripeKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previousStripeKey;
  }
});
