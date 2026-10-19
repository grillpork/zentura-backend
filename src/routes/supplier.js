const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { prisma } = require("../config/db.js");
const { authMiddleware } = require("../middlewares/authMiddleware.js");

const SupplierRouter = express.Router();

const SUPPLIER_ROLE = "suppler"; // ชื่อ role ใน DB (สะกดตามที่สร้างไว้)
const SECRET = process.env.JWT_SECRET || "fallback_secret_key_123";

// ข้อมูล partner + location ที่ supplier สังกัด
const partnerInclude = {
  Role: { select: { id: true, name: true } },
  partner: { select: { id: true, name: true, phone: true, email: true, location: { select: { id: true, name: true } } } },
};

const isSupplier = (emp) => emp?.Role?.name?.toLowerCase() === SUPPLIER_ROLE;

const findSupplierByEmail = async (email) => {
  const normalized = email.trim();
  const byPartner = await prisma.emp.findFirst({
    where: {
      Role: { name: { equals: SUPPLIER_ROLE, mode: "insensitive" } },
      partner: { email: { equals: normalized, mode: "insensitive" } },
    },
    include: partnerInclude,
  });
  return byPartner || prisma.emp.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    include: partnerInclude,
  });
};

const publicUser = (emp) => ({
  id: emp.id,
  name: emp.partner?.name || emp.name,
  email: emp.partner?.email || emp.email,
  phone: emp.partner?.phone || emp.phone || "",
  status: emp.status || "ใช้งาน",
  isPasswordSet: emp.isPasswordSet ?? 0,
  partner_id: emp.partner_id,
  partner: emp.partner || null,
  createdAt: emp.createdAt,
});

const signToken = (emp) =>
  jwt.sign(
    { id: emp.id, email: emp.email, portal: "supplier", partnerId: emp.partner_id },
    SECRET,
    { expiresIn: "1d" }
  );

// token ต้องออกจาก /supplier/login เท่านั้น (portal = supplier) token ของ backoffice ใช้ไม่ได้
const supplierOnly = [
  authMiddleware,
  (req, res, next) =>
    req.user?.portal === "supplier"
      ? next()
      : res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง (สำหรับ Supplier เท่านั้น)" }),
];

const backofficeOnly = [
  authMiddleware,
  async (req, res, next) => {
    try {
      if (req.user?.isEmployee !== true) {
        return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง" });
      }
      const emp = await prisma.emp.findUnique({
        where: { id: req.user.id },
        include: { Role: true },
      });
      if (!emp || emp.email !== req.user.email || isSupplier(emp) || emp.status === "ปิดใช้งาน") {
        return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง" });
      }
      next();
    } catch (error) {
      next(error);
    }
  },
];

// -------------------------------------------------------------
// AUTH FLOW FOR SUPPLIERS
// -------------------------------------------------------------

// เข้าสู่ระบบ Supplier
SupplierRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "กรุณากรอกอีเมลและรหัสผ่าน" });
    }

    const emp = await findSupplierByEmail(email);

    const invalid = () =>
      res.status(401).json({ success: false, message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });

    if (!emp || !isSupplier(emp)) return invalid();
    if (emp.status === "ปิดใช้งาน") {
      return res.status(403).json({ success: false, message: "บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    }

    let ok = emp.password === password;
    if (!ok) {
      try {
        ok = await bcrypt.compare(password, emp.password);
      } catch {
        ok = false;
      }
    }
    if (!ok) return invalid();

    return res.json({ success: true, token: signToken(emp), user: publicUser(emp) });
  } catch (error) {
    console.error("SUPPLIER LOGIN ERROR:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ" });
  }
});

// ตั้งรหัสผ่านครั้งแรก (ยืนยันด้วยรหัสผ่านเดิม)
SupplierRouter.post("/set-password", async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร" });
    }

    const emp = await findSupplierByEmail(email || "");
    if (!emp || !isSupplier(emp) || !(emp.password === currentPassword || await bcrypt.compare(currentPassword || "", emp.password))) {
      return res.status(400).json({ success: false, message: "ข้อมูลไม่ถูกต้อง" });
    }

    const updated = await prisma.emp.update({
      where: { id: emp.id },
      data: { password: await bcrypt.hash(newPassword, 10), isPasswordSet: 1 },
      include: partnerInclude,
    });
    return res.json({ success: true, token: signToken(updated), user: publicUser(updated) });
  } catch (error) {
    console.error("SUPPLIER SET PASSWORD ERROR:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการตั้งรหัสผ่าน" });
  }
});

