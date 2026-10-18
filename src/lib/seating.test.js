const test = require("node:test");
const assert = require("node:assert/strict");
const { travelDay, validateAssignments } = require("./seating.js");

const buses = [{ id: 1, status: "ACTIVE", layout: { decks: [["1101", "1101"]] } }];

test("seat choices must use selected active buses, valid seats, and distinct passengers", () => {
  assert.equal(validateAssignments([{ passenger_index: 0, bus_id: 1, seat_code: "a1" }], 2, buses), null);
  assert.match(validateAssignments([{ passenger_index: 0, bus_id: 1, seat_code: "x1" }], 2, buses), /ที่นั่ง/);
  assert.match(validateAssignments([{ passenger_index: 0, bus_id: 2, seat_code: "a1" }], 2, buses), /รถบัส/);
  assert.match(validateAssignments([{ passenger_index: 0, bus_id: 1, seat_code: "a1" }, { passenger_index: 1, bus_id: 1, seat_code: "a1" }], 2, buses), /ซ้ำ/);
  assert.match(validateAssignments([{ passenger_index: 2, bus_id: 1, seat_code: "a1" }], 2, buses), /ผู้โดยสาร/);
});

test("travel date uses Bangkok calendar day", () => {
  assert.equal(travelDay("2026-10-18T00:30:00+07:00").toISOString(), "2026-10-18T00:00:00.000Z");
});
