const { Router } = require("express");
const { prisma } = require("../config/db.js");

const employeeRoute = Router();

// GET all employees
employeeRoute.get("/employee", async (req, res) => {
  try {
    const list = await prisma.emp.findMany({
      include: {
        Role: {
          select: { id: true, name: true },
        },
      },
      orderBy: { id: "asc" },
    });

    const data = list.map((emp) => ({
      id: emp.id,
      name: emp.name,
      email: emp.email,
      phone: emp.phone || "",
      lineId: emp.lineId || "",
      age: emp.age || null,
      roleId: emp.roleId,
      position: emp.Role ? emp.Role.name : "ไม่ระบุ",
      status: emp.status || "ใช้งาน",
      isPasswordSet: emp.isPasswordSet ?? 0,
      createdAt: emp.createdAt,
      updatedAt: emp.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET /employee error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน", error: error.message });
  }
});

// GET single employee by ID
employeeRoute.get("/employee/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const emp = await prisma.emp.findUnique({
      where: { id },
      include: {
        Role: {
          select: { id: true, name: true },
        },
      },
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลพนักงาน" });
    }

    return res.json({
      success: true,
      data: {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        phone: emp.phone || "",
        lineId: emp.lineId || "",
        age: emp.age || null,
        roleId: emp.roleId,
        position: emp.Role ? emp.Role.name : "ไม่ระบุ",
        status: emp.status || "ใช้งาน",
        isPasswordSet: emp.isPasswordSet ?? 0,
        createdAt: emp.createdAt,
        updatedAt: emp.updatedAt,
      },
    });
  } catch (error) {
    console.error("GET /employee/:id error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลพนักงาน", error: error.message });
  }
});

// Helper to resolve roleId from roleId or position name
async function resolveRoleId(roleId, position) {
  if (roleId) {
    const rId = parseInt(roleId, 10);
    if (!isNaN(rId)) {
      const exists = await prisma.role.findUnique({ where: { id: rId } });
      if (exists) return exists.id;
    }
  }

  if (position) {
    const roleByName = await prisma.role.findFirst({
      where: {
        name: {
          equals: position,
          mode: "insensitive",
        },
      },
    });
    if (roleByName) return roleByName.id;

    // Create role if doesn't exist
    const newRole = await prisma.role.create({
      data: { name: position },
    });
    return newRole.id;
  }

  // Fallback to first role
  const first = await prisma.role.findFirst();
  return first ? first.id : 1;
}

// POST create employee
employeeRoute.post("/employee", async (req, res) => {
  try {
    const { name, email, phone, roleId, position, status, password, lineId, age } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อ-นามสกุล" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "กรุณาระบุอีเมล์" });
    }

    // Check email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, message: "รูปแบบอีเมล์ไม่ถูกต้อง" });
    }

    // Check duplicate email
    const existing = await prisma.emp.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "อีเมล์นี้ถูกใช้งานในระบบแล้ว" });
    }

    const assignedRoleId = await resolveRoleId(roleId, position);

    const newEmp = await prisma.emp.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone ? phone.trim() : "",
        password: password || "123456",
        status: status || "ใช้งาน",
        isPasswordSet: 0,
        lineId: lineId ? lineId.trim() : null,
        age: age ? parseInt(age, 10) : null,
        roleId: assignedRoleId,
      },
      include: {
        Role: {
          select: { id: true, name: true },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "เพิ่มข้อมูลพนักงานสำเร็จ",
      data: {
        id: newEmp.id,
        name: newEmp.name,
        email: newEmp.email,
        phone: newEmp.phone || "",
        lineId: newEmp.lineId || "",
        age: newEmp.age || null,
        roleId: newEmp.roleId,
        position: newEmp.Role ? newEmp.Role.name : "ไม่ระบุ",
        status: newEmp.status || "ใช้งาน",
        isPasswordSet: newEmp.isPasswordSet ?? 0,
        createdAt: newEmp.createdAt,
        updatedAt: newEmp.updatedAt,
      },
    });
  } catch (error) {
    console.error("POST /employee error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มพนักงาน", error: error.message });
  }
});

