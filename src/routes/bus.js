const { Router } = require("express");
const { prisma } = require("../config/db.js");
const { seatList, validateLayout } = require("../lib/seats.js");
const { backofficeOnly } = require("../middlewares/backofficeOnly.js");

const BusRoute = Router();

const STATUSES = ["ACTIVE", "PAUSED", "BROKEN"];

// ตรวจและแปลง body -> ข้อมูลรถ (คืน { error } ถ้าไม่ถูกต้อง)
const parseBus = (body) => {
  const name = (body.name || "").trim();
  const status = body.status || "ACTIVE";

  if (!name) return { error: "กรุณาระบุชื่อรถ" };
  const layoutError = validateLayout(body.layout);
  if (layoutError) return { error: layoutError };
  if (!STATUSES.includes(status)) return { error: "สถานะรถไม่ถูกต้อง" };

  return {
    data: {
      name,
      plate: body.plate?.trim() || null,
      layout: { decks: body.layout.decks },
      status,
      note: status === "ACTIVE" ? null : body.note?.trim() || null,
    },
  };
};

const withSeatCount = (b) => ({ ...b, seat_count: seatList(b.layout).length });

BusRoute.get("/", async (req, res) => {
  try {
    const list = await prisma.bus.findMany({ orderBy: { id: "asc" } });
    return res.json({ success: true, data: list.map(withSeatCount) });
  } catch (error) {
    console.error("GET /bus error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลรถ", error: error.message });
  }
});

BusRoute.post("/", ...backofficeOnly, async (req, res) => {
  try {
    const { data, error } = parseBus(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const created = await prisma.bus.create({ data });
    return res.status(201).json({ success: true, message: "เพิ่มรถสำเร็จ", data: withSeatCount(created) });
  } catch (error) {
    console.error("POST /bus error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการเพิ่มรถ", error: error.message });
  }
});

// แก้ไขข้อมูล/ผัง/สถานะ (หยุดใช้, แจ้งรถเสีย ใช้ endpoint นี้ตัวเดียว)
BusRoute.put("/:id", ...backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "รหัสรถไม่ถูกต้อง" });

    const { data, error } = parseBus(req.body);
    if (error) return res.status(400).json({ success: false, message: error });

    const assignedSeats = await prisma.bookingSeat.findMany({ where: { bus_id: id }, select: { seat_code: true } });
    const existingBus = await prisma.bus.findUnique({ where: { id }, select: { layout: true } });
    if (assignedSeats.length && JSON.stringify(existingBus?.layout) !== JSON.stringify(data.layout)) {
      return res.status(409).json({ success: false, message: "รถคันนี้มีผู้โดยสารที่จัดที่นั่งแล้ว จึงเปลี่ยนผังที่นั่งไม่ได้" });
    }

    const plannedPackages = await prisma.packageBus.findMany({
      where: { bus_id: id, package: { minimum_travelers: { not: null } } },
      include: { package: { select: { name: true, minimum_travelers: true, packageBuses: { include: { bus: { select: { layout: true } } } } } } },
    });
    const reducedPlan = plannedPackages.find(({ package: pkg }) =>
      pkg.packageBuses.reduce((sum, row) => sum + seatList(row.bus_id === id ? data.layout : row.bus.layout).length, 0) < pkg.minimum_travelers);
    if (reducedPlan) return res.status(409).json({ success: false, message: `ผังที่นั่งใหม่น้อยกว่าจำนวนขั้นต่ำของแพ็กเกจ “${reducedPlan.package.name}”` });

    const updated = await prisma.bus.update({
      where: { id },
      data: { ...data, updatedAt: new Date(Date.now() + 7 * 3600 * 1000) },
    });
    return res.json({ success: true, message: "แก้ไขข้อมูลรถสำเร็จ", data: withSeatCount(updated) });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ success: false, message: "ไม่พบข้อมูลรถ" });
    console.error("PUT /bus/:id error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการแก้ไขรถ", error: error.message });
  }
});

BusRoute.delete("/:id", ...backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, message: "รหัสรถไม่ถูกต้อง" });

    await prisma.bus.delete({ where: { id } });
    return res.json({ success: true, message: "ลบรถสำเร็จ" });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ success: false, message: "ไม่พบข้อมูลรถ" });
    if (error.code === "P2003") return res.status(409).json({ success: false, message: "รถคันนี้ถูกใช้ในแพ็กเกจหรือมีการจัดที่นั่งแล้ว" });
    console.error("DELETE /bus/:id error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการลบรถ", error: error.message });
  }
});

module.exports = BusRoute;
