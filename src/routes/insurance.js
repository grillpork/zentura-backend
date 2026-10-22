const express = require("express");
const { prisma } = require("../config/db.js");
const { authMiddleware } = require("../middlewares/authMiddleware.js");
const { backofficeOnly } = require("../middlewares/backofficeOnly.js");
const { thaiDate } = require("../services/insuranceRules.js");

const router = express.Router();
const claimCategories = new Set(["ACCIDENT", "MEDICAL", "BAGGAGE", "TRIP_DELAY", "TRIP_CANCEL", "LIABILITY", "OTHER"]);
const claimStatuses = new Set(["REPORTED", "SUBMITTED", "NEED_DOCUMENTS", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID", "CLOSED"]);
const enrollmentStatuses = new Set(["AWAITING_PAYMENT", "PENDING_ISSUANCE", "ACTIVE", "ISSUANCE_FAILED", "CANCELLATION_REQUESTED", "CANCELLED"]);

const fail = (res, code, message) => res.status(code).json({ success: false, message });

router.get("/plan", async (_req, res, next) => {
  try {
    const packageId = Number(_req.query.package_id);
    if (!Number.isSafeInteger(packageId) || packageId <= 0) return fail(res, 400, "รหัสแพ็กเกจไม่ถูกต้อง");
    const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { insurance_plan_id: true } });
    if (!pkg) return fail(res, 404, "ไม่พบแพ็กเกจ");
    const plan = pkg.insurance_plan_id ? await prisma.insurancePlan.findUnique({ where: { id: pkg.insurance_plan_id } }) : null;
    // Show the package's selected plan even while it is a draft or DEMO.
    // Booking creation still checks active && !is_demo before charging for it.
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.get("/my/:code", authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.isEmployee || req.user?.portal === "supplier") return fail(res, 403, "ไม่มีสิทธิ์เข้าถึง");
    const booking = await prisma.booking.findUnique({
      where: { booking_code: String(req.params.code || "") },
      include: { travelers: { select: {
        id: true, full_name: true,
        insuranceEnrollment: { select: {
          status: true, insurer_name: true, plan_name: true, terms_url: true,
          certificate_no: true, coverage_start: true, coverage_end: true
        } }
      } } }
    });
    if (!booking || booking.user_id !== req.user.id) return fail(res, 404, "ไม่พบข้อมูลประกันของการจองนี้");
    res.set("Cache-Control", "no-store");
    res.json({ success: true, data: booking.travelers });
  } catch (error) { next(error); }
});

router.use(...backofficeOnly);
router.get("/plans", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await prisma.insurancePlan.findMany({ orderBy: { id: "asc" } }) });
  } catch (error) { next(error); }
});
router.use((req, res, next) => req.employee.Role?.name?.toLowerCase() === "admin"
  ? next() : fail(res, 403, "หน้านี้สำหรับผู้ดูแลระบบเท่านั้น"));

router.get("/admin/plan", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await prisma.insurancePlan.findUnique({ where: { id: 1 } }) });
  } catch (error) { next(error); }
});

router.get("/admin/plans", async (_req, res, next) => {
  try {
    res.json({ success: true, data: await prisma.insurancePlan.findMany({ orderBy: { id: "asc" } }) });
  } catch (error) { next(error); }
});

const planData = (body) => {
  const insurer_name = String(body.insurer_name || "").trim();
  const plan_name = String(body.plan_name || "").trim();
  const terms_url = String(body.terms_url || "").trim();
  const master_policy_no = String(body.master_policy_no || "").trim() || null;
  const premium_satang = Number(body.premium_satang);
  const min_age = Number(body.min_age);
  const max_age = Number(body.max_age);
  const min_trip_days = body.min_trip_days === "" || body.min_trip_days == null ? null : Number(body.min_trip_days);
  const max_trip_days = body.max_trip_days === "" || body.max_trip_days == null ? null : Number(body.max_trip_days);
  if (!insurer_name || !plan_name || !/^https:\/\//i.test(terms_url) ||
      !Number.isSafeInteger(premium_satang) || premium_satang <= 0 ||
      !Number.isSafeInteger(min_age) || !Number.isSafeInteger(max_age) ||
      min_age < 0 || max_age < min_age || max_age > 120 ||
      (min_trip_days === null) !== (max_trip_days === null) ||
      (min_trip_days !== null && (!Number.isSafeInteger(min_trip_days) || !Number.isSafeInteger(max_trip_days) ||
        min_trip_days < 1 || max_trip_days < min_trip_days)) ||
      (body.active === true && min_trip_days === null)) return null;
  return { insurer_name, plan_name, terms_url, master_policy_no, premium_satang, min_age, max_age,
    min_trip_days, max_trip_days, active: body.active === true };
};

