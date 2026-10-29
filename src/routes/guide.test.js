const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

test("guide API returns assigned trips and protects customer details", async () => {
  const dbPath = require.resolve("../config/db.js");
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "guide-route-test-secret";

  const packageRecord = {
    id: 9,
    name: "River tour",
    image: null,
    images: [],
    start_date: new Date("2099-01-01T00:00:00Z"),
    end_date: new Date("2099-01-03T00:00:00Z"),
    location: { id: 4, name: "River" },
    dayplans: [{ id: 5, day_num: 1, title: "Arrival", dt: "2099-01-01", activities: [], meals: [] }],
    _count: { bookings: 1 },
    bookings: [{
      id: 12,
      booking_code: "ZT-TEST",
      status: "CONFIRMED",
      createdAt: new Date("2026-10-19T00:00:00Z"),
      contact_name: "Guest",
      contact_phone: "0800000000",
      contact_line_id: null,
      adult_count: 1,
      child_count: 0,
      special_request: "Vegetarian",
      travelers: [{ id: 21, title: "Ms", full_name: "Guest One", phone: "0800000000" }],
      booking_addons: [{ addon_name: "Lunch" }],
    }],
  };
  const employees = {
    1: { id: 1, email: "admin@example.com", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "Admin" } },
    2: { id: 2, email: "guide@example.com", name: "Guide One", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "ไกด์" } },
    3: { id: 3, email: "other@example.com", name: "Guide Two", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "ไกด์" } },
  };
  let detailQuery;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
    emp: { findUnique: async ({ where }) => employees[where.id] || null },
    packageGuide: {
      findMany: async ({ where }) => where.emp_id === 2 ? [{ role: "LEAD_GUIDE", package: packageRecord }] : [],
      findUnique: async (query) => {
        detailQuery = query;
        return query.where.package_id_emp_id.package_id === 9 && query.where.package_id_emp_id.emp_id === 2
          ? { role: "LEAD_GUIDE", package: packageRecord }
          : null;
      },
    },
  } } };
  delete require.cache[require.resolve("./guide.js")];

  const app = express();
  app.use("/api/guide", require("./guide.js"));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, employee, portal = employee?.Role?.name === "Admin" ? "backoffice" : "guide") => fetch(`${origin}${path}`, {
    headers: employee ? { Authorization: `Bearer ${jwt.sign({ id: employee.id, email: employee.email, isEmployee: true, portal }, process.env.JWT_SECRET)}` } : {},
  });

  try {
    assert.equal((await request("/api/guide/packages?guide_id=2")).status, 401);
    assert.equal((await request("/api/guide/packages?guide_id=3", employees[2])).status, 403);
    assert.equal((await request("/api/guide/packages?guide_id=2", employees[2], "backoffice")).status, 403);
    assert.equal((await request("/api/guide/packages?guide_id=2", employees[1], "guide")).status, 403);
    assert.equal((await request("/api/guide/me", employees[2])).status, 200);

    const listResponse = await request("/api/guide/packages?guide_id=2", employees[1]);
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.counts.total, 1);
    assert.equal(list.packages.ongoing[0].name, "River tour");
    assert.deepEqual(list.package_ids.all, [9]);

    const idsResponse = await request("/api/guide/packages/ids?guide_id=2", employees[1]);
    assert.equal(idsResponse.status, 200);
    assert.deepEqual((await idsResponse.json()).package_ids.all, [9]);

    const detailResponse = await request("/api/guide/packages/9?guide_id=2", employees[1]);
    assert.equal(detailResponse.status, 200);
    const detail = (await detailResponse.json()).data;
    assert.equal(detail.customers_summary.total_passengers, 1);
    assert.equal(detail.passenger_manifest[0].booking_code, "ZT-TEST");
    assert.deepEqual(detail.passenger_manifest[0].addons, ["Lunch"]);
    assert.deepEqual(detailQuery.include.package.include.bookings.where, { status: "CONFIRMED" });
    assert.equal((await request("/api/guide/packages/9?guide_id=3", employees[1])).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[require.resolve("./guide.js")];
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
