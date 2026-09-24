const { Router } = require("express");
const { prisma } = require("../config/db.js");

const positionRoute = Router();

// GET all positions (excluding customer if desired or include all roles)
positionRoute.get("/position", async (req, res) => {
  try {
    const list = await prisma.role.findMany({
      include: {
        _count: {
          select: { Emp: true },
        },
      },
      orderBy: { id: "asc" },
    });

    const data = list.map((role) => ({
      id: role.id,
      title: role.name,
      name: role.name,
      access: role.access || "General access",
      employees: role._count?.Emp || 0,
      createdAt: role.createAt,
      updatedAt: role.updatedAt,
    }));

    return res.json({ success: true, data });
  } catch (error) {
    console.error("GET /position error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่ง",
      error: error.message,
    });
  }
});

// GET single position by ID
positionRoute.get("/position/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสตำแหน่งไม่ถูกต้อง" });
    }

    const role = await prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Emp: true },
        },
      },
    });

    if (!role) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลตำแหน่ง" });
    }

    return res.json({
      success: true,
      data: {
        id: role.id,
        title: role.name,
        name: role.name,
        access: role.access || "General access",
        employees: role._count?.Emp || 0,
      },
    });
  } catch (error) {
    console.error("GET /position/:id error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่ง",
      error: error.message,
    });
  }
});

// POST create position
positionRoute.post("/position", async (req, res) => {
  try {
    const { title, name, access } = req.body;
    const roleName = (title || name || "").trim();

    if (!roleName) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อตำแหน่ง" });
    }

    // Check duplicate
    const existing = await prisma.role.findFirst({
      where: {
        name: {
          equals: roleName,
          mode: "insensitive",
        },
      },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `ตำแหน่ง "${roleName}" มีอยู่ในระบบแล้ว` });
    }

    const newRole = await prisma.role.create({
      data: {
        name: roleName,
        access: access ? access.trim() : "General access",
      },
    });

    return res.status(201).json({
      success: true,
      message: "เพิ่มตำแหน่งใหม่สำเร็จ",
      data: {
        id: newRole.id,
        title: newRole.name,
        name: newRole.name,
        access: newRole.access,
        employees: 0,
      },
    });
  } catch (error) {
    console.error("POST /position error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการเพิ่มตำแหน่ง",
      error: error.message,
    });
  }
});

// PUT update position
positionRoute.put("/position/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสตำแหน่งไม่ถูกต้อง" });
    }

    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลตำแหน่งที่ต้องการแก้ไข" });
    }

    const { title, name, access } = req.body;
    const roleName = (title || name || "").trim();

    if (!roleName) {
      return res.status(400).json({ success: false, message: "กรุณาระบุชื่อตำแหน่ง" });
    }

    // Check duplicate if name changed
    if (roleName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.role.findFirst({
        where: {
          name: {
            equals: roleName,
            mode: "insensitive",
          },
        },
      });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `ตำแหน่ง "${roleName}" มีอยู่ในระบบแล้ว` });
      }
    }

    const updated = await prisma.role.update({
      where: { id },
      data: {
        name: roleName,
        access: access !== undefined ? access.trim() : existing.access,
        updatedAt: new Date(Date.now() + 7 * 3600 * 1000),
      },
      include: {
        _count: {
          select: { Emp: true },
        },
      },
    });

    return res.json({
      success: true,
      message: "แก้ไขข้อมูลตำแหน่งสำเร็จ",
      data: {
        id: updated.id,
        title: updated.name,
        name: updated.name,
        access: updated.access,
        employees: updated._count?.Emp || 0,
      },
    });
  } catch (error) {
    console.error("PUT /position/:id error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการแก้ไขตำแหน่ง",
      error: error.message,
    });
  }
});

// DELETE position
positionRoute.delete("/position/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "รหัสตำแหน่งไม่ถูกต้อง" });
    }

    const existing = await prisma.role.findUnique({
      where: { id },
      include: {
        _count: {
          select: { Emp: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลตำแหน่งที่ต้องการลบ" });
    }

    if (existing._count?.Emp > 0) {
      return res.status(400).json({
        success: false,
        message: `ไม่สามารถลบตำแหน่ง "${existing.name}" ได้ เนื่องจากมีพนักงานใช้งานอยู่ ${existing._count.Emp} คน กรุณาย้ายหรือเปลี่ยนตำแหน่งพนักงานก่อน`,
      });
    }

    await prisma.role.delete({ where: { id } });

    return res.json({ success: true, message: `ลบตำแหน่ง "${existing.name}" สำเร็จ` });
  } catch (error) {
    console.error("DELETE /position/:id error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการลบตำแหน่ง",
      error: error.message,
    });
  }
});

module.exports = { positionRoute };