// โปรไฟล์ + partner + location ของ supplier ที่ล็อกอินอยู่
SupplierRouter.get("/me", supplierOnly, async (req, res) => {
  try {
    const emp = await prisma.emp.findUnique({ where: { id: req.user.id }, include: partnerInclude });
    if (!emp || !isSupplier(emp) || emp.status === "ปิดใช้งาน") {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง" });
    }
    return res.json({ success: true, user: publicUser(emp) });
  } catch (error) {
    console.error("SUPPLIER ME ERROR:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาด" });
  }
});

// -------------------------------------------------------------
// SUPPLIER PORTAL: BUSES ARRIVING AT SUPPLIER'S LOCATION
// -------------------------------------------------------------
SupplierRouter.get("/trips", supplierOnly, async (req, res) => {
  try {
    const emp = await prisma.emp.findUnique({
      where: { id: req.user.id },
      include: partnerInclude,
    });

    if (!emp || !isSupplier(emp) || emp.status === "ปิดใช้งาน") {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const partner = emp.partner;
    if (!partner) {
      return res.json({
        success: true,
        partner: null,
        location: null,
        trips: [],
        message: "บัญชีของคุณยังไม่ได้ผูกกับพาร์ทเนอร์ กรุณาติดต่อผู้ดูแลระบบ",
      });
    }

    const location = partner.location;
    if (!location) {
      return res.json({
        success: true,
        partner: { id: partner.id, name: partner.name },
        location: null,
        trips: [],
        message: `พาร์ทเนอร์ "${partner.name}" ยังไม่ได้กำหนดสถานที่ (Location)`,
      });
    }

    // ดึง Package ทั้งหมดที่มี location หลักตรงกัน หรือมี DayplanTimeline วันใดวันหนึ่งแวะสถานที่นี้
    const packages = await prisma.package.findMany({
      where: {
        OR: [
          { location_id: location.id },
          { dayplans: { some: { location_id: location.id } } },
        ],
      },
      include: {
        location: { select: { id: true, name: true } },
        dayplans: {
          include: { location: { select: { id: true, name: true } } },
          orderBy: { day_num: "asc" },
        },
        bookings: {
          where: {
            status: { in: ["CONFIRMED", "AWAITING_VERIFICATION", "PENDING_PAYMENT"] },
          },
          select: {
            id: true,
            adult_count: true,
            child_count: true,
            status: true,
            travel_date: true,
          },
        },
      },
      orderBy: { start_date: "asc" },
    });

    // ดึงรถบัสที่มีในระบบเพื่อใช้จับคู่/แสดงผล
    const buses = await prisma.bus.findMany({
      where: { status: "ACTIVE" },
      orderBy: { id: "asc" },
    });

    const trips = [];
    packages.forEach((pkg, idx) => {
      const totalPassengers = pkg.bookings.reduce(
        (sum, b) => sum + (b.adult_count || 0) + (b.child_count || 0),
        0
      );

      // คำนวณจำนวนรถบัสคร่าวๆ (ถ้ามี 30-45 คนต่อคัน หรือใช้รถบัสที่ผูกไว้)
      const busAssigned = buses[idx % (buses.length || 1)] || null;
      const busCount = totalPassengers > 0 ? Math.max(1, Math.ceil(totalPassengers / 40)) : 1;

      // หาวันที่แวะจุดนี้
      const stopDays = pkg.dayplans
        .filter((dp) => dp.location_id === location.id)
        .map((dp) => dp.day_num);

      trips.push({
        id: pkg.id,
        packageName: pkg.name,
        packageStatus: pkg.status,
        startDate: pkg.start_date,
        endDate: pkg.end_date,
        locationName: location.name,
        isMainLocation: pkg.location_id === location.id,
        stopDays: stopDays.length > 0 ? stopDays : [1],
        busCount,
        busName: busAssigned ? busAssigned.name : `บัส ${idx + 1}`,
        busPlate: busAssigned?.plate || "รอกำหนด",
        bookingCount: pkg.bookings.length,
        passengerCount: totalPassengers,
        timeWindow: "08:00 - 17:00", // ช่วงเวลาเดินทางในวัน
      });
    });

    return res.json({
      success: true,
      partner: { id: partner.id, name: partner.name },
      location: { id: location.id, name: location.name },
      trips,
    });
  } catch (error) {
    console.error("SUPPLIER TRIPS ERROR:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลเที่ยวรถ" });
  }
});

