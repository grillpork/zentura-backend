const { prisma } = require("../config/db.js");
const express = require("express");

const LocationRouter = express.Router();

// Get all locations
LocationRouter.get("/", async (req, res) => {
  try {
    const data = await prisma.location.findMany({
      include: {
        lct_type: true,
      },
      orderBy: { id: "asc" },
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error("Get locations error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Get location by ID
LocationRouter.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const data = await prisma.location.findUnique({
      where: { id },
      include: {
        lct_type: true,
      },
    });

    if (!data) {
      return res.status(404).json({ message: "ไม่พบข้อมูลสถานที่" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Get location by id error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Get locations by location type ID
LocationRouter.get("/location_type/:id", async (req, res) => {
  try {
    const typeId = parseInt(req.params.id);
    if (isNaN(typeId)) {
      return res.status(400).json({ message: "รหัสประเภทสถานที่ (location type ID) ไม่ถูกต้อง" });
    }

    const data = await prisma.location.findMany({
      where: {
        lct_type_id: typeId,
      },
      include: {
        lct_type: true,
      },
      orderBy: { id: "asc" },
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("Get locations by location_type error:", error);
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Create location
LocationRouter.post("/", async (req, res) => {
  try {
    const { name, lct_type_id } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "กรุณาระบุชื่อสถานที่ (name)" });
    }

    const createData = {
      name: name.trim(),
    };

    if (lct_type_id !== undefined && lct_type_id !== null) {
      const parsedTypeId = parseInt(lct_type_id);
      if (isNaN(parsedTypeId)) {
        return res.status(400).json({ message: "รหัสประเภทสถานที่ (lct_type_id) ต้องเป็นตัวเลข" });
      }
      createData.lct_type_id = parsedTypeId;
    }

    const data = await prisma.location.create({
      data: createData,
      include: {
        lct_type: true,
      },
    });

    return res.status(201).json(data);
  } catch (error) {
    console.error("Create location error:", error);
    if (error.code === "P2003") {
      return res.status(400).json({ message: "ไม่พบประเภทสถานที่ (lct_type_id) ที่ระบุในระบบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Update location
LocationRouter.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const { name, lct_type_id } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ message: "กรุณาระบุชื่อสถานที่ (name) ให้ถูกต้อง" });
      }
      updateData.name = name.trim();
    }

    if (lct_type_id !== undefined && lct_type_id !== null) {
      const parsedTypeId = parseInt(lct_type_id);
      if (isNaN(parsedTypeId)) {
        return res.status(400).json({ message: "รหัสประเภทสถานที่ (lct_type_id) ต้องเป็นตัวเลข" });
      }
      updateData.lct_type_id = parsedTypeId;
    }

    const data = await prisma.location.update({
      where: { id },
      data: updateData,
      include: {
        lct_type: true,
      },
    });

    return res.status(200).json(data);
  } catch (error) {
    console.error("Update location error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "ไม่พบข้อมูลสถานที่ที่ต้องการแก้ไข" });
    }
    if (error.code === "P2003") {
      return res.status(400).json({ message: "ไม่พบประเภทสถานที่ (lct_type_id) ที่ระบุในระบบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

// Delete location
LocationRouter.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
    }

    const data = await prisma.location.delete({
      where: { id },
    });

    return res.status(200).json({ message: "ลบสถานที่สำเร็จ", data });
  } catch (error) {
    console.error("Delete location error:", error);
    if (error.code === "P2025") {
      return res.status(404).json({ message: "ไม่พบข้อมูลสถานที่ที่ต้องการลบ" });
    }
    return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
  }
});

module.exports = LocationRouter;