// PUT update employee
employeeRoute.put("/employee/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const existing = await prisma.emp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลพนักงานที่ต้องการแก้ไข" });
    }

    const { name, email, phone, roleId, position, status, lineId, age } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อ-นามสกุล" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ success: false, message: "กรุณาระบุอีเมล์" });
    }

    // Check duplicate email if changed
    const targetEmail = email.trim().toLowerCase();
    if (targetEmail !== existing.email) {
      const emailTaken = await prisma.emp.findUnique({
        where: { email: targetEmail },
      });
      if (emailTaken) {
        return res.status(400).json({ success: false, message: "อีเมล์นี้ถูกใช้งานในระบบแล้ว" });
      }
    }

    let assignedRoleId = existing.roleId;
    if (roleId || position) {
      assignedRoleId = await resolveRoleId(roleId, position);
    }

    const updated = await prisma.emp.update({
      where: { id },
      data: {
        name: name.trim(),
        email: targetEmail,
        phone: phone !== undefined ? phone.trim() : existing.phone,
        status: status || existing.status,
        isPasswordSet:
          req.body.isPasswordSet !== undefined
            ? parseInt(req.body.isPasswordSet, 10)
            : existing.isPasswordSet,
        lineId: lineId !== undefined ? (lineId ? lineId.trim() : null) : existing.lineId,
        age: age !== undefined ? (age ? parseInt(age, 10) : null) : existing.age,
        roleId: assignedRoleId,
        updatedAt: new Date(Date.now() + 7 * 3600 * 1000),
      },
      include: {
        Role: {
          select: { id: true, name: true },
        },
      },
    });

    return res.json({
      success: true,
      message: "แก้ไขข้อมูลพนักงานสำเร็จ",
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        phone: updated.phone || "",
        lineId: updated.lineId || "",
        age: updated.age || null,
        roleId: updated.roleId,
        position: updated.Role ? updated.Role.name : "ไม่ระบุ",
        status: updated.status || "ใช้งาน",
        isPasswordSet: updated.isPasswordSet ?? 0,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error) {
    console.error("PUT /employee/:id error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการแก้ไขข้อมูลพนักงาน", error: error.message });
  }
});

// DELETE employee
employeeRoute.delete("/employee/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสพนักงานไม่ถูกต้อง" });
    }

    const existing = await prisma.emp.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลพนักงานที่ต้องการลบ" });
    }

    await prisma.emp.delete({ where: { id } });

    return res.json({ success: true, message: "ลบข้อมูลพนักงานสำเร็จ" });
  } catch (error) {
    console.error("DELETE /employee/:id error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบพนักงาน", error: error.message });
  }
});

// POST generate mock employees
employeeRoute.post("/employee/generate-mock", async (req, res) => {
  try {
    const count = parseInt(req.body?.count || 20, 10);
    const thaiNames = [
      "สมพงษ์ จิตดี",
      "กัญญา วงศ์สุวรรณ",
      "อานนท์ เจริญผล",
      "ชลธิชา สัตยา",
      "ธนกฤต มงคลกุล",
      "ปิยะมาศ ศิริโรจน์",
      "วรเชษฐ์ บุญรอด",
      "นพดล แสนสุข",
      "สุพัตรา สุขเกษม",
      "ยุทธนา ศรีวิไล",
      "อัจฉรา รัตนโชติ",
      "ธีรวุฒิ ประเสริฐยิ่ง",
      "วิลาสินี แก้วใส",
      "ชัยรัตน์ ทองแท้",
      "เพ็ญนภา ดวงแก้ว",
      "นรินทร์เดช พิพัฒน์",
      "พัชราภรณ์ พงษ์ศิริ",
      "มนัสวิน ศักดิ์ดา",
      "ดวงพร รุ่งเรือง",
      "ธวัช สว่างวงศ์",
    ];
    const positions = ["Admin", "Sales", "Guide", "Support"];
    const statuses = ["ใช้งาน", "ใช้งาน", "ใช้งาน", "พักงาน", "ปิดใช้งาน"];
    const timestamp = Date.now();

    for (let i = 0; i < count; i++) {
      const name = thaiNames[i % thaiNames.length] + ` (${i + 1})`;
      const email = `emp_${timestamp}_${i + 1}@zentura.co`;
      const phone = `08${Math.floor(10000000 + Math.random() * 90000000)}`;
      const position = positions[i % positions.length];
      const status = statuses[i % statuses.length];
      const roleId = await resolveRoleId(null, position);

      await prisma.emp.create({
        data: {
          name,
          email,
          phone,
          status,
          roleId,
          password: "123456",
        },
      });
    }

    return res.json({
      success: true,
      message: `สร้างข้อมูลจำลอง ${count} รายการสำเร็จ`,
      count,
    });
  } catch (error) {
    console.error("POST /employee/generate-mock error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการสร้างข้อมูลจำลอง",
      error: error.message,
    });
  }
});

