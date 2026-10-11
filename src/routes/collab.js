const express = require("express");
const jwt = require("jsonwebtoken");
const { prisma } = require("../config/db.js");
const { authMiddleware } = require("../middlewares/authMiddleware.js");

const router = express.Router();

// Helper to extract optional auth user
const getOptionalUser = (req) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_key_123");
  } catch {
    return null;
  }
};

router.get("/users/search", async (req, res) => {
  try {
    const ids = req.query.ids;
    const query = (req.query.q || req.query.query || "").trim();

    // กรณีค้นหาด้วย ID เช่น ids=1,2,3 หรือ q=1,2,3 (หรือตัวเลข ID เดียว)
    let idList = [];
    if (ids) {
      idList = String(ids).split(",").map(id => parseInt(id)).filter(Boolean);
    } else if (query && query.split(",").every(item => /^\d+$/.test(item.trim()))) {
      idList = query.split(",").map(item => parseInt(item.trim())).filter(Boolean);
    }

    if (idList.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: idList } },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
      return res.status(200).json({ success: true, users, data: users });
    }
    if (!query) {
      // คืนค่ารายการผู้ใช้เบื้องต้น 10 คนแรก
      const users = await prisma.user.findMany({
        take: 10,
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: { id: "asc" },
      });
      return res.status(200).json({ success: true, users, data: users });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 20,
    });

    return res.status(200).json({ success: true, users, data: users });
  } catch (error) {
    console.error("Search users error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการค้นหาผู้ใช้งาน",
      error: error.message,
    });
  }
});

router.get("/package/:packageId", async (req, res) => {
  try {
    const packageId = parseInt(req.params.packageId);
    if (isNaN(packageId)) {
      return res.status(400).json({ success: false, message: "รหัสแพ็กเกจไม่ถูกต้อง" });
    }

    const collaps = await prisma.bookingCollaps.findMany({
      where: { package_id: packageId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineId: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { id: "asc" }],
    });

    return res.status(200).json({
      success: true,
      count: collaps.length,
      data: collaps,
    });
  } catch (error) {
    console.error("Get package collaps error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ร่วมทริป",
      error: error.message,
    });
  }
});

