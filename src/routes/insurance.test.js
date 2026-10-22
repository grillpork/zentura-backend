const test = require("node:test");
const assert = require("node:assert/strict");

test("public insurance plan follows the package and returns inactive plans for display", async () => {
  const dbPath = require.resolve("../config/db.js");
  const routePath = require.resolve("./insurance.js");
  const previousDb = require.cache[dbPath];
  const previousRoute = require.cache[routePath];
  const packages = {
    1: { insurance_plan_id: 10 },
    2: { insurance_plan_id: 11 },
    3: { insurance_plan_id: null },
    5: { insurance_plan_id: 12 },
  };
  const plans = {
    10: { id: 10, active: true, is_demo: false, premium_satang: 9900 },
    11: { id: 11, active: false, is_demo: true, premium_satang: 16900 },
    12: { id: 12, active: false, is_demo: false, premium_satang: 4800 },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
    package: { findUnique: async ({ where }) => packages[where.id] || null },
    insurancePlan: { findUnique: async ({ where }) => plans[where.id] || null },
  } } };
  delete require.cache[routePath];

  try {
    const router = require("./insurance.js");
    const handler = router.stack.find((layer) => layer.route?.path === "/plan").route.stack[0].handle;
    const request = async (package_id) => {
      const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await handler({ query: { package_id } }, response, (error) => { throw error; });
      return response;
    };

    assert.equal((await request("1")).body.data.id, 10);
    assert.deepEqual((await request("2")).body.data, plans[11]);
    assert.equal((await request("3")).body.data, null);
    assert.deepEqual((await request("5")).body.data, plans[12]);
    assert.equal((await request("4")).statusCode, 404);
    assert.equal((await request("bad")).statusCode, 400);
    assert.equal((await request(undefined)).statusCode, 400);
  } finally {
    if (previousRoute) require.cache[routePath] = previousRoute;
    else delete require.cache[routePath];
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
  }
});
