const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

test("login endpoints issue tokens only for their own account type and portal", async () => {
  const dbPath = require.resolve("../config/db.js");
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "portal-login-test-secret";
  const employees = {
    "admin@example.com": { id: 1, email: "admin@example.com", password: "test-password", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "Admin" } },
    "guide@example.com": { id: 2, email: "guide@example.com", password: "test-password", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "ไกด์" } },
    "supplier@example.com": { id: 3, email: "supplier@example.com", password: "test-password", status: "ใช้งาน", isPasswordSet: 1, Role: { name: "suppler" } },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: {
    user: { findUnique: async () => null },
    emp: {
      findFirst: async ({ where }) => employees[where.email.equals] || null,
      findUnique: async ({ where }) => Object.values(employees).find((employee) => employee.id === where.id) || null,
    },
    role: { findMany: async () => [{ id: 1, name: "Admin" }] },
  } } };
  for (const route of ["./auth.js", "./employee.js", "../middlewares/backofficeOnly.js"]) delete require.cache[require.resolve(route)];

  const app = express();
  app.use(express.json());
  app.use("/api/auth", require("./auth.js"));
  app.use("/api", require("./employee.js").employeeRoute);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const login = async (path, email, isEmployee) => {
    const response = await fetch(`${origin}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "test-password", ...(isEmployee === undefined ? {} : { isEmployee }) }),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    assert.equal((await login("/auth/login", "admin@example.com")).status, 401);
    assert.equal((await login("/auth/login", "guide@example.com", true)).status, 403);
    assert.equal((await login("/auth/login", "supplier@example.com", true)).status, 403);
    assert.equal((await login("/guide/login", "admin@example.com")).status, 403);
    assert.equal((await login("/guide/login", "supplier@example.com")).status, 403);
    const admin = await login("/auth/login", "admin@example.com", true);
    assert.equal(admin.status, 200);
    assert.equal(jwt.verify(admin.body.token, process.env.JWT_SECRET).portal, "backoffice");
    const guide = await login("/guide/login", "guide@example.com");
    assert.equal(guide.status, 200);
    assert.equal(jwt.verify(guide.body.token, process.env.JWT_SECRET).portal, "guide");
    const roles = (token) => fetch(`${origin}/api/roles`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal((await roles(admin.body.token)).status, 200);
    assert.equal((await roles(guide.body.token)).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const route of ["./auth.js", "./employee.js", "../middlewares/backofficeOnly.js"]) delete require.cache[require.resolve(route)];
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
