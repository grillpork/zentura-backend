const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSupplierTrips } = require("./supplierTrips.js");

test("supplier visits are grouped by departure and stop day with confirmed adult and child totals", () => {
  const location = { id: 8, name: "ร้านอาหารริมแม่น้ำ" };
  const packages = [{
    id: 4,
    name: "อยุธยา 2 วัน",
    status: "Published",
    start_date: new Date("2026-11-01T00:00:00.000Z"),
    dayplans: [
      { location_id: 8, day_num: 2 },
      { location_id: 8, day_num: 2 },
      { location_id: 9, day_num: 1 },
    ],
    packageBuses: [{ bus: { id: 3, name: "BUS1", plate: "กข 1234" } }],
    bookings: [
      { travel_date: new Date("2026-11-01T00:00:00.000Z"), adult_count: 2, child_count: 1 },
      { travel_date: new Date("2026-11-01T00:00:00.000Z"), adult_count: 1, child_count: 0 },
      { travel_date: new Date("2026-11-08T00:00:00.000Z"), adult_count: 2, child_count: 2 },
    ],
  }];

  const trips = buildSupplierTrips(packages, location);
  assert.equal(trips.length, 2);
  assert.deepEqual(trips.map((trip) => ({
    departureDate: trip.departureDate,
    arrivalDate: trip.arrivalDate,
    stopDay: trip.stopDay,
    bookingCount: trip.bookingCount,
    adultCount: trip.adultCount,
    childCount: trip.childCount,
    passengerCount: trip.passengerCount,
  })), [
    { departureDate: "2026-11-01", arrivalDate: "2026-11-02", stopDay: 2, bookingCount: 2, adultCount: 3, childCount: 1, passengerCount: 4 },
    { departureDate: "2026-11-08", arrivalDate: "2026-11-09", stopDay: 2, bookingCount: 1, adultCount: 2, childCount: 2, passengerCount: 4 },
  ]);
  assert.deepEqual(trips[0].buses, [{ id: 3, name: "BUS1", plate: "กข 1234" }]);
});

test("a package with no confirmed bookings keeps its planned visit at zero", () => {
  const trips = buildSupplierTrips([{
    id: 5,
    name: "ทริปใหม่",
    status: "Published",
    start_date: new Date("2026-11-05T00:00:00.000Z"),
    dayplans: [{ location_id: 8, day_num: 1 }],
    packageBuses: [],
    bookings: [],
  }], { id: 8, name: "ร้านอาหารริมแม่น้ำ" });

  assert.equal(trips.length, 1);
  assert.equal(trips[0].bookingCount, 0);
  assert.equal(trips[0].passengerCount, 0);
});

test("an archived package appears only for departures with confirmed bookings", () => {
  const trips = buildSupplierTrips([{
    id: 6,
    name: "ทริปปิดขาย",
    status: "Archived",
    start_date: new Date("2026-10-01T00:00:00.000Z"),
    dayplans: [{ location_id: 8, day_num: 1 }],
    packageBuses: [],
    bookings: [{ travel_date: new Date("2026-11-01T00:00:00.000Z"), adult_count: 1, child_count: 1 }],
  }], { id: 8, name: "ร้านอาหารริมแม่น้ำ" });

  assert.deepEqual(trips.map(({ departureDate, passengerCount }) => ({ departureDate, passengerCount })), [
    { departureDate: "2026-11-01", passengerCount: 2 },
  ]);
});
