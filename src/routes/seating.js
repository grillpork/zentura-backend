const { Router } = require("express");
const { prisma } = require("../config/db.js");
const { authMiddleware } = require("../middlewares/authMiddleware.js");
const { seatList } = require("../lib/seats.js");
const { travelDay, validateAssignments } = require("../lib/seating.js");
const { employeePortal } = require("../lib/employeePortal.js");

const router = Router();

router.use(authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.isEmployee !== true || req.user.portal !== "backoffice") return res.status(403).json({ message: "สำหรับพนักงานหลังบ้านเท่านั้น" });
    const employee = await prisma.emp.findUnique({ where: { id: req.user.id }, include: { Role: true } });
    if (!employee || employee.email !== req.user.email || employee.status === "ปิดใช้งาน" || employee.isPasswordSet !== 1 || employeePortal(employee.Role?.name) !== "backoffice") {
      return res.status(403).json({ message: "ไม่มีสิทธิ์จัดที่นั่ง" });
    }
    next();
  } catch (error) {
    next(error);
  }
});

const paidBooking = { status: "CONFIRMED", payments: { some: { status: "APPROVED" } } };
const packageBuses = { packageBuses: { include: { bus: true } } };

router.get("/", async (req, res) => {
  try {
    // shortcut: load all paid bookings; add pagination when this list becomes large.
    const bookings = await prisma.booking.findMany({
      where: paidBooking,
      orderBy: { createdAt: "desc" },
      include: {
        package: { select: { id: true, name: true } },
        seats: true,
      },
    });
    return res.json({ data: bookings.map((booking) => ({
      id: booking.id,
      booking_code: booking.booking_code,
      contact_name: booking.contact_name,
      package: booking.package,
      travel_date: booking.travel_date,
      passenger_count: booking.adult_count + booking.child_count,
      assigned_count: booking.seats.length,
    })) });
  } catch (error) {
    console.error("GET /seating error:", error);
    return res.status(500).json({ message: "ไม่สามารถดึงรายการจัดที่นั่งได้" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "รหัสการจองไม่ถูกต้อง" });
    const booking = await prisma.booking.findFirst({
      where: { id, ...paidBooking },
      include: {
        package: { include: packageBuses },
        travelers: { orderBy: { id: "asc" } },
        seats: true,
      },
    });
    if (!booking) return res.status(404).json({ message: "ไม่พบการจองที่ชำระเงินแล้ว" });
    const buses = booking.package.packageBuses.map(({ bus }) => ({ ...bus, seat_count: seatList(bus.layout).length }));
    const taken = buses.length ? await prisma.bookingSeat.findMany({
      where: { bus_id: { in: buses.map((bus) => bus.id) }, travel_date: travelDay(booking.travel_date), booking_id: { not: id } },
      select: { bus_id: true, seat_code: true },
    }) : [];
    return res.json({ data: {
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        contact_name: booking.contact_name,
        package_name: booking.package.name,
        travel_date: booking.travel_date,
        passenger_count: booking.adult_count + booking.child_count,
        travelers: booking.travelers,
      },
      buses,
      assignments: booking.seats,
      taken,
    } });
  } catch (error) {
    console.error("GET /seating/:id error:", error);
    return res.status(500).json({ message: "ไม่สามารถดึงผังที่นั่งได้" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "รหัสการจองไม่ถูกต้อง" });
    const saved = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({ where: { id, ...paidBooking }, include: { package: { include: packageBuses } } });
      if (!booking) return { error: "ไม่พบการจองที่ชำระเงินแล้ว", status: 404 };
      const buses = booking.package.packageBuses.map(({ bus }) => bus);
      const error = validateAssignments(req.body?.assignments, booking.adult_count + booking.child_count, buses);
      if (error) return { error, status: 400 };
      await tx.bookingSeat.deleteMany({ where: { booking_id: id } });
      const date = travelDay(booking.travel_date);
      if (req.body.assignments.length) {
        await tx.bookingSeat.createMany({ data: req.body.assignments.map((item) => ({
          booking_id: id,
          passenger_index: item.passenger_index,
          bus_id: item.bus_id,
          travel_date: date,
          seat_code: item.seat_code,
        })) });
      }
      return { data: await tx.bookingSeat.findMany({ where: { booking_id: id }, orderBy: { passenger_index: "asc" } }) };
    });
    if (saved.error) return res.status(saved.status).json({ message: saved.error });
    return res.json(saved);
  } catch (error) {
    if (error.code === "P2002" || error.code === "P2034") return res.status(409).json({ message: "ที่นั่งนี้มีผู้อื่นเลือกแล้ว กรุณาโหลดข้อมูลใหม่" });
    console.error("PUT /seating/:id error:", error);
    return res.status(500).json({ message: "บันทึกที่นั่งไม่สำเร็จ" });
  }
});

module.exports = router;
