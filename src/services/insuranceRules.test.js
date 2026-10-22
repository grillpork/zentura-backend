const test = require("node:test");
const assert = require("node:assert/strict");
const { dateOnly, prepareTravelers } = require("./insuranceRules.js");

const plan = { min_age: 1, max_age: 74 };
const trip = new Date("2026-10-19T00:00:00.000Z");
const adult = { passenger_type: "adult", full_name: "สมชาย ใจดี", id_card_or_passport: "1-2345-67890-12-3", date_of_birth: "2000-10-19" };
const child = { passenger_type: "child", full_name: "เด็กหญิง พิม", id_card_or_passport: "AB123456", date_of_birth: "2020-10-20" };

test("prepares every adult and child with exact eligible ages and normalized IDs", () => {
  const result = prepareTravelers([adult, child], 1, 1, trip, plan);
  assert.equal(result.length, 2);
  assert.equal(result[0].id_card_or_passport, "1234567890123");
  assert.equal(result[1].passenger_type, "child");
  assert.equal(dateOnly(trip).toISOString(), "2026-10-19T00:00:00.000Z");
});

test("rejects mismatched counts, duplicate IDs, invalid dates, and ineligible ages", () => {
  assert.equal(prepareTravelers([adult], 1, 1, trip, plan), null);
  assert.equal(prepareTravelers([adult, { ...child, id_card_or_passport: adult.id_card_or_passport }], 1, 1, trip, plan), null);
  assert.equal(prepareTravelers([{ ...adult, date_of_birth: "2000-02-30" }], 1, 0, trip, plan), null);
  assert.equal(prepareTravelers([{ ...adult, date_of_birth: "1950-10-19" }], 1, 0, trip, plan), null);
});

test("travelers who decline insurance still keep valid identity details without plan age limits", () => {
  const olderTraveler = { ...adult, date_of_birth: "1950-10-19" };
  assert.equal(prepareTravelers([olderTraveler], 1, 0, trip, null)?.length, 1);
  assert.equal(prepareTravelers([{ ...olderTraveler, id_card_or_passport: "bad" }], 1, 0, trip, null), null);
});
