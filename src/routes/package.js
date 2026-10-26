const { prisma } = require("../config/db.js");
const express = require("express");
const { dateOnly } = require("../services/insuranceRules.js");
const { backofficeOnly } = require("../middlewares/backofficeOnly.js");
const { parsePackageCosts, resolvePackageCosts } = require("../services/packageCosts.js");

const router = express.Router();

const parseDate = (d) => {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const parseBusIds = (value) => {
  if (value === undefined) return null;
  const ids = Array.isArray(value) ? value.map((id) => typeof id === "number" || (typeof id === "string" && /^\d+$/.test(id)) ? Number(id) : NaN) : [];
  if (!Array.isArray(value) || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    const error = new Error("รายการรถบัสไม่ถูกต้อง");
    error.isCustom = true;
    throw error;
  }
  return ids;
};

const selectedLocationIds = (locationId, days = []) => [locationId, ...days.map((day) => day.id_location || day.location_id || locationId)].map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
const selectedPartnerIds = (partnerId, partnerIds) => (Array.isArray(partnerIds) && partnerIds.length ? partnerIds : partnerId ? [partnerId] : []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);

const parseInsurancePlanId = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error("แผนประกันไม่ถูกต้อง");
    error.isCustom = true;
    throw error;
  }
  return id;
};

const verifyInsurancePlan = async (id, startDate, endDate) => {
  if (!id) return;
  const plan = await prisma.insurancePlan.findUnique({ where: { id }, select: { min_trip_days: true, max_trip_days: true } });
  if (!plan) {
    const error = new Error("ไม่พบแผนประกันที่เลือก");
    error.isCustom = true;
    throw error;
  }
  if (startDate && endDate && plan.min_trip_days != null && plan.max_trip_days != null) {
    const tripDays = Math.round((dateOnly(endDate) - dateOnly(startDate)) / 86400000) + 1;
    if (tripDays < plan.min_trip_days || tripDays > plan.max_trip_days) {
      const error = new Error(`แผนประกันนี้รองรับทริป ${plan.min_trip_days}–${plan.max_trip_days} วัน กรุณาเลือกแผนที่ตรงกับจำนวนวันเดินทาง`);
      error.isCustom = true;
      throw error;
    }
  }
};

const syncPackageBuses = async (tx, packageId, ids, previousIds = []) => {
  if (ids === null) return;
  const buses = await tx.bus.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  if (buses.length !== ids.length || buses.some((bus) => bus.status !== "ACTIVE" && !previousIds.includes(bus.id))) {
    const error = new Error("เลือกรถบัสที่ใช้งานอยู่เท่านั้น");
    error.isCustom = true;
    throw error;
  }
  const removed = previousIds.filter((id) => !ids.includes(id));
  if (removed.length && await tx.bookingSeat.findFirst({ where: { booking: { package_id: packageId }, bus_id: { in: removed } } })) {
    const error = new Error("ไม่สามารถนำรถออกจากแพ็กเกจได้ เพราะมีการจัดที่นั่งแล้ว");
    error.isCustom = true;
    throw error;
  }
  if (ids.length === previousIds.length && ids.every((id) => previousIds.includes(id))) return;
  await tx.packageBus.deleteMany({ where: { package_id: packageId } });
  if (ids.length) await tx.packageBus.createMany({ data: ids.map((bus_id) => ({ package_id: packageId, bus_id })) });
};