router.get("/booking/:bookingId", async (req, res) => {
  try {
    const bookingId = parseInt(req.params.bookingId);
    if (isNaN(bookingId)) {
      return res.status(400).json({ success: false, message: "รหัสการจองไม่ถูกต้อง" });
    }

    const collaps = await prisma.bookingCollaps.findMany({
      where: { booking_id: bookingId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineId: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json({
      success: true,
      count: collaps.length,
      data: collaps,
    });
  } catch (error) {
    console.error("Get booking collaps error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลผู้ร่วมจอง",
      error: error.message,
    });
  }
});

router.get("/my", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const myCollaps = await prisma.bookingCollaps.findMany({
      where: { user_id: userId },
      include: {
        package: {
          include: {
            location: true,
            images: {
              where: { is_cover: true },
              take: 1,
            },
          },
        },
        booking: true,
      },
      orderBy: { id: "desc" },
    });

    return res.status(200).json({
      success: true,
      count: myCollaps.length,
      data: myCollaps,
    });
  } catch (error) {
    console.error("Get my collaps error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลทริปของคุณ",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    let {
      package_id,
      user_id,
      email,
      booking_id,
      role = "COLLABORATOR",
      status = "ACCEPTED",
    } = req.body;

    const authUser = getOptionalUser(req);

    if (!package_id) {
      return res.status(400).json({ success: false, message: "กรุณาระบุ package_id" });
    }

    const packageId = parseInt(package_id);
    const bookingId = booking_id ? parseInt(booking_id) : null;

    // ตรวจสอบว่า package มีอยู่จริง
    const pkg = await prisma.package.findUnique({
      where: { id: packageId },
    });
    if (!pkg) {
      return res.status(404).json({ success: false, message: "ไม่พบแพ็กเกจที่ระบุ" });
    }

    // หากระบุ email แต่ไม่ได้ระบุ user_id ให้ค้นหา user ตาม email
    let targetUserId = user_id ? parseInt(user_id) : null;
    if (!targetUserId && email) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: String(email).trim().toLowerCase() },
      });
      if (!userByEmail) {
        return res.status(404).json({
          success: false,
          message: `ไม่พบผู้ใช้งานที่มีอีเมล ${email} ในระบบ`,
        });
      }
      targetUserId = userByEmail.id;
    }

    // หากไม่มีทั้ง user_id และ email ให้ใช้ id จากผู้ใช้ที่ล็อกอินอยู่ (ถ้ามี)
    if (!targetUserId && authUser?.id) {
      targetUserId = authUser.id;
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุ user_id หรือ email ของผู้ใช้ที่ต้องการเพิ่ม",
      });
    }

    // ตรวจสอบว่าผู้ใช้มีอยู่จริง
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true },
    });
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ใช้งาน" });
    }

    // ตรวจสอบว่ามีผู้ใช้นี้ร่วมทริปอยู่แล้วหรือไม่
    const existing = await prisma.bookingCollaps.findFirst({
      where: {
        package_id: packageId,
        user_id: targetUserId,
        ...(bookingId ? { booking_id: bookingId } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (existing) {
      return res.status(200).json({
        success: true,
        alreadyExists: true,
        message: "ผู้ใช้งานนี้มีอยู่ในรายชื่อผู้ร่วมทริปแล้ว",
        data: existing,
      });
    }

    // บันทึก collaborator ลงตาราง booking_collaps
    const newCollab = await prisma.bookingCollaps.create({
      data: {
        package_id: packageId,
        user_id: targetUserId,
        booking_id: bookingId,
        role: role || "COLLABORATOR",
        status: status || "ACCEPTED",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        package: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      message: "เพิ่มผู้ร่วมทริปสำเร็จ",
      data: newCollab,
    });
  } catch (error) {
    console.error("Create collab error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการเพิ่มผู้ร่วมทริป",
      error: error.message,
    });
  }
});

/**
 * PATCH /:id
 * แก้ไขสถานะหรือบทบาท (Role / Status)
 */
router.patch("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, status } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID ไม่ถูกต้อง" });
    }

    const updated = await prisma.bookingCollaps.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(status ? { status } : {}),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "อัปเดตข้อมูลผู้ร่วมทริปสำเร็จ",
      data: updated,
    });
  } catch (error) {
    console.error("Update collab error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการอัปเดตข้อมูล",
      error: error.message,
    });
  }
});

/**
 * DELETE /:id
 * ลบ Collaborator ตาม ID
 */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, message: "ID ไม่ถูกต้อง" });
    }

    const existing = await prisma.bookingCollaps.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ร่วมทริปที่ต้องการลบ" });
    }

    await prisma.bookingCollaps.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "ลบผู้ร่วมทริปเรียบร้อยแล้ว",
      deletedId: id,
    });
  } catch (error) {
    console.error("Delete collab error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการลบผู้ร่วมทริป",
      error: error.message,
    });
  }
});

router.delete("/", async (req, res) => {
  try {
    const package_id = req.body.package_id || req.query.package_id;
    const user_id = req.body.user_id || req.query.user_id;

    if (!package_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุ package_id และ user_id ที่ต้องการลบ",
      });
    }

    const packageId = parseInt(package_id);
    const userId = parseInt(user_id);

    const result = await prisma.bookingCollaps.deleteMany({
      where: {
        package_id: packageId,
        user_id: userId,
      },
    });

    return res.status(200).json({
      success: true,
      message: `ลบผู้ร่วมทริปเรียบร้อยแล้ว (${result.count} รายการ)`,
      count: result.count,
    });
  } catch (error) {
    console.error("Delete collab by package and user error:", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการลบผู้ร่วมทริป",
      error: error.message,
    });
  }
});

module.exports = router;