// -------------------------------------------------------------
// BACKOFFICE ADMIN: MANAGE SUPPLIER ACCOUNTS
// -------------------------------------------------------------

// ดึงรายชื่อบัญชี Supplier ทั้งหมด
SupplierRouter.get("/admin/accounts", backofficeOnly, async (req, res) => {
  try {
    const list = await prisma.emp.findMany({
      where: {
        Role: { name: { equals: SUPPLIER_ROLE, mode: "insensitive" } },
      },
      include: partnerInclude,
      orderBy: { id: "desc" },
    });

    const data = list.map((emp) => ({
      id: emp.id,
      name: emp.partner?.name || emp.name,
      email: emp.partner?.email || emp.email,
      phone: emp.partner?.phone || emp.phone || "",
      lineId: emp.lineId || "",
      status: emp.status || "ใช้งาน",
      isPasswordSet: emp.isPasswordSet ?? 0,
      partner_id: emp.partner_id,
      partner_name: emp.partner?.name || null,
      location_name: emp.partner?.location?.name || null,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET /admin/accounts error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถดึงข้อมูลบัญชี Supplier ได้" });
  }
});

// สร้างบัญชี Supplier ใหม่
SupplierRouter.post("/admin/accounts", backofficeOnly, async (req, res) => {
  try {
    const { name, email, phone, lineId, password, partner_id, status } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อ, อีเมล และรหัสผ่าน" });
    }

    const trimmedEmail = email.trim();
    const existing = await prisma.emp.findFirst({
      where: { email: { equals: trimmedEmail, mode: "insensitive" } },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "อีเมลนี้ถูกใช้งานแล้วในระบบ" });
    }

    // หา Role "suppler"
    let role = await prisma.role.findFirst({
      where: { name: { equals: SUPPLIER_ROLE, mode: "insensitive" } },
    });
    if (!role) {
      role = await prisma.role.create({
        data: { name: SUPPLIER_ROLE, access: "Supplier and partner access" },
      });
    }

    const newEmp = await prisma.emp.create({
      data: {
        name: name.trim(),
        email: trimmedEmail,
        phone: phone ? phone.trim() : null,
        lineId: lineId ? lineId.trim() : null,
        password: await bcrypt.hash(password, 10),
        roleId: role.id,
        partner_id: partner_id ? parseInt(partner_id, 10) : null,
        status: status || "ใช้งาน",
        isPasswordSet: 0,
      },
      include: partnerInclude,
    });

    return res.status(201).json({
      success: true,
      message: "สร้างบัญชี Supplier สำเร็จ",
      data: publicUser(newEmp),
    });
  } catch (error) {
    console.error("POST /admin/accounts error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถสร้างบัญชี Supplier ได้" });
  }
});

