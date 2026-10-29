const express = require("express");
const { prisma } = require("../config/db.js");
const { authMiddleware } = require("../middlewares/authMiddleware.js");
const { employeePortal } = require("../lib/employeePortal.js");

const router = express.Router();

router.use(authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.isEmployee !== true || !["guide", "backoffice"].includes(req.user?.portal)) {
      return res.status(403).json({ success: false, message: "สำหรับพนักงานหลังบ้านเท่านั้น" });
    }
    const employee = await prisma.emp.findUnique({
      where: { id: req.user.id },
      include: { Role: true },
    });
    if (!employee || employee.email !== req.user.email || employee.status === "ปิดใช้งาน") {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึง" });
    }

    const role = employee.Role?.name?.toLowerCase();
    const isAdmin = role === "admin" && req.user.portal === "backoffice";
    const isGuide = employeePortal(employee.Role?.name) === "guide" && req.user.portal === "guide";
    if ((!isAdmin && !isGuide) || employee.isPasswordSet !== 1) {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงงานไกด์" });
    }
    const guideId = Number(req.query.guide_id || employee.id);
    if (!Number.isSafeInteger(guideId) || guideId <= 0) {
      return res.status(400).json({ success: false, message: "รหัสไกด์ไม่ถูกต้อง" });
    }
    if (!isAdmin && guideId !== employee.id) {
      return res.status(403).json({ success: false, message: "ดูงานของไกด์คนอื่นไม่ได้" });
    }
    req.employee = employee;
    req.guideId = guideId;
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/me", async (req, res) => {
  if (req.user.portal !== "guide") return res.status(403).json({ success: false, message: "สำหรับไกด์เท่านั้น" });
  return res.json({ success: true, user: { id: req.user.id, name: req.employee.name, email: req.employee.email, role: req.employee.Role.name, isEmployee: true } });
});

const bookingWhere = { status: "CONFIRMED" };

const thaiDate = (date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

const packageCategory = (pkg) => {
  const lastDay = pkg.end_date || pkg.dayplans?.at(-1)?.dt || pkg.start_date;
  if (!lastDay) return "ongoing";
  const endDate = new Date(lastDay);
  if (Number.isNaN(endDate.getTime())) return "ongoing";
  return thaiDate(endDate) < thaiDate(new Date()) ? "past" : "ongoing";
};

const packageSummary = ({ package: pkg, role }) => ({
  id: pkg.id,
  name: pkg.name,
  image: pkg.image || pkg.images?.[0]?.image_url || null,
  start_date: pkg.start_date || pkg.dayplans?.[0]?.dt || null,
  end_date: pkg.end_date || pkg.dayplans?.at(-1)?.dt || null,
  location: pkg.location,
  guide_assignment: { role },
  total_bookings: pkg._count?.bookings || 0,
  category: packageCategory(pkg),
});

async function getGuideAssignments(guideId) {
  const guide = await prisma.emp.findUnique({
    where: { id: guideId },
    include: { Role: true },
  });
  if (!guide || !["guide", "ไกด์"].includes(guide.Role?.name?.toLowerCase())) return null;

  const assignments = await prisma.packageGuide.findMany({
    where: { emp_id: guideId },
    include: {
      package: {
        include: {
          location: { select: { id: true, name: true } },
          images: { orderBy: { sort_order: "asc" }, take: 1 },
          dayplans: { select: { dt: true }, orderBy: { day_num: "asc" } },
          _count: { select: { bookings: { where: bookingWhere } } },
        },
      },
    },
    orderBy: { id: "desc" },
  });
  return { guide, assignments };
}

function splitPackages(assignments) {
  const all = assignments.map(packageSummary);
  const ongoing = all.filter((pkg) => pkg.category === "ongoing");
  const past = all.filter((pkg) => pkg.category === "past");
  return {
    packages: { all, ongoing, past },
    package_ids: {
      all: all.map((pkg) => pkg.id),
      ongoing: ongoing.map((pkg) => pkg.id),
      past: past.map((pkg) => pkg.id),
    },
    counts: { total: all.length, ongoing: ongoing.length, past: past.length },
  };
}

router.get("/packages", async (req, res) => {
  try {
    const result = await getGuideAssignments(req.guideId);
    if (!result) return res.status(404).json({ success: false, message: "ไม่พบไกด์" });
    const { guide, assignments } = result;
    return res.json({
      success: true,
      guide: { id: guide.id, name: guide.name, email: guide.email, phone: guide.phone, role: guide.Role.name },
      ...splitPackages(assignments),
    });
  } catch (error) {
    console.error("GET /guide/packages error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถดึงงานไกด์ได้" });
  }
});

