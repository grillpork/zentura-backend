const { prisma } = require("../config/db.js");
const express = require("express");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("../middlewares/authMiddleware.js");
const Stripe = require("stripe");
const stripe = new
    Stripe(process.env.STRIPE_SECRET_KEY);

const BookingRouter = express.Router();


// ฟังก์ชันสร้างรหัสการจอง เช่น ZT-2410-A1B2
const generateBookingCode = () => {
    const dateStr = new Date().toISOString().slice(2, 7).replace("-", ""); // เช่น 2410
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ZT-${dateStr}-${randomStr}`;
};

// -------------------------------------------------------------
// ระบบคำนวณและสะสมแต้มสมาชิก (Loyalty Points System)
// มาตรฐานธุรกิจท่องเที่ยว: ยอดชำระทุก 100 บาท รับ 1 แต้มสะสม
// -------------------------------------------------------------
async function awardBookingPoints(tx, bookingId) {
    try {
        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { pointTransactions: true }
        });
        if (!booking || !booking.user_id) return 0;

        // ป้องกันการให้แต้มซ้ำซ้อน (Idempotency)
        const alreadyAwarded = booking.pointTransactions?.some(pt => pt.type === "EARN_BOOKING");
        if (alreadyAwarded || booking.points_earned > 0) return booking.points_earned;

        // คำนวณแต้ม: 100 THB = 1 Point
        const pointsToAward = Math.floor((booking.total_price || 0) / 100);
        if (pointsToAward <= 0) return 0;

        // 1. บันทึกประวัติการรับแต้ม
        await tx.pointTransaction.create({
            data: {
                user_id: booking.user_id,
                booking_id: booking.id,
                points: pointsToAward,
                type: "EARN_BOOKING",
                description: `ได้รับแต้มสะสมจากการจองแพ็กเกจท่องเที่ยว รหัส ${booking.booking_code} (ยอดชำระ ฿${Math.round(booking.total_price).toLocaleString()})`
            }
        });

        // 2. เพิ่มแต้มในบัญชีผู้ใช้
        await tx.user.update({
            where: { id: booking.user_id },
            data: { points: { increment: pointsToAward } }
        });

        // 3. บันทึกแต้มที่ได้รับลงใน Booking
        await tx.booking.update({
            where: { id: booking.id },
            data: { points_earned: pointsToAward }
        });

        return pointsToAward;
    } catch (err) {
        console.error("AWARD POINTS ERROR:", err);
        return 0;
    }
}

async function deductBookingPointsOnCancel(tx, bookingId) {
    try {
        const booking = await tx.booking.findUnique({
            where: { id: bookingId },
            include: { pointTransactions: true }
        });
        if (!booking || !booking.user_id) return 0;

        const earnTx = booking.pointTransactions?.find(pt => pt.type === "EARN_BOOKING");
        const alreadyDeducted = booking.pointTransactions?.some(pt => pt.type === "CANCEL_REFUND");

        if (earnTx && !alreadyDeducted) {
            const pointsToDeduct = earnTx.points;

            await tx.pointTransaction.create({
                data: {
                    user_id: booking.user_id,
                    booking_id: booking.id,
                    points: -pointsToDeduct,
                    type: "CANCEL_REFUND",
                    description: `หักแต้มสะสมคืนเนื่องจากการยกเลิกการจอง รหัส ${booking.booking_code}`
                }
            });

            const user = await tx.user.findUnique({ where: { id: booking.user_id } });
            const currentPoints = user?.points || 0;
            const newPoints = Math.max(0, currentPoints - pointsToDeduct);

            await tx.user.update({
                where: { id: booking.user_id },
                data: { points: newPoints }
            });

            await tx.booking.update({
                where: { id: booking.id },
                data: { points_earned: 0 }
            });

            return pointsToDeduct;
        }
        return 0;
    } catch (err) {
        console.error("DEDUCT POINTS ERROR:", err);
        return 0;
    }
}

BookingRouter.post("/", async (req, res) => {
    try {
        const {
            package_id,
            travel_date,
            adult_count,
            child_count = 0,
            contact_name,
            contact_phone,
            contact_email,
            contact_line_id,
            special_requests,
            travelers = [], // [{full_name, title, id_card_or_passport, phone}]
            selected_addons = [], // [{addon_id, quantity}]
        } = req.body;

        // validate 
        if (!package_id || !contact_name || !contact_email || !contact_phone) {
            return res.status(400).json({ message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
        }

        // คำนวณราคาส่วนแรกจาก pkg
        const pkg = await prisma.package.findUnique({
            where: { id: parseInt(package_id) },
            include: {
                addons: true,
                dayplans: { orderBy: { day_num: "asc" } }
            }
        });
        if (!pkg) {
            return res.status(404).json({ message: "ไม่พบแพ็คเกจ" });
        }
        if (pkg.status !== "Published") {
            return res.status(400).json({ message: "แพ็กเกจนี้ยังไม่เปิดรับการจอง" });
        }

        // กำหนดวันเดินทางจากข้อมูลแพ็กเกจ (start_date) หรือ fallback จาก dayplans
        const finalTravelDate = travel_date
            ? new Date(travel_date)
            : (pkg.start_date
                ? new Date(pkg.start_date)
                : (pkg.dayplans?.[0]?.dt ? new Date(pkg.dayplans[0].dt) : new Date()));

        // ตรวจสอบช่วงเวลาเปิดรับจอง (ถ้ามีการระบุไว้)
        const now = new Date();
        if (pkg.booking_start_date && new Date(pkg.booking_start_date) > now) {
            return res.status(400).json({ message: "แพ็กเกจนี้ยังไม่ถึงช่วงเวลาเปิดรับจอง" });
        }
        if (pkg.booking_end_date && new Date(new Date(pkg.booking_end_date).setHours(23, 59, 59, 999)) < now) {
            return res.status(400).json({ message: "แพ็กเกจนี้หมดเขตรับจองแล้ว" });
        }

        //ตัวแปรกำหนดจำนวนตามประเภทผู้ใหญ่ เด็ก
        const adults = parseInt(adult_count) || 1;
        const children = parseInt(child_count) || 0;

        //คำนวณราคาที่เซิร์ฟเวอร์ (Zero-Trust Pricing)
        const packagePrice = pkg.price || 0;
        const baseTotal = packagePrice * adults;

        // คำนวณราคา Addon จากฐานข้อมูล
        let addonTotal = 0;
        const addonInsertData = [];
        //select addon ห้ามติดลบ
        if (Array.isArray(selected_addons) && selected_addons.length > 0) {
            for (const item of selected_addons) {
                const addonId = typeof item === "object"
                    ? parseInt(item.addon_id)
                    : parseInt(item);
                const foundAddon = pkg.addons.find(a => a.id === addonId);

                if (foundAddon && foundAddon.status === 1) {
                    const qty = item.quantity || 1;
                    const cost = foundAddon.price;

                    addonTotal += cost;
                    addonInsertData.push({
                        addon_id: foundAddon.id,
                        addon_name: foundAddon.addon_name,
                        price: foundAddon.price,
                        quantity: qty,
                    });
                }
            }
        }
        //รวมราคาสุทธิ
        const grandTotal = baseTotal + addonTotal;
        const bookingCode = generateBookingCode();

        // ตรวจสอบ user_id จาก token หรือ body
        let userId = null;
        const authHeader = req.headers["authorization"];
        if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
                const token = authHeader.split(" ")[1];
                const decoded = jwt.verify(token, process.env.JWT_SECRET || "fallback_secret_key_123");
                userId = decoded.id;
            } catch (e) {
                // Ignore if invalid token
            }
        }
        if (!userId && req.body.user_id) {
            userId = parseInt(req.body.user_id);
        }

        const collabIds = Array.isArray(req.body.collab_ids)
            ? req.body.collab_ids.map(id => parseInt(id)).filter(Boolean)
            : Array.isArray(req.body.collaborators)
                ? req.body.collaborators.map(c => parseInt(c.id || c)).filter(Boolean)
                : [];

        // กรอง ID ผู้ร่วมทริป ไม่ให้ซ้ำ และไม่รวม user_id ของผู้จองหลัก
        const uniqueCollabIds = [...new Set(collabIds)].filter(cid => cid && cid !== userId);

        // บันทึกลง db
        const newBooking = await prisma.booking.create({
            data: {
                user_id: userId,
                booking_code: bookingCode,
                package_id: pkg.id,
                travel_date: finalTravelDate,
                adult_count: adults,
                child_count: children,
                contact_name: contact_name.trim(),
                contact_phone: contact_phone.trim(),
                contact_email: contact_email.trim(),
                contact_line_id: contact_line_id ? contact_line_id.trim() : null,
                special_request: special_requests ? special_requests.trim() : null,
                package_price: packagePrice,
                addon_total: addonTotal,
                total_price: grandTotal,
                status: "PENDING_PAYMENT",
                // บันทึกรายชื่อผู้เดินทาง (ถ้ามีส่งมา)
                travelers: {
                    create: travelers.map((t) => ({
                        title: t.title || null,
                        full_name: t.full_name?.trim() || contact_name.trim(),
                        id_card_or_passport: t.id_card_or_passport?.trim() || null,
                        phone: t.phone?.trim() || null,
                    })),
                },
                // บันทึกรายการ Addon
                booking_addons: {
                    create: addonInsertData,
                },
                // บันทึกผู้ร่วมทริป Collab (ถ้ามี)
                ...(uniqueCollabIds.length > 0 ? {
                    bookingCollaps: {
                        create: uniqueCollabIds.map(cid => ({
                            package_id: pkg.id,
                            user_id: cid,
                            role: "COLLABORATOR",
                            status: "ACCEPTED",
                        })),
                    },
                } : {}),
            },
            include: {
                travelers: true,
                booking_addons: true,
                bookingCollaps: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
                package: {
                    select: { id: true, name: true, image: true },
                },
            },
        });
        return res.status(201).json({
            success: true,
            message: "สร้างการจองสำเร็จ",
            data: newBooking,
        });
    } catch (error) {
        console.error("CREATE BOOKING ERROR:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

// -------------------------------------------------------------
// GET /my-bookings -> ดึงประวัติการจองทั้งหมดของ User ที่ล็อกอินอยู่ (รวมทั้งที่เป็นคนจองและเป็นผู้ร่วมทริป Collab)
// -------------------------------------------------------------
BookingRouter.get("/my-bookings", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id; // ดึง id จาก Token

        const bookings = await prisma.booking.findMany({
            where: {
                OR: [
                    { user_id: userId }, // ดึงรายการที่เป็นผู้จองหลัก
                    {
                        bookingCollaps: {
                            some: {
                                user_id: userId // หรือเป็นผู้ร่วมทริป Collab
                            }
                        }
                    }
                ]
            },
            orderBy: {
                createdAt: "desc" // รายการล่าสุดขึ้นก่อน
            },
            include: {
                package: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        image: true,
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    }
                },
                bookingCollaps: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                            }
                        }
                    }
                },
                travelers: true,
                booking_addons: true,
                payments: {
                    orderBy: { createdAt: "desc" }
                }
            }
        });

        return res.status(200).json({
            success: true,
            total: bookings.length,
            data: bookings
        });

    } catch (error) {
        console.error("GET MY BOOKINGS ERROR:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดในการดึงประวัติการจอง",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// GET / -> ดึงรายการจองทั้งหมดแบบแบ่งหน้า (Pagination)
// -------------------------------------------------------------
BookingRouter.get("/", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 10);
        const skip = (page - 1) * limit;
        const { status, search } = req.query;

        const whereCondition = {};
        if (status && status !== "ALL") {
            whereCondition.status = status;
        }
        if (search && search.trim()) {
            whereCondition.OR = [
                { booking_code: { contains: search.trim(), mode: "insensitive" } },
                { contact_name: { contains: search.trim(), mode: "insensitive" } },
                { contact_phone: { contains: search.trim(), mode: "insensitive" } },
                { contact_email: { contains: search.trim(), mode: "insensitive" } },
            ];
        }

        const [total, bookings] = await Promise.all([
            prisma.booking.count({ where: whereCondition }),
            prisma.booking.findMany({
                where: whereCondition,
                skip: skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    package: {
                        select: { id: true, name: true, price: true, image: true }
                    },
                    travelers: true,
                    booking_addons: true,
                    payments: {
                        orderBy: { createdAt: "desc" }
                    }
                }
            })
        ]);

        const totalPages = Math.ceil(total / limit);
        return res.status(200).json({
            success: true,
            data: bookings,
            pagination: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
    } catch (error) {
        console.error("GET ALL BOOKINGS ERROR:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// GET /:id -> ดึงข้อมูลการจองตาม ID ตัวเลข
// -------------------------------------------------------------
BookingRouter.get('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return next();
        }
        const booking = await prisma.booking.findUnique({
            where: { id },
            include: {
                package: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        image: true,
                        description: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    }
                },
                bookingCollaps: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                            }
                        }
                    }
                },
                travelers: true,
                booking_addons: true,
                payments: {
                    orderBy: { createdAt: "desc" }
                }
            }
        });
        if (!booking) {
            return res.status(404).json({ message: "ไม่พบข้อมูลการจองตาม ID นี้" });
        }
        return res.status(200).json({ data: booking });
    }
    catch (error) {
        console.error("GET BOOKING BY ID ERROR:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

// -------------------------------------------------------------
// GET /:code -> ดึงข้อมูลการจองตาม booking_code
// -------------------------------------------------------------
BookingRouter.get("/:code", async (req, res) => {
    try {
        const { code } = req.params;
        if (!code || !code.trim()) {
            return res.status(400).json({ message: "กรุณาระบุรหัสการจอง" });
        }
        const booking = await prisma.booking.findUnique({
            where: {
                booking_code: code.trim()
            },
            include: {
                package: {
                    select: {
                        id: true,
                        name: true,
                        price: true,
                        image: true,
                        description: true,
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    }
                },
                bookingCollaps: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                            }
                        }
                    }
                },
                travelers: true,
                booking_addons: true,
                payments: {
                    orderBy: { createdAt: "desc" }
                }
            }
        });
        if (!booking) {
            return res.status(404).json({ message: "ไม่พบข้อมูลการจองตามรหัสนี้" });
        }
        return res.status(200).json({
            success: true,
            data: booking
        });
    } catch (error) {
        console.error("GET BOOKING ERROR:", error);
        return res.status(500).json({
            message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// PATCH /:id/status -> แอดมินปรับสถานะการจอง (CONFIRMED, CANCELLED ฯลฯ)
// -------------------------------------------------------------
BookingRouter.patch("/:id/status", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { status } = req.body;

        if (isNaN(id)) {
            return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" });
        }
        if (!status) {
            return res.status(400).json({ message: "กรุณาระบุสถานะที่ต้องการเปลี่ยน" });
        }

        const updatedBooking = await prisma.$transaction(async (tx) => {
            const b = await tx.booking.update({
                where: { id },
                data: { status }
            });

            if (status === "CONFIRMED") {
                await awardBookingPoints(tx, id);
            } else if (status === "CANCELLED") {
                await deductBookingPointsOnCancel(tx, id);
            }

            return b;
        });

        return res.status(200).json({
            success: true,
            message: "อัปเดตสถานะการจองสำเร็จ",
            data: updatedBooking
        });
    } catch (error) {
        console.error("UPDATE BOOKING STATUS ERROR:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการอัปเดตสถานะ", error: error.message });
    }
});

// -------------------------------------------------------------
// POST /:code/mock-pay -> จำลองการชำระเงิน (Mock QR Payment)
// -------------------------------------------------------------
BookingRouter.post("/:code/mock-pay", async (req, res) => {
    try {
        const { code } = req.params;
        if (!code || !code.trim()) {
            return res.status(400).json({ success: false, message: "กรุณาระบุรหัสการจอง" });
        }

        const trimmedCode = code.trim();

        // ค้นหาข้อมูลการจอง
        const booking = await prisma.booking.findUnique({
            where: { booking_code: trimmedCode },
            include: { payments: true }
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลการจองตามรหัสนี้" });
        }

        // หากยืนยันแล้ว ไม่ต้องทำซ้ำ
        if (booking.status === "CONFIRMED") {
            return res.status(200).json({
                success: true,
                message: "การจองนี้ได้รับการชำระเงินและยืนยันแล้ว",
                data: booking
            });
        }

        // ใช้ Transaction เพื่อปรับสถานะการจอง สร้างรายการชำระเงิน และมอบแต้มสะสม
        const result = await prisma.$transaction(async (tx) => {
            const updatedBooking = await tx.booking.update({
                where: { id: booking.id },
                data: {
                    status: "CONFIRMED"
                }
            });

            const payment = await tx.payment.create({
                data: {
                    booking_id: booking.id,
                    amount: booking.total_price,
                    payment_method: "PROMPTPAY_MOCK",
                    status: "APPROVED",
                    paid_at: new Date()
                }
            });

            // คำนวณและมอบแต้มสะสม
            await awardBookingPoints(tx, booking.id);

            return {
                ...updatedBooking,
                payment
            };
        });

        return res.status(200).json({
            success: true,
            message: "ชำระเงินจำลองสำเร็จเรียบร้อย",
            data: result
        });
    } catch (error) {
        console.error("MOCK PAY ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "เกิดข้อผิดพลาดในการทำรายการชำระเงินจำลอง",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// POST /api/booking/:code/cancel -> ผู้ใช้ขอยกเลิกการจอง
// -------------------------------------------------------------
BookingRouter.post("/:code/cancel", async (req, res) => {
    try {
        const { code } = req.params;
        const { reason } = req.body || {};

        const booking = await prisma.booking.findUnique({
            where: { booking_code: code.trim() },
            include: { package: true, travelers: true, booking_addons: true }
        });

        if (!booking) {
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลการจองนี้" });
        }

        if (booking.status === "CANCELLED") {
            return res.status(400).json({ success: false, message: "รายการจองนี้ถูกยกเลิกไปแล้ว" });
        }

        // อัปเดตสถานะเป็น CANCELLED และหักแต้มสะสมคืน (ถ้าเคยได้รับ)
        const updatedBooking = await prisma.$transaction(async (tx) => {
            const b = await tx.booking.update({
                where: { id: booking.id },
                data: { status: "CANCELLED" },
                include: { package: true, travelers: true, booking_addons: true }
            });
            await deductBookingPointsOnCancel(tx, booking.id);
            return b;
        });

        return res.status(200).json({
            success: true,
            message: "ยกเลิกการจองเรียบร้อยแล้ว",
            data: updatedBooking
        });
    } catch (error) {
        console.error("CANCEL BOOKING ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "เกิดข้อผิดพลาดในการยกเลิกการจอง",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// POST /api/booking/:code/create-stripe-session
// -------------------------------------------------------------
BookingRouter.post("/:code/create-stripe-session", async (req, res) => {
    try {
        const { code } = req.params;
        const { origin } = req.body || {};
        const booking = await prisma.booking.findUnique({
            where: { booking_code: code.trim() },
            include: { package: true }
        });
        if (!booking) {
            return res.status(404).json({ success: false, message: "ไม่พบข้อมูลการจอง" });
        }
        if (booking.status === "CONFIRMED") {
            return res.status(400).json({ success: false, message: "รายการจองนี้ชำระเงินเรียบร้อยแล้ว" });
        }

        // ยอดเงินใน Stripe หน่วยเป็น Satang (สตางค์) เช่น 1,000 บาท = 1000 * 100
        const unitAmountInSatang = Math.round(booking.total_price * 100);

        // หา Origin สำหรับ redirect กลับมาที่หน้าเว็บลูกค้า
        const clientOrigin = origin || req.headers.origin || "http://localhost:3000";

        // สร้าง Stripe Checkout Session (Stripe Dynamic Payment Methods)
        const session = await stripe.checkout.sessions.create({
            line_items: [
                {
                    price_data: {
                        currency: "thb", // สกุลเงินบาทไทย
                        product_data: {
                            name: booking.package?.name || `แพ็กเกจทัวร์รหัส ${booking.booking_code}`,
                            description: `รหัสการจอง: ${booking.booking_code} | ผู้เดินทาง: ${booking.adult_count + (booking.child_count || 0)} ท่าน`,
                        },
                        unit_amount: unitAmountInSatang,
                    },
                    quantity: 1,
                },
            ],
            mode: "payment",
            // URL ปลายทางเมื่อจ่ายเงินสำเร็จ หรือยกเลิก
            success_url: `${clientOrigin}/booking/success/${booking.booking_code}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${clientOrigin}/booking/success/${booking.booking_code}?canceled=true`,
            metadata: {
                booking_code: booking.booking_code,
                booking_id: booking.id.toString(),
            },
        });
        return res.status(200).json({
            success: true,
            url: session.url, // ลิงก์ที่หน้าเว็บจะ Redirect ไปจ่ายเงิน
            sessionId: session.id
        });
    } catch (error) {
        console.error("STRIPE CREATE SESSION ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "ไม่สามารถสร้างรายการชำระเงิน Stripe ได้",
            error: error.message
        });
    }
});

// -------------------------------------------------------------
// GET /api/booking/:code/verify-stripe?session_id=cs_test_...
// -------------------------------------------------------------
BookingRouter.get("/:code/verify-stripe", async (req, res) => {
    try {
        const { code } = req.params;
        const { session_id } = req.query;
        if (!session_id) {
            return res.status(400).json({ success: false, message: "ไม่พบ session_id" });
        }
        // ดึงข้อมูล Session จาก Stripe เพื่อยืนยันว่าจ่ายจริงหรือไม่
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_status === "paid") {
            const booking = await prisma.booking.findUnique({
                where: { booking_code: code.trim() },
                include: { package: true, travelers: true, booking_addons: true }
            });
            if (!booking) {
                return res.status(404).json({ success: false, message: "ไม่พบการจอง" });
            }
            // ถ้ายังไม่ได้อัปเดตเป็น CONFIRMED ให้อัปเดตและลงตาราง Payment พร้อมมอบแต้ม
            if (booking.status !== "CONFIRMED") {
                await prisma.$transaction(async (tx) => {
                    await tx.booking.update({
                        where: { id: booking.id },
                        data: { status: "CONFIRMED" }
                    });
                    await tx.payment.create({
                        data: {
                            booking_id: booking.id,
                            amount: booking.total_price,
                            payment_method: "STRIPE_CARD",
                            status: "APPROVED",
                            paid_at: new Date()
                        }
                    });
                    // คำนวณและมอบแต้มสะสม
                    await awardBookingPoints(tx, booking.id);
                });
                booking.status = "CONFIRMED";
            }
            return res.status(200).json({
                success: true,
                message: "ชำระเงินผ่านบัตรเครดิตสำเร็จแล้ว",
                data: booking
            });
        } else {
            return res.status(400).json({ success: false, message: "การชำระเงินยังไม่เสร็จสิ้น" });
        }
    } catch (error) {
        console.error("STRIPE VERIFY ERROR:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
});


module.exports = BookingRouter;