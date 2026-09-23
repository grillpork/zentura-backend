const { prisma } = require("../config/db.js");
const express = require("express");

const LocationTypeRouter = express.Router();

// Get all location types
LocationTypeRouter.get("/", async (req, res) => {
  try {
    const data = await prisma.locationType.findMany({
      orderBy: { id: "asc" },
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Get location types error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Get location type by ID
LocationTypeRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const data = await prisma.locationType.findUnique({
      where: { id },
      include: { locations: true },
    });

    if (!data) {
      return res.status(404).json({ message: "ไม่พบข้อมูลประเภทสถานที่" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Get location type by id error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Create location type
LocationTypeRouter.post("/", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "กรุณาระบุชื่อประเภทสถานที่ (name)" });
    }

    const existingType = await prisma.locationType.findUnique({
      where: { name: name.trim() },
    });
    if (existingType) {
      return res.status(400).json({ message: "มีประเภทสถานที่นี้ในระบบแล้ว" });
    }

    const data = await prisma.locationType.create({
      data: {
        name: name.trim(),
      },
    });
    return res.status(201).json(data);
  } catch (error) {
    console.error("Create location type error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Update location type
LocationTypeRouter.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "กรุณาระบุชื่อประเภทสถานที่ (name)" });
    }

    const data = await prisma.locationType.update({
      where: { id },
      data: { name: name.trim() },
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Update location type error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "ไม่พบข้อมูลประเภทสถานที่ที่ต้องการแก้ไข" });
    }
    if (error.code === "P2002") {
      return res.status(400).json({ message: "ชื่อประเภทสถานที่นี้มีอยู่แล้วในระบบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Delete location type
LocationTypeRouter.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const data = await prisma.locationType.delete({
      where: { id },
    });
    return res.status(200).json({ message: "ลบประเภทสถานที่สำเร็จ", data });
  } catch (error) {
    console.error("Delete location type error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "ไม่พบข้อมูลประเภทสถานที่ที่ต้องการลบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

module.exports = LocationTypeRouter;