// Get all packages
router.get("/", async (req, res) => {
  try {
    const data = await prisma.package.findMany({
      include: {
        location: true,
        partner: {
          include: {
            pt_type: true,
          },
        },
        partners: {
          include: {
            partner: {
              include: {
                pt_type: true,
              },
            },
          },
        },
        images: {
          orderBy: { sort_order: "asc" },
        },
        addons: {
          orderBy: { id: "asc" },
        },
        dayplans: {
          orderBy: { day_num: "asc" },
          include: {
            activities: true,
            meals: {
              include: { meal: true },
            },
          },
        },
        packageGuides: {
          include: {
            emp: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                roleId: true,
                Role: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        packageBuses: { select: { bus_id: true } },
      },
      orderBy: { id: "desc" },
    });
    return res.status(200).json(data.map(({ target_travelers, minimum_travelers, target_bookings, ...pkg }) => pkg));
  } catch (error) {
    console.error("Get packages error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/:id/costs", ...backofficeOnly, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ message: "รหัสแพ็กเกจไม่ถูกต้อง" });
  try {
    const data = await prisma.package.findUnique({ where: { id }, select: { target_travelers: true, minimum_travelers: true, target_bookings: true, costItems: { orderBy: { id: "asc" } }, packageBuses: { select: { bus: { select: { layout: true } } } } } });
    if (!data) return res.status(404).json({ message: "ไม่พบแพ็กเกจ" });
    const { seatList } = require("../lib/seats.js");
    const { packageBuses, ...costData } = data;
    return res.json({ ...costData, target_travelers: packageBuses.reduce((sum, row) => sum + seatList(row.bus.layout).length, 0) || null });
  } catch (error) { return res.status(500).json({ message: error.message }); }
});

// Get package by ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const data = await prisma.package.findUnique({
      where: { id },
      include: {
        location: true,
        partner: {
          include: {
            pt_type: true,
          },
        },
        partners: {
          include: {
            partner: {
              include: {
                pt_type: true,
              },
            },
          },
        },
        images: {
          orderBy: { sort_order: "asc" },
        },
        addons: {
          orderBy: { id: "asc" },
        },
        dayplans: {
          orderBy: { day_num: "asc" },
          include: {
            activities: {
              orderBy: { id: "asc" },
            },
            meals: {
              include: { meal: true },
            },
            location: true,
          },
        },
        packageGuides: {
          include: {
            emp: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                roleId: true,
                Role: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { id: "asc" },
        },
        packageBuses: { include: { bus: true } },
        bookingCollaps: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!data) return res.status(404).json({ message: "Package not found" });
    const { target_travelers, minimum_travelers, target_bookings, ...publicPackage } = data;
    return res.status(200).json(publicPackage);
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

// GET /api/packages/:id/buses?travel_date=YYYY-MM-DD
// ดึงข้อมูลรถบัสและที่นั่งที่ว่าง/จองแล้วสำหรับแพ็กเกจนี้
router.get("/:id/buses", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid package id" });

    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        packageBuses: {
          include: { bus: true },
        },
        dayplans: { orderBy: { day_num: "asc" } },
      },
    });
    if (!pkg) return res.status(404).json({ message: "Package not found" });

    let buses = (pkg.packageBuses || [])
      .map((pb) => pb.bus)
      .filter((b) => b && b.status === "ACTIVE");

    if (buses.length === 0) {
      buses = await prisma.bus.findMany({
        where: { status: "ACTIVE" },
        orderBy: { id: "asc" },
      });
    }

    const { seatList } = require("../lib/seats.js");
    const { travelDay } = require("../lib/seating.js");

    const travelDateStr = req.query.travel_date || pkg.start_date || pkg.dayplans?.[0]?.dt;
    let taken = [];

    if (travelDateStr && buses.length > 0) {
      try {
        const tDate = travelDay(travelDateStr);
        taken = await prisma.bookingSeat.findMany({
          where: {
            bus_id: { in: buses.map((b) => b.id) },
            travel_date: tDate,
          },
          select: {
            bus_id: true,
            seat_code: true,
            passenger_index: true,
          },
        });
      } catch (e) {
        console.error("travelDay error in /:id/buses:", e);
      }
    }

    return res.json({
      success: true,
      buses: buses.map((b) => ({
        id: b.id,
        name: b.name,
        plate: b.plate,
        layout: b.layout,
        seat_count: seatList(b.layout).length,
        seats: seatList(b.layout),
      })),
      taken,
    });
  } catch (error) {
    console.error("GET /packages/:id/buses error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

function datesOverlap(startA, endA, startB, endB) {
  if (!startA || !startB) return false;
  const sA = typeof startA === "string" ? startA.split("T")[0] : new Date(startA).toISOString().split("T")[0];
  const eA = endA ? (typeof endA === "string" ? endA.split("T")[0] : new Date(endA).toISOString().split("T")[0]) : sA;
  const sB = typeof startB === "string" ? startB.split("T")[0] : new Date(startB).toISOString().split("T")[0];
  const eB = endB ? (typeof endB === "string" ? endB.split("T")[0] : new Date(endB).toISOString().split("T")[0]) : sB;
  return sA <= eB && eA >= sB;
}

function formatDateRange(start, end) {
  if (!start) return "-";
  const s = typeof start === "string" ? start.split("T")[0] : new Date(start).toISOString().split("T")[0];
  const e = end ? (typeof end === "string" ? end.split("T")[0] : new Date(end).toISOString().split("T")[0]) : s;
  return s === e ? s : `${s} ถึง ${e}`;
}

// Create new package
router.post("/", ...backofficeOnly, async (req, res) => {
  try {
    const { name, description, price, location_id, status, image, images, days, partner_id, partner_ids, addons, guides, bus_ids, insurance_plan_id, booking_start_date, booking_end_date, start_date, end_date } = req.body;
    const busIds = parseBusIds(bus_ids);
    const costs = parsePackageCosts(req.body);
    const insurancePlanId = parseInsurancePlanId(insurance_plan_id);
    if (!insurancePlanId) return res.status(400).json({ message: "กรุณาเลือกแผนประกันหนึ่งแผนสำหรับแพ็กเกจ" });

    const primaryPartnerId = partner_id ? parseInt(partner_id) : (Array.isArray(partner_ids) && partner_ids.length > 0 ? parseInt(partner_ids[0]) : null);

    const firstDayDt = Array.isArray(days) ? days.find((d) => d && d.dt)?.dt : null;
    const lastDayDt = Array.isArray(days) ? [...days].reverse().find((d) => d && d.dt)?.dt : null;

    const calculatedStartDate = parseDate(start_date) || (firstDayDt ? parseDate(firstDayDt) : null);
    const calculatedEndDate = parseDate(end_date) || (lastDayDt ? parseDate(lastDayDt) : null);
    await verifyInsurancePlan(insurancePlanId, calculatedStartDate, calculatedEndDate);

    // Determine cover image URL
    let coverImageUrl = image;
    if (Array.isArray(images) && images.length > 0) {
      const coverObj = images.find((img) => typeof img === "object" && img.is_cover);
      if (coverObj) {
        coverImageUrl = coverObj.image_url;
      } else {
        coverImageUrl = typeof images[0] === "string" ? images[0] : images[0].image_url;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const resolvedCosts = await resolvePackageCosts(tx, costs, {
        busIds: busIds || [],
        locationIds: selectedLocationIds(location_id, days || []),
        partnerIds: selectedPartnerIds(primaryPartnerId, partner_ids),
        days: days || [],
      });
      const newPackage = await tx.package.create({
        data: {
          name,
          description,
          price: parseFloat(price) || 0,
          location_id: parseInt(location_id) || null,
          partner_id: primaryPartnerId || null,
          insurance_plan_id: insurancePlanId ?? null,
          target_travelers: resolvedCosts.target_travelers,
          minimum_travelers: resolvedCosts.minimum_travelers,
          target_bookings: resolvedCosts.target_bookings,
          ...(costs && { costItems: { create: resolvedCosts.items } }),
          status: status || "Draft",
          start_date: calculatedStartDate,
          end_date: calculatedEndDate,
          booking_start_date: parseDate(booking_start_date),
          booking_end_date: parseDate(booking_end_date),
          image: coverImageUrl || "https://images.unsplash.com/photo-1589394815804-964ce0fa2556?auto=format&fit=crop&w=800&q=80",
          addons: {
            create: (addons || []).map((addon) => ({
              addon_name: addon.addon_name || "",
              price: parseFloat(addon.price) || 0,
              max_limit: parseInt(addon.max_limit) || 1,
              status: parseInt(addon.status) ?? 1,
            })),
          },
          dayplans: {
            create: (days || []).map((day) => ({
              day_num: parseInt(day.day_num) || 1,
              title: day.title,
              dt: day.dt,
              description: day.description,
              hotel: day.hotel,
              location_id: parseInt(day.id_location) || parseInt(day.location_id) || parseInt(location_id) || null,
              activities: {
                create: (day.activities || []).map((act) => ({
                  time: act.time,
                  activity: act.activity,
                  status: act.status,
                  landmark: act.landmark,
                })),
              },
            })),
          },
        },
        include: {
          dayplans: true,
          addons: true,
        },
      });

      // Save images in package_images table
      if (Array.isArray(images) && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const url = typeof img === "string" ? img : img.image_url;
          if (url && url.trim()) {
            await tx.packageImage.create({
              data: {
                package_id: newPackage.id,
                image_url: url.trim(),
                is_cover: typeof img === "object" ? !!img.is_cover : i === 0,
                sort_order: typeof img === "object" && img.sort_order !== undefined ? parseInt(img.sort_order) : i,
                caption: typeof img === "object" ? img.caption || null : null,
              },
            });
          }
        }
      } else if (coverImageUrl) {
        await tx.packageImage.create({
          data: {
            package_id: newPackage.id,
            image_url: coverImageUrl,
            is_cover: true,
            sort_order: 0,
          },
        });
      }

      // Handle partners join table
      const pidsToLink = Array.isArray(partner_ids) && partner_ids.length > 0
        ? partner_ids.map((p) => parseInt(p)).filter(Boolean)
        : (primaryPartnerId ? [primaryPartnerId] : []);

      const uniquePids = Array.from(new Set(pidsToLink));
      for (const pid of uniquePids) {
        await tx.packagePartner.create({
          data: {
            package_id: newPackage.id,
            partner_id: pid,
          },
        });
      }

      // Handle guides assignment
      if (Array.isArray(guides) && guides.length > 0) {
        const seenEmpIds = new Set();
        for (const g of guides) {
          const empId = typeof g === "object" ? parseInt(g.emp_id || g.id) : parseInt(g);
          if (!empId) continue;
          if (seenEmpIds.has(empId)) continue;
          seenEmpIds.add(empId);

          // 1. ตรวจสอบ Role: ต้องเป็น role 'ไกด์' เท่านั้น
          const emp = await tx.emp.findUnique({
            where: { id: empId },
            include: { Role: true },
          });

          if (!emp) {
            const err = new Error(`ไม่พบข้อมูลพนักงานรหัส ${empId}`);
            err.isCustom = true;
            throw err;
          }

          if (!emp.Role || emp.Role.name !== "ไกด์") {
            const roleName = emp.Role ? emp.Role.name : "ไม่ระบุ";
            const err = new Error(`พนักงาน "${emp.name}" (ตำแหน่ง: ${roleName}) ไม่ได้อยู่ในตำแหน่งไกด์ สามารถมอบหมายได้เฉพาะผู้ที่มีตำแหน่ง 'ไกด์' เท่านั้น`);
            err.isCustom = true;
            throw err;
          }

          // 2. ตรวจสอบตารางงานซ้อนกับ Package อื่นในวันเวลาเดียวกัน
          if (calculatedStartDate) {
            const existingAssignments = await tx.packageGuide.findMany({
              where: {
                emp_id: empId,
                package: {
                  status: { not: "Cancelled" },
                },
              },
              include: {
                package: {
                  include: {
                    dayplans: { orderBy: { day_num: "asc" } },
                  },
                },
              },
            });

            for (const assign of existingAssignments) {
              const otherPkg = assign.package;
              if (!otherPkg) continue;

              const otherStart = otherPkg.start_date || (otherPkg.dayplans?.[0]?.dt ? new Date(otherPkg.dayplans[0].dt) : null);
              const otherEnd = otherPkg.end_date || (otherPkg.dayplans?.[otherPkg.dayplans.length - 1]?.dt ? new Date(otherPkg.dayplans[otherPkg.dayplans.length - 1].dt) : otherStart);

              if (otherStart && datesOverlap(calculatedStartDate, calculatedEndDate, otherStart, otherEnd)) {
                const dateStr = formatDateRange(otherStart, otherEnd);
                const err = new Error(`ไกด์ "${emp.name}" ไม่สามารถรับงานได้ เนื่องจากมีงานซ้อนกับแพ็กเกจ "${otherPkg.name}" ในช่วงวันที่ ${dateStr}`);
                err.isCustom = true;
                throw err;
              }
            }
          }

          await tx.packageGuide.create({
            data: {
              package_id: newPackage.id,
              emp_id: empId,
              role: typeof g === "object" && g.role ? g.role : "LEAD_GUIDE",
              note: typeof g === "object" && g.note ? g.note.trim() : null,
            },
          });
        }
      }

      // Handle meals
      if (Array.isArray(days)) {
        for (const day of days) {
          if (day.meals && day.meals.length > 0) {
            const createdDay = newPackage.dayplans.find((d) => d.day_num === parseInt(day.day_num));
            if (createdDay) {
              for (const mealName of day.meals) {
                let mealType = await tx.meal.findUnique({ where: { type_name: mealName } });
                if (!mealType) {
                  mealType = await tx.meal.create({ data: { type_name: mealName } });
                }
                await tx.dayplanMeal.create({
                  data: {
                    id_dayplan: createdDay.id,
                    id_meal: mealType.id,
                  },
                });
              }
            }
          }
        }
      }

      await syncPackageBuses(tx, newPackage.id, busIds);
      return newPackage;
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error) {
    console.error("Create package error:", error);
    let friendlyMessage = error.message || "เกิดข้อผิดพลาดในการสร้างแพ็กเกจ กรุณาลองใหม่อีกครั้ง";
    if (error.code === "P2002" || error.message?.includes("Unique constraint")) {
      friendlyMessage = "ไม่สามารถบันทึกได้ เนื่องจากมีข้อมูลที่ซ้ำกันในระบบ (เช่น มัคคุเทศก์ที่มอบหมายซ้ำ)";
    }
    return res.status(error.isCustom ? 400 : 500).json({ success: false, message: friendlyMessage, error: friendlyMessage });
  }
});

// Update package
router.put("/:id", ...backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, price, location_id, status, image, images, days, partner_id, partner_ids, addons, guides, bus_ids, insurance_plan_id, booking_start_date, booking_end_date, start_date, end_date } = req.body;
    const busIds = parseBusIds(bus_ids);
    const costs = parsePackageCosts(req.body);
    const insurancePlanId = parseInsurancePlanId(insurance_plan_id);
    if (insurancePlanId === null) return res.status(400).json({ message: "กรุณาเลือกแผนประกันหนึ่งแผนสำหรับแพ็กเกจ" });

    const primaryPartnerId = partner_id ? parseInt(partner_id) : (Array.isArray(partner_ids) && partner_ids.length > 0 ? parseInt(partner_ids[0]) : null);

    const firstDayDt = Array.isArray(days) ? days.find((d) => d && d.dt)?.dt : null;
    const lastDayDt = Array.isArray(days) ? [...days].reverse().find((d) => d && d.dt)?.dt : null;

    const calculatedStartDate = parseDate(start_date) || (firstDayDt ? parseDate(firstDayDt) : null);
    const calculatedEndDate = parseDate(end_date) || (lastDayDt ? parseDate(lastDayDt) : null);
    await verifyInsurancePlan(insurancePlanId, calculatedStartDate, calculatedEndDate);

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.package.findUnique({ where: { id }, select: {
        minimum_travelers: true, target_bookings: true, location_id: true, partner_id: true,
        packageBuses: { select: { bus_id: true } },
        dayplans: { select: { location_id: true, hotel: true, activities: { select: { landmark: true, activity: true, status: true } } } },
        partners: { select: { partner_id: true } },
      } });
      if (!current) { const error = new Error("ไม่พบแพ็กเกจ"); error.isCustom = true; throw error; }
      const effectiveBusIds = busIds ?? current.packageBuses.map((item) => item.bus_id);
      const effectiveDays = days ?? current.dayplans;
      const effectiveLocationId = location_id === undefined ? current.location_id : location_id;
      const effectivePartnerIds = partner_ids === undefined ? current.partners.map((item) => item.partner_id) : partner_ids;
      const resolvedCosts = await resolvePackageCosts(tx, costs, {
        busIds: effectiveBusIds,
        locationIds: selectedLocationIds(effectiveLocationId, effectiveDays),
        partnerIds: selectedPartnerIds(partner_id === undefined ? current.partner_id : primaryPartnerId, effectivePartnerIds),
        days: effectiveDays,
      }, current.minimum_travelers, current.target_bookings);
      // Update basic info & partner
      const updatedPackage = await tx.package.update({
        where: { id },
        data: {
          name,
          description,
          price: parseFloat(price) || 0,
          location_id: parseInt(location_id) || null,
          partner_id: primaryPartnerId || null,
          ...(insurancePlanId !== undefined && { insurance_plan_id: insurancePlanId }),
          target_travelers: resolvedCosts.target_travelers,
          minimum_travelers: resolvedCosts.minimum_travelers,
          target_bookings: resolvedCosts.target_bookings,
          status: status || "Draft",
          start_date: calculatedStartDate,
          end_date: calculatedEndDate,
          booking_start_date: parseDate(booking_start_date),
          booking_end_date: parseDate(booking_end_date),
          image: image,
        },
      });

      if (resolvedCosts.items) {
        // shortcut: package cost edits replace the current planning snapshot; add an audit ledger when supplier payments need accounting reconciliation.
        await tx.packageCostItem.deleteMany({ where: { package_id: id } });
        if (resolvedCosts.items.length) await tx.packageCostItem.createMany({ data: resolvedCosts.items.map((item) => ({ ...item, package_id: id })) });
      }

      // Sync package images
      await tx.packageImage.deleteMany({ where: { package_id: id } });
      let finalCoverImage = image;

      if (Array.isArray(images) && images.length > 0) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const url = typeof img === "string" ? img : img.image_url;
          if (url && url.trim()) {
            const isCover = typeof img === "object" ? !!img.is_cover : i === 0;
            if (isCover) finalCoverImage = url.trim();
            await tx.packageImage.create({
              data: {
                package_id: id,
                image_url: url.trim(),
                is_cover: isCover,
                sort_order: typeof img === "object" && img.sort_order !== undefined ? parseInt(img.sort_order) : i,
                caption: typeof img === "object" ? img.caption || null : null,
              },
            });
          }
        }
      } else if (image && image.trim()) {
        await tx.packageImage.create({
          data: {
            package_id: id,
            image_url: image.trim(),
            is_cover: true,
            sort_order: 0,
          },
        });
      }

      if (finalCoverImage && finalCoverImage !== image) {
        await tx.package.update({
          where: { id },
          data: { image: finalCoverImage },
        });
      }

      // Sync partners
      await tx.packagePartner.deleteMany({ where: { package_id: id } });
      const pidsToLink = Array.isArray(partner_ids) && partner_ids.length > 0
        ? partner_ids.map((p) => parseInt(p)).filter(Boolean)
        : (primaryPartnerId ? [primaryPartnerId] : []);

      const uniquePids = Array.from(new Set(pidsToLink));
      for (const pid of uniquePids) {
        await tx.packagePartner.create({
          data: {
            package_id: id,
            partner_id: pid,
          },
        });
      }

      // Sync addons safely preserving foreign key constraints with booking_addons
      if (Array.isArray(addons)) {
        const existingAddons = await tx.addonPackage.findMany({
          where: { package_id: id },
          include: {
            _count: {
              select: { booking_addons: true },
            },
          },
        });

        const keptAddonIds = new Set();

        for (const addon of addons) {
          if (!addon.addon_name?.trim()) continue;

          const parsedId = addon.id ? parseInt(addon.id) : null;
          const matchingExisting = parsedId
            ? existingAddons.find((ea) => ea.id === parsedId)
            : null;

          if (matchingExisting) {
            keptAddonIds.add(matchingExisting.id);
            await tx.addonPackage.update({
              where: { id: matchingExisting.id },
              data: {
                addon_name: addon.addon_name.trim(),
                price: parseFloat(addon.price) || 0,
                max_limit: parseInt(addon.max_limit) || 1,
                status: addon.status !== undefined ? parseInt(addon.status) : 1,
              },
            });
          } else {
            const created = await tx.addonPackage.create({
              data: {
                package_id: id,
                addon_name: addon.addon_name.trim(),
                price: parseFloat(addon.price) || 0,
                max_limit: parseInt(addon.max_limit) || 1,
                status: addon.status !== undefined ? parseInt(addon.status) : 1,
              },
            });
            keptAddonIds.add(created.id);
          }
        }

        // Handle addons that were removed from the package by the admin
        for (const existing of existingAddons) {
          if (!keptAddonIds.has(existing.id)) {
            if (existing._count.booking_addons > 0) {
              // Cannot hard-delete because of existing booking foreign key constraint; deactivate instead
              await tx.addonPackage.update({
                where: { id: existing.id },
                data: { status: 0 },
              });
            } else {
              await tx.addonPackage.delete({
                where: { id: existing.id },
              });
            }
          }
        }
      }

      // Clean up existing dayplans and their child relations (meals & activities)
      const existingDays = await tx.dayplanTimeline.findMany({
        where: { package_id: id },
        select: { id: true },
      });
      const dayIds = existingDays.map((d) => d.id);
      if (dayIds.length > 0) {
        await tx.dayplanMeal.deleteMany({
          where: { id_dayplan: { in: dayIds } },
        });
        await tx.activityTimeline.deleteMany({
          where: { dayplan_id: { in: dayIds } },
        });
      }
      await tx.dayplanTimeline.deleteMany({ where: { package_id: id } });

      if (days && days.length > 0) {
        for (const day of days) {
          const newDay = await tx.dayplanTimeline.create({
            data: {
              package_id: id,
              day_num: parseInt(day.day_num) || 1,
              title: day.title,
              dt: day.dt,
              description: day.description,
              hotel: day.hotel,
              location_id: parseInt(day.id_location) || parseInt(day.location_id) || parseInt(location_id) || null,
              activities: {
                create: (day.activities || []).map((act) => ({
                  time: act.time,
                  activity: act.activity,
                  status: act.status,
                  landmark: act.landmark,
                })),
              },
            },
          });

          if (day.meals && day.meals.length > 0) {
            for (const mealName of day.meals) {
              let mealType = await tx.meal.findUnique({ where: { type_name: mealName } });
              if (!mealType) {
                mealType = await tx.meal.create({ data: { type_name: mealName } });
              }
              await tx.dayplanMeal.create({
                data: {
                  id_dayplan: newDay.id,
                  id_meal: mealType.id,
                },
              });
            }
          }
        }
      }

      // Sync package guides
      if (Array.isArray(guides)) {
        await tx.packageGuide.deleteMany({ where: { package_id: id } });
        const seenEmpIds = new Set();
        for (const g of guides) {
          const empId = typeof g === "object" ? parseInt(g.emp_id || g.id) : parseInt(g);
          if (!empId) continue;
          if (seenEmpIds.has(empId)) continue;
          seenEmpIds.add(empId);

          // 1. ตรวจสอบ Role: ต้องเป็น role 'ไกด์' เท่านั้น
          const emp = await tx.emp.findUnique({
            where: { id: empId },
            include: { Role: true },
          });

          if (!emp) {
            const err = new Error(`ไม่พบข้อมูลพนักงานรหัส ${empId}`);
            err.isCustom = true;
            throw err;
          }

          if (!emp.Role || emp.Role.name !== "ไกด์") {
            const roleName = emp.Role ? emp.Role.name : "ไม่ระบุ";
            const err = new Error(`พนักงาน "${emp.name}" (ตำแหน่ง: ${roleName}) ไม่ได้อยู่ในตำแหน่งไกด์ สามารถมอบหมายได้เฉพาะผู้ที่มีตำแหน่ง 'ไกด์' เท่านั้น`);
            err.isCustom = true;
            throw err;
          }

          // 2. ตรวจสอบตารางงานซ้อนกับ Package อื่นในวันเวลาเดียวกัน
          if (calculatedStartDate) {
            const existingAssignments = await tx.packageGuide.findMany({
              where: {
                emp_id: empId,
                package_id: { not: id }, // exclude current package being updated
                package: {
                  status: { not: "Cancelled" },
                },
              },
              include: {
                package: {
                  include: {
                    dayplans: { orderBy: { day_num: "asc" } },
                  },
                },
              },
            });

            for (const assign of existingAssignments) {
              const otherPkg = assign.package;
              if (!otherPkg) continue;

              const otherStart = otherPkg.start_date || (otherPkg.dayplans?.[0]?.dt ? new Date(otherPkg.dayplans[0].dt) : null);
              const otherEnd = otherPkg.end_date || (otherPkg.dayplans?.[otherPkg.dayplans.length - 1]?.dt ? new Date(otherPkg.dayplans[otherPkg.dayplans.length - 1].dt) : otherStart);

              if (otherStart && datesOverlap(calculatedStartDate, calculatedEndDate, otherStart, otherEnd)) {
                const dateStr = formatDateRange(otherStart, otherEnd);
                const err = new Error(`ไกด์ "${emp.name}" ไม่สามารถรับงานได้ เนื่องจากมีงานซ้อนกับแพ็กเกจ "${otherPkg.name}" ในช่วงวันที่ ${dateStr}`);
                err.isCustom = true;
                throw err;
              }
            }
          }

          await tx.packageGuide.create({
            data: {
              package_id: id,
              emp_id: empId,
              role: typeof g === "object" && g.role ? g.role : "LEAD_GUIDE",
              note: typeof g === "object" && g.note ? g.note.trim() : null,
            },
          });
        }
      }

      await syncPackageBuses(tx, id, busIds, current.packageBuses.map((item) => item.bus_id));
      return updatedPackage;
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Update package error:", error);
    let friendlyMessage = error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลแพ็กเกจ กรุณาลองใหม่อีกครั้ง";
    if (error.code === "P2002" || error.message?.includes("Unique constraint")) {
      friendlyMessage = "ไม่สามารถบันทึกได้ เนื่องจากมีข้อมูลที่ซ้ำกันในระบบ (เช่น มัคคุเทศก์ที่มอบหมายซ้ำ)";
    }
    return res.status(error.isCustom ? 400 : 500).json({ success: false, message: friendlyMessage, error: friendlyMessage });
  }
});

// Delete package
router.delete("/:id", ...backofficeOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.$transaction(async (tx) => {
      // 1. Delete package partners, addons, images, & guides
      await tx.packagePartner.deleteMany({ where: { package_id: id } });
      await tx.packageGuide.deleteMany({ where: { package_id: id } });
      await tx.addonPackage.deleteMany({ where: { package_id: id } });
      await tx.packageImage.deleteMany({ where: { package_id: id } });

      // 2. Delete dayplans and nested meals/activities
      const existingDays = await tx.dayplanTimeline.findMany({
        where: { package_id: id },
        select: { id: true },
      });
      const dayIds = existingDays.map((d) => d.id);
      if (dayIds.length > 0) {
        await tx.dayplanMeal.deleteMany({
          where: { id_dayplan: { in: dayIds } },
        });
        await tx.activityTimeline.deleteMany({
          where: { dayplan_id: { in: dayIds } },
        });
      }
      await tx.dayplanTimeline.deleteMany({ where: { package_id: id } });

      // 3. Delete the package
      await tx.package.delete({ where: { id } });
    });
    return res.status(200).json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