router.get("/packages/ids", async (req, res) => {
  try {
    const result = await getGuideAssignments(req.guideId);
    if (!result) return res.status(404).json({ success: false, message: "ไม่พบไกด์" });
    const { package_ids, counts } = splitPackages(result.assignments);
    return res.json({ success: true, package_ids, counts });
  } catch (error) {
    console.error("GET /guide/packages/ids error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถดึงรหัสแพ็กเกจได้" });
  }
});

router.get("/packages/:id", async (req, res) => {
  const packageId = Number(req.params.id);
  if (!Number.isSafeInteger(packageId) || packageId <= 0) {
    return res.status(400).json({ success: false, message: "รหัสแพ็กเกจไม่ถูกต้อง" });
  }
  try {
    const assignment = await prisma.packageGuide.findUnique({
      where: { package_id_emp_id: { package_id: packageId, emp_id: req.guideId } },
      include: {
        package: {
          include: {
            location: { select: { id: true, name: true } },
            dayplans: {
              orderBy: { day_num: "asc" },
              include: { activities: { orderBy: { id: "asc" } }, meals: { include: { meal: true } } },
            },
            bookings: {
              where: bookingWhere,
              orderBy: { createdAt: "asc" },
              include: {
                travelers: { orderBy: { id: "asc" } },
                booking_addons: true,
              },
            },
          },
        },
      },
    });
    if (!assignment) return res.status(404).json({ success: false, message: "ไม่พบแพ็กเกจที่ไกด์ได้รับมอบหมาย" });

    const pkg = assignment.package;
    const bookings = pkg.bookings.map((booking) => ({
      id: booking.id,
      booking_code: booking.booking_code,
      status: booking.status,
      created_at: booking.createdAt,
      contact_info: { name: booking.contact_name, phone: booking.contact_phone, line_id: booking.contact_line_id },
      headcount: {
        adults: booking.adult_count,
        children: booking.child_count,
        total: booking.adult_count + booking.child_count,
      },
      special_request: booking.special_request,
      travelers: booking.travelers,
    }));
    const passengerManifest = pkg.bookings.flatMap((booking) =>
      booking.travelers.map((traveler) => ({
        ...traveler,
        booking_code: booking.booking_code,
        addons: booking.booking_addons.map((addon) => addon.addon_name),
        special_request: booking.special_request,
      }))
    );
    const summary = {
      total_bookings: bookings.length,
      total_adults: bookings.reduce((count, booking) => count + booking.headcount.adults, 0),
      total_children: bookings.reduce((count, booking) => count + booking.headcount.children, 0),
      status_breakdown: { CONFIRMED: bookings.length },
      special_requests_count: bookings.filter((booking) => booking.special_request?.trim()).length,
    };
    summary.total_passengers = summary.total_adults + summary.total_children;

    return res.json({ success: true, data: {
      package: {
        id: pkg.id,
        name: pkg.name,
        category: packageCategory(pkg),
        dayplans: pkg.dayplans,
      },
      bookings,
      passenger_manifest: passengerManifest,
      customers_summary: summary,
    } });
  } catch (error) {
    console.error("GET /guide/packages/:id error:", error);
    return res.status(500).json({ success: false, message: "ไม่สามารถดึงรายละเอียดงานไกด์ได้" });
  }
});

module.exports = router;