// GET all roles
employeeRoute.get("/roles", async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: "asc" },
    });
    return res.json({ success: true, data: roles });
  } catch (error) {
    console.error("GET /roles error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลบทบาท",
      error: error.message,
    });
  }
});

// Alias for /role
employeeRoute.get("/role", async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: "asc" },
    });
    return res.json({ success: true, data: roles });
  } catch (error) {
    console.error("GET /role error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลบทบาท",
      error: error.message,
    });
  }
});

// POST /auth/login & /employee/login (Employee login)
const handleEmployeeLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "กรุณาระบุอีเมล์และรหัสผ่าน" });
    }

    const emp = await prisma.emp.findFirst({
      where: {
        email: {
          equals: email.trim(),
          mode: "insensitive",
        },
      },
      include: {
        Role: {
          select: { id: true, name: true },
        },
      },
    });

    if (!emp) {
      return res.status(401).json({ success: false, message: "อีเมล์หรือรหัสผ่านไม่ถูกต้อง" });
    }

    if (emp.status === "ปิดใช้งาน") {
      return res.status(403).json({ success: false, message: "บัญชีพนักงานนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ" });
    }

    if (emp.password !== password) {
      return res.status(401).json({ success: false, message: "อีเมล์หรือรหัสผ่านไม่ถูกต้อง" });
    }

    const user = {
      id: emp.id,
      name: emp.name,
      email: emp.email,
      phone: emp.phone || "",
      roleId: emp.roleId,
      position: emp.Role ? emp.Role.name : "ไม่ระบุ",
      status: emp.status || "ใช้งาน",
      isPasswordSet: emp.isPasswordSet ?? 0,
    };

    return res.json({
      success: true,
      message: "เข้าสู่ระบบสำเร็จ",
      user,
      token: `emp_token_${emp.id}_${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /auth/login error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเข้าสู่ระบบ", error: error.message });
  }
};
employeeRoute.post("/auth/login", handleEmployeeLogin);
employeeRoute.post("/employee/login", handleEmployeeLogin);

// POST /auth/set-password (First-time password change or reset)
const handleSetPassword = async (req, res) => {
  try {
    const { employeeId, email, currentPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร" });
    }

    const whereClause = employeeId
      ? { id: parseInt(employeeId, 10) }
      : { email: (email || "").trim().toLowerCase() };

    const emp = await prisma.emp.findFirst({
      where: whereClause,
      include: {
        Role: { select: { id: true, name: true } },
      },
    });

    if (!emp) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลพนักงาน" });
    }

    if (currentPassword && emp.password !== currentPassword) {
      return res.status(400).json({ success: false, message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    }

    const updated = await prisma.emp.update({
      where: { id: emp.id },
      data: {
        password: newPassword,
        isPasswordSet: 1,
        updatedAt: new Date(Date.now() + 7 * 3600 * 1000),
      },
      include: {
        Role: { select: { id: true, name: true } },
      },
    });

    const user = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone || "",
      roleId: updated.roleId,
      position: updated.Role ? updated.Role.name : "ไม่ระบุ",
      status: updated.status || "ใช้งาน",
      isPasswordSet: 1,
    };

    return res.json({
      success: true,
      message: "ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว",
      user,
      token: `emp_token_${updated.id}_${Date.now()}`,
    });
  } catch (error) {
    console.error("POST /auth/set-password error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่", error: error.message });
  }
};
employeeRoute.post("/auth/set-password", handleSetPassword);
employeeRoute.post("/employee/set-password", handleSetPassword);

module.exports = { employeeRoute };