router.post("/admin/plans", async (req, res, next) => {
  try {
    const data = planData(req.body);
    if (!data) return fail(res, 400, "กรอกบริษัท แผน ลิงก์เงื่อนไข HTTPS เบี้ย และช่วงอายุที่รับประกันให้ถูกต้อง");
    const plan = await prisma.insurancePlan.create({ data });
    res.status(201).json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.put("/admin/plans/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return fail(res, 400, "รหัสแผนประกันไม่ถูกต้อง");
    const data = planData(req.body);
    if (!data) return fail(res, 400, "กรอกบริษัท แผน ลิงก์เงื่อนไข HTTPS เบี้ย และช่วงอายุที่รับประกันให้ถูกต้อง");
    const current = await prisma.insurancePlan.findUnique({ where: { id } });
    if (!current) return fail(res, 404, "ไม่พบแผนประกัน");
    if (current.is_demo && data.active) return fail(res, 400, "แผนตัวอย่างเปิดขายไม่ได้ กรุณาสร้างแผนจากบริษัทประกันจริง");
    const plan = await prisma.insurancePlan.update({ where: { id }, data });
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.put("/admin/plan", async (req, res, next) => {
  try {
    const data = planData(req.body);
    if (!data) {
      return fail(res, 400, "กรอกบริษัท แผน ลิงก์เงื่อนไข HTTPS เบี้ย และช่วงอายุที่รับประกันให้ถูกต้อง");
    }
    const current = await prisma.insurancePlan.findUnique({ where: { id: 1 } });
    if (current?.is_demo && data.active) return fail(res, 400, "แผนตัวอย่างเปิดขายไม่ได้ กรุณาสร้างแผนจากบริษัทประกันจริง");
    const plan = await prisma.insurancePlan.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    res.json({ success: true, data: plan });
  } catch (error) { next(error); }
});

router.get("/travelers", async (req, res, next) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "ALL");
    const where = {};
    if (search) where.OR = [
      { full_name: { contains: search, mode: "insensitive" } },
      { booking: { booking_code: { contains: search, mode: "insensitive" } } },
      { booking: { package: { name: { contains: search, mode: "insensitive" } } } },
    ];
    if (status === "LEGACY" || status === "DECLINED") {
      where.insuranceEnrollment = { is: null };
      where.booking = { insurance_opted_in: status === "DECLINED" ? false : null };
    } else if (status !== "ALL" && enrollmentStatuses.has(status)) where.insuranceEnrollment = { is: { status } };
    const [total, travelers] = await Promise.all([
      prisma.bookingTraveler.count({ where }),
      prisma.bookingTraveler.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { id: "desc" },
        include: {
          booking: { select: {
            id: true, booking_code: true, status: true, travel_date: true, insurance_opted_in: true,
            contact_name: true, contact_phone: true,
            package: { select: { name: true } },
            payments: { where: { status: "APPROVED" }, select: { id: true }, take: 1 }
          } },
          insuranceEnrollment: { include: {
            events: { where: { claim_id: null }, orderBy: { createdAt: "desc" }, take: 5 },
            claims: { orderBy: { createdAt: "desc" }, take: 3, include: { events: { orderBy: { createdAt: "desc" }, take: 5 } } }
          } }
        }
      })
    ]);
    res.json({ success: true, data: travelers, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

const csvCell = (value) => {
  const raw = String(value ?? "");
  // Spreadsheet formula injection is possible even in a downloaded CSV.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

router.get("/pending-export.csv", async (_req, res, next) => {
  try {
    const records = await prisma.insuranceEnrollment.findMany({
      where: { status: "PENDING_ISSUANCE", booking: { payments: { some: { status: "APPROVED" } } } },
      include: {
        traveler: true,
        booking: { include: { package: { select: { name: true } } } }
      },
      orderBy: { id: "asc" }
    });
    const rows = [["enrollment_id", "booking_code", "package", "full_name", "passenger_type", "date_of_birth", "id_card_or_passport", "coverage_start", "coverage_end", "insurer", "plan", "master_policy_no"]];
    for (const item of records) rows.push([
      item.id, item.booking.booking_code, item.booking.package.name, item.traveler.full_name,
      item.traveler.passenger_type, item.traveler.date_of_birth?.toISOString().slice(0, 10) || "",
      item.traveler.id_card_or_passport || "", item.coverage_start.toISOString().slice(0, 10),
      item.coverage_end.toISOString().slice(0, 10), item.insurer_name, item.plan_name, item.master_policy_no || ""
    ]);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=insurance-pending.csv");
    res.set("Cache-Control", "no-store");
    res.send(`\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`);
  } catch (error) { next(error); }
});

router.patch("/enrollments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "");
    if (!Number.isSafeInteger(id) || !enrollmentStatuses.has(status)) return fail(res, 400, "สถานะไม่ถูกต้อง");
    const enrollment = await prisma.insuranceEnrollment.findUnique({
      where: { id }, include: { booking: { include: { payments: { where: { status: "APPROVED" }, select: { id: true }, take: 1 } } } }
    });
    if (!enrollment) return fail(res, 404, "ไม่พบข้อมูลประกัน");
    const allowed = {
      PENDING_ISSUANCE: ["ACTIVE", "ISSUANCE_FAILED", "CANCELLED"],
      ISSUANCE_FAILED: ["PENDING_ISSUANCE", "ACTIVE", "CANCELLED"],
      ACTIVE: ["CANCELLATION_REQUESTED"],
      CANCELLATION_REQUESTED: ["ACTIVE", "CANCELLED"],
      CANCELLED: []
    };
    if (!allowed[enrollment.status]?.includes(status)) return fail(res, 409, "เปลี่ยนสถานะนี้ไม่ได้");
    if (status === "ACTIVE" && (enrollment.booking.payments.length === 0 || enrollment.booking.status === "CANCELLED")) {
      return fail(res, 409, "ต้องชำระเงินและไม่ยกเลิกการจองก่อนบันทึกกรมธรรม์");
    }
    const certificate_no = String(req.body.certificate_no || "").trim();
    const failure_reason = String(req.body.failure_reason || "").trim();
    if (status === "ACTIVE" && !certificate_no) return fail(res, 400, "ต้องระบุเลขรับรอง/เลขกรมธรรม์จากบริษัทประกัน");
    if (status === "ISSUANCE_FAILED" && !failure_reason) return fail(res, 400, "ต้องระบุสาเหตุที่ออกกรมธรรม์ไม่สำเร็จ");
    const data = {
        status,
        ...(status === "ACTIVE" ? { certificate_no, issued_at: new Date(), failure_reason: null } : {}),
        ...(status === "ISSUANCE_FAILED" ? { failure_reason } : {})
    };
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.insuranceEnrollment.updateMany({ where: { id, status: enrollment.status }, data });
      if (result.count !== 1) return null;
      await tx.insuranceEvent.create({ data: {
        enrollment_id: id, action: `ENROLLMENT_${status}`,
        detail: status === "ACTIVE" ? certificate_no : status === "ISSUANCE_FAILED" ? failure_reason : null,
        actor_emp_id: req.employee.id
      } });
      return tx.insuranceEnrollment.findUnique({ where: { id } });
    });
    if (!updated) return fail(res, 409, "สถานะประกันเปลี่ยนไปแล้ว กรุณารีเฟรช");
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
});

router.post("/claims", async (req, res, next) => {
  try {
    const enrollment_id = Number(req.body.enrollment_id);
    const category = String(req.body.category || "");
    const description = String(req.body.description || "").trim();
    const occurred_at = new Date(req.body.occurred_at);
    const amount = req.body.claimed_amount_satang == null || req.body.claimed_amount_satang === ""
      ? null : Number(req.body.claimed_amount_satang);
    if (!Number.isSafeInteger(enrollment_id) || !claimCategories.has(category) || description.length < 10 ||
        Number.isNaN(occurred_at.getTime()) || occurred_at > new Date() ||
        (amount !== null && (!Number.isSafeInteger(amount) || amount < 0))) {
      return fail(res, 400, "กรอกประเภทเหตุ วันที่เกิดเหตุ รายละเอียดอย่างน้อย 10 ตัวอักษร และจำนวนเงินให้ถูกต้อง");
    }
    const enrollment = await prisma.insuranceEnrollment.findUnique({ where: { id: enrollment_id } });
    if (!enrollment || enrollment.status !== "ACTIVE") return fail(res, 409, "ผู้เดินทางยังไม่มีกรมธรรม์ที่ยืนยันแล้ว");
    const incidentDay = thaiDate(occurred_at);
    if (incidentDay < thaiDate(enrollment.coverage_start) || incidentDay > thaiDate(enrollment.coverage_end)) {
      return fail(res, 400, "วันเกิดเหตุอยู่นอกระยะเวลาคุ้มครอง");
    }
    const claim = await prisma.$transaction(async (tx) => {
      const created = await tx.insuranceClaim.create({ data: {
        enrollment_id, category, occurred_at, description, claimed_amount_satang: amount,
        reported_by_emp_id: req.employee.id
      } });
      await tx.insuranceEvent.create({ data: {
        enrollment_id, claim_id: created.id, action: "CLAIM_REPORTED", detail: description,
        actor_emp_id: req.employee.id
      } });
      return created;
    });
    res.status(201).json({ success: true, data: claim });
  } catch (error) { next(error); }
});

router.patch("/claims/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body.status || "");
    const insurer_claim_no = String(req.body.insurer_claim_no || "").trim();
    const insurer_note = String(req.body.insurer_note || "").trim();
    if (!Number.isSafeInteger(id) || !claimStatuses.has(status)) return fail(res, 400, "สถานะเคลมไม่ถูกต้อง");
    const claim = await prisma.insuranceClaim.findUnique({ where: { id } });
    if (!claim) return fail(res, 404, "ไม่พบเคลม");
    const transitions = {
      REPORTED: ["SUBMITTED", "CLOSED"],
      SUBMITTED: ["NEED_DOCUMENTS", "UNDER_REVIEW", "APPROVED", "REJECTED", "CLOSED"],
      NEED_DOCUMENTS: ["SUBMITTED", "UNDER_REVIEW", "CLOSED"],
      UNDER_REVIEW: ["NEED_DOCUMENTS", "APPROVED", "REJECTED", "CLOSED"],
      APPROVED: ["PAID", "CLOSED"], REJECTED: ["UNDER_REVIEW", "CLOSED"],
      PAID: ["CLOSED"], CLOSED: []
    };
    if (!transitions[claim.status]?.includes(status)) return fail(res, 409, "เปลี่ยนสถานะเคลมนี้ไม่ได้");
    if (["APPROVED", "REJECTED", "PAID"].includes(status) && !(insurer_claim_no || claim.insurer_claim_no)) {
      return fail(res, 400, "ต้องระบุเลขเคลมจากบริษัทประกันก่อนบันทึกผล");
    }
    if (["APPROVED", "REJECTED", "PAID"].includes(status) && !insurer_note && !claim.insurer_note) {
      return fail(res, 400, "ต้องบันทึกผลที่บริษัทประกันแจ้ง");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.insuranceClaim.updateMany({ where: { id, status: claim.status }, data: {
        status, insurer_claim_no: insurer_claim_no || claim.insurer_claim_no,
        insurer_note: insurer_note || claim.insurer_note
      } });
      if (result.count !== 1) return null;
      await tx.insuranceEvent.create({ data: {
        enrollment_id: claim.enrollment_id, claim_id: id, action: `CLAIM_${status}`,
        detail: insurer_note || insurer_claim_no || null, actor_emp_id: req.employee.id
      } });
      return tx.insuranceClaim.findUnique({ where: { id } });
    });
    if (!updated) return fail(res, 409, "สถานะเคลมเปลี่ยนไปแล้ว กรุณารีเฟรช");
    res.json({ success: true, data: updated });
  } catch (error) { next(error); }
});

module.exports = router;
