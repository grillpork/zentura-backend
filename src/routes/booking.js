const { prisma } = require("../config/db.js");
const express = require("express");
const jwt = require("jsonwebtoken");
const { authMiddleware } = require("../middlewares/authMiddleware.js");

const BookingRouter = express.Router();


// ฟังก์ชันสร้างรหัสการจอง เช่น ZT-2410-A1B2
const generateBookingCode = () => {
    const dateStr = new Date().toISOString().slice(2, 7).replace("-", ""); // เช่น 2410
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ZT-${dateStr}-${randomStr}`;
};

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
        if (!package_id || !travel_date || !contact_name || !contact_email || !contact_phone) {
            return res.status(400).json({ message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" });
        }
        
        // เช็คว่าวันที่จองเป็นวันปัจจุบันหรือในอนาคตหรือไม่
        if (new Date(travel_date) < new Date()) {
            return res.status(400).json({ message: "ห้ามเลือกวันที่ต่ำกว่าวันนี้" });
        }
        //ตัวแปรกำหนดจำนวนตามประเภทผู้ใหญ่ เด็ก
        const adults = parseInt(adult_count) || 1;
        const children = parseInt(child_count) || 0;

        // คำนวณราคาส่วนแรกจาก pkg
        const pkg = await prisma.package.findUnique({
            where: { id: parseInt(package_id) },
            include: { addons: true }
        });
        if (!pkg) {
            return res.status(404).json({ message: "ไม่พบแพ็คเกจ" });
        }
        if (pkg.status !== "Published") {
            return res.status(400).json({ message: "แพ็กเกจนี้ยังไม่เปิดรับการจอง" });
        }
        //คำนวณราคาที่เซิร์ฟเวอร์ (Zero-Trust Pricing)
        const packagePrice = pkg.price || 0;
        const baseTotal = packagePrice * adults;

        // คำนวณราคา Addon จากฐานข้อมูล
        let addonTotal = 0;
        const addonInsertData = [];
        //select addon ห้ามติดลบ
        if (Array.isArray(selected_addons) && selected_addons.length > 0) {
            for(const item of selected_addons){
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

        //บันทึกลง db
        const newBooking = await prisma.booking.create({
            data: {
                user_id: userId,
                booking_code: bookingCode,
                package_id: pkg.id,
                travel_date: new Date(travel_date),
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
            },
            include: {
                travelers: true,
                booking_addons: true,
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
// GET /my-bookings -> ดึงประวัติการจองทั้งหมดของ User ที่ล็อกอินอยู่
// -------------------------------------------------------------
BookingRouter.get("/my-bookings", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id; // ดึง id จาก Token

        const bookings = await prisma.booking.findMany({
            where: {
                user_id: userId // ดึงเฉพาะรายการที่เป็นของ user คนนี้
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
        if (status) {
            whereCondition.status = status;
        }
        if (search && search.trim()) {
            whereCondition.OR = [
                { booking_code: { contains: search.trim(), mode: "insensitive" } },
                { contact_name: { contains: search.trim(), mode: "insensitive" } },
                { contact_phone: { contains: search.trim(), mode: "insensitive" } },
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
    try{
        const id = parseInt(req.params.id);
        if(isNaN(id)){
            return next();
        }
        const booking = await prisma.booking.findUnique({
            where:{id},
            include:{
                package:{
                    select:{
                        id:true,
                        name:true,
                        price:true,
                        image:true,
                        description:true
                    }
                },
                travelers: true,
                booking_addons:true,
                payments:{
                    orderBy:{createdAt:"desc"}
                }
            }
        });
        if(!booking){
             return res.status(404).json({ message: "ไม่พบข้อมูลการจองตาม ID นี้" });
        }
        return res.status(200).json({data: booking});
    }
    catch(error){
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

module.exports = BookingRouter;