// แก้ไขบัญชี Supplier
SupplierRouter.put("/admin/accounts/:id", backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, email, phone, lineId, password, partner_id, status } = req.body;

    const existing = await prisma.emp.findUnique({ where: { id }, include: { Role: true } });
    if (!existing || !isSupplier(existing)) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชี Supplier" });
    }

    if (email && email.trim() !== existing.email) {
      const emailDup = await prisma.emp.findFirst({
        where: {
          email: { equals: email.trim(), mode: "insensitive" },
          id: { not: id },
        },
      });
      if (emailDup) {
        return res.status(400).json({ success: false, message: "อีเมลนี้ถูกใช้งานแล้วในระบบ" });
      }
    }

    const updateData = {
      name: name !== undefined ? name.trim() : existing.name,
      email: email !== undefined ? email.trim() : existing.email,
      phone: phone !== undefined ? (phone ? phone.trim() : null) : existing.phone,
      lineId: lineId !== undefined ? (lineId ? lineId.trim() : null) : existing.lineId,
      partner_id: partner_id !== undefined ? (partner_id ? parseInt(partner_id, 10) : null) : existing.partner_id,
      status: status !== undefined ? status : existing.status,
    };

    if (password && password.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    const updated = await prisma.emp.update({
      where: { id },
      data: updateData,
      include: partnerInclude,
    });

    return res.json({
      success: true,
      message: "อัปเดตข้อมูลบัญชี Supplier สำเร็จ",
      data: publicUser(updated),
    });
  } catch (error) {
    console.error("PUT /admin/accounts error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถอัปเดตบัญชี Supplier ได้" });
  }
});

// ลบบัญชี Supplier
SupplierRouter.delete("/admin/accounts/:id", backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.emp.findUnique({ where: { id }, include: { Role: true } });
    if (!existing || !isSupplier(existing)) {
      return res.status(404).json({ success: false, message: "ไม่พบบัญชี Supplier" });
    }
    await prisma.emp.delete({ where: { id } });
    return res.json({ success: true, message: "ลบบัญชี Supplier สำเร็จ" });
  } catch (error) {
    console.error("DELETE /admin/accounts error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถลบบัญชี Supplier ได้" });
  }
});

// เปิดใช้งานร้านจากข้อมูลพาร์ทเนอร์เดิม หรือกำหนดรหัสใหม่ให้บัญชีร้านเดิม
SupplierRouter.put("/admin/partners/:id/access", backofficeOnly, async (req, res) => {
  try {
    const partnerId = Number(req.params.id);
    const { password } = req.body;
    if (!Number.isInteger(partnerId) || partnerId < 1 || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ success: false, message: "กรุณาระบุพาร์ทเนอร์และรหัสผ่านอย่างน้อย 6 ตัวอักษร" });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      include: { Emp: { include: { Role: true } }, location: true },
    });
    if (!partner) return res.status(404).json({ success: false, message: "ไม่พบพาร์ทเนอร์" });
    const accounts = partner.Emp.filter(isSupplier);
    if (accounts.length > 1) {
      return res.status(409).json({ success: false, message: "ร้านนี้มีบัญชี Supplier หลายบัญชี กรุณาจัดการที่หน้าบัญชี Supplier" });
    }
    const account = accounts[0];
    const email = partner.email.trim().toLowerCase();
    const emailOwner = await prisma.emp.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, ...(account ? { id: { not: account.id } } : {}) },
      select: { id: true },
    });
    if (emailOwner) {
      return res.status(409).json({ success: false, message: "อีเมลของพาร์ทเนอร์ถูกใช้โดยบัญชีอื่นแล้ว" });
    }

    const data = {
      name: partner.name,
      email,
      phone: partner.phone,
      password: await bcrypt.hash(password, 10),
      isPasswordSet: 1,
    };
    let saved;
    if (account) {
      saved = await prisma.emp.update({ where: { id: account.id }, data, include: partnerInclude });
    } else {
      let role = await prisma.role.findFirst({ where: { name: { equals: SUPPLIER_ROLE, mode: "insensitive" } } });
      if (!role) role = await prisma.role.create({ data: { name: SUPPLIER_ROLE, access: "Supplier and partner access" } });
      saved = await prisma.emp.create({
        data: { ...data, roleId: role.id, partner_id: partner.id, status: "ใช้งาน" },
        include: partnerInclude,
      });
    }
    return res.json({ success: true, message: "ตั้งรหัสผ่าน Supplier สำเร็จ", data: publicUser(saved) });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "อีเมลของพาร์ทเนอร์ถูกใช้โดยบัญชีอื่นแล้ว" });
    }
    console.error("SET PARTNER SUPPLIER ACCESS ERROR:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถตั้งรหัสผ่าน Supplier ได้" });
  }
});

module.exports = SupplierRouter;
