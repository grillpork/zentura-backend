const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

test("setting store access reuses its supplier account and partner identity", async () => {
  const dbPath = require.resolve("../config/db.js");
  const previous = require.cache[dbPath];
  const existing = {
    id: 7,
    name: "Old user",
    email: "old@example.com",
    partner_id: 3,
    Role: { name: "suppler" },
  };
  const partner = {
    id: 3,
    name: "River shop",
    email: "river@example.com",
    phone: "0812345678",
    location_id: 9,
    Emp: [existing],
    location: { id: 9, name: "River" },
  };
  let updated;
  let loginMode = false;
  const prisma = {
    partner: { findUnique: async () => partner },
    emp: {
      findFirst: async ({ where }) => loginMode && where.partner
        ? { ...existing, password: await bcrypt.hash("new-secret", 4), partner }
        : null,
      update: async ({ where, data }) => {
        updated = { where, data };
        return { ...existing, ...data, partner };
      },
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma } };
  const routePath = require.resolve("./supplier.js");
  delete require.cache[routePath];
  try {
    const router = require("./supplier.js");
    const handler = router.stack.find((layer) => layer.route?.path === "/admin/partners/:id/access").route.stack.at(-1).handle;
    const response = { status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: "3" }, body: { password: "new-secret" } }, response);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.email, partner.email);
    assert.deepEqual(updated.where, { id: existing.id });
    assert.equal(updated.data.name, partner.name);
    assert.equal(updated.data.phone, partner.phone);
    assert.equal(updated.data.isPasswordSet, 1);
    assert.equal(await bcrypt.compare("new-secret", updated.data.password), true);

    partner.location_id = null;
    updated = null;
    const invalid = { status: response.status, json: response.json };
    await handler({ params: { id: "3" }, body: { password: "new-secret" } }, invalid);
    assert.equal(invalid.statusCode, 400);
    assert.equal(updated, null);

    loginMode = true;
    const login = router.stack.find((layer) => layer.route?.path === "/login").route.stack.at(-1).handle;
    const signedIn = { status: response.status, json: response.json };
    await login({ body: { email: partner.email, password: "new-secret" } }, signedIn);
    assert.equal(signedIn.body.success, true);
    assert.equal(signedIn.body.user.email, partner.email);
    assert.equal(signedIn.body.user.name, partner.name);
    assert.equal(signedIn.body.user.phone, partner.phone);

    partner.location_id = 9;
    partner.Emp = [];
    let created;
    prisma.role = { findFirst: async () => ({ id: 2 }) };
    prisma.emp.create = async ({ data }) => {
      created = data;
      return { id: 8, ...data, partner };
    };
    const firstAccess = { status: response.status, json: response.json };
    await handler({ params: { id: "3" }, body: { password: "new-secret" } }, firstAccess);
    assert.equal(firstAccess.body.success, true);
    assert.equal(created.partner_id, partner.id);
    assert.equal(created.roleId, 2);
    assert.equal(created.status, "ใช้งาน");
  } finally {
    delete require.cache[routePath];
    if (previous) require.cache[dbPath] = previous;
    else delete require.cache[dbPath];
  }
});
