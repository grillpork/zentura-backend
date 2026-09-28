const { prisma } = require("../config/db.js");
const express = require("express");

const PartnerRouter = express.Router();

PartnerRouter.get('/', async(req, res) => {
    try{
        const data = await prisma.partner.findMany({
        orderBy: {id: "asc"},
        include: {pt_type: true}
        })
        return res.status(200).json(data)
    }catch(error){
        console.error("Get partners error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

PartnerRouter.get('/:id', async(req, res) => {
    try{
        const id = parseInt(req.params.id)
        if(isNaN(id)){
            return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" })
        }
        const data = await prisma.partner.findUnique({
            where: {id},
            include: {pt_type: true}
        })
        if(!data){
            return res.status(404).json({ message: "ไม่พบข้อมูลพาร์ทเนอร์" })
        }
        return res.status(200).json(data)
    }catch(error){
        console.error("Get partner by id error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

PartnerRouter.post('/', async(req, res) => {
    try {
        const { name, phone, email, address, pt_type_id } = req.body;
        // 1. ตรวจสอบข้อมูลบังคับ
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ message: "กรุณาระบุชื่อพาร์ทเนอร์ (name)" });
        }
        if (!phone || typeof phone !== "string" || !phone.trim()) {
            return res.status(400).json({ message: "กรุณาระบุเบอร์โทรศัพท์ (phone)" });
        }
        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({ message: "กรุณาระบุอีเมล (email)" });
        }
        const parsedTypeId = parseInt(pt_type_id);
        if (isNaN(parsedTypeId)) {
            return res.status(400).json({ message: "รหัสประเภทพาร์ทเนอร์ (pt_type_id) ต้องเป็นตัวเลข" });
        }
        // 2. เช็กข้อมูลซ้ำ (แยกข้อความให้ชัดเจนว่าอะไรซ้ำ)
        const existingPartner = await prisma.partner.findUnique({
            where: { name: name.trim() },
        });
        if (existingPartner) {
            return res.status(400).json({ message: "มีชื่อพาร์ทเนอร์นี้ในระบบแล้ว" });
        }
        const existingPhone = await prisma.partner.findUnique({
            where: { phone: phone.trim() },
        });
        if (existingPhone) {
            return res.status(400).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว" });
        }
        const existingEmail = await prisma.partner.findUnique({
            where: { email: email.trim() },
        });
        if (existingEmail) {
            return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        // 3. บันทึกข้อมูล
        const data = await prisma.partner.create({
            data: {
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                address: address ? address.trim() : null, // ปลอดภัยแม้ไม่ส่ง address มา
                pt_type_id: parsedTypeId
            },
            include: { pt_type: true }
        });
        return res.status(201).json(data);
    } catch (error) {
        console.error("Create partner error:", error);
        if (error.code === "P2003") {
            return res.status(400).json({ message: "ไม่พบประเภทพาร์ทเนอร์ (pt_type_id) นี้ในระบบ" });
        }
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

PartnerRouter.put('/:id', async (req, res) => {
    try{
        const id = parseInt(req.params.id);
        if(isNaN(id)){
            return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" })
        }
        const { name, phone, email, address, pt_type_id } = req.body;
        
        // 1. ตรวจสอบข้อมูลบังคับ
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({ message: "กรุณาระบุชื่อพาร์ทเนอร์ (name)" });
        }
        if (!phone || typeof phone !== "string" || !phone.trim()) {
            return res.status(400).json({ message: "กรุณาระบุเบอร์โทรศัพท์ (phone)" });
        }
        if (!email || typeof email !== "string" || !email.trim()) {
            return res.status(400).json({ message: "กรุณาระบุอีเมล (email)" });
        }
        const parsedTypeId = parseInt(pt_type_id);
        if (isNaN(parsedTypeId)) {
            return res.status(400).json({ message: "รหัสประเภทพาร์ทเนอร์ (pt_type_id) ต้องเป็นตัวเลข" });
        }
        // 2. เช็กข้อมูลซ้ำ (ยกเว้นตัวเอง)
        const existingPartner = await prisma.partner.findUnique({
            where: { name: name.trim() },
        });
        if (existingPartner && existingPartner.id !== id) {
            return res.status(400).json({ message: "มีชื่อพาร์ทเนอร์นี้ในระบบแล้ว" });
        }
        const existingPhone = await prisma.partner.findUnique({
            where: { phone: phone.trim() },
        });
        if (existingPhone && existingPhone.id !== id) {
            return res.status(400).json({ message: "เบอร์โทรศัพท์นี้ถูกใช้งานแล้ว" });
        }
        const existingEmail = await prisma.partner.findUnique({
            where: { email: email.trim() },
        });
        if (existingEmail && existingEmail.id !== id) {
            return res.status(400).json({ message: "อีเมลนี้ถูกใช้งานแล้ว" });
        }
        // 3. อัปเดตข้อมูล
        const data = await prisma.partner.update({
            where: { id },
            data: {
                name: name.trim(),
                phone: phone.trim(),
                email: email.trim(),
                address: address ? address.trim() : null,
                pt_type_id: parsedTypeId
            },
            include: { pt_type: true }
        });
        return res.status(200).json(data)
    }catch(error){
        console.error("Update partner error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});

PartnerRouter.delete('/:id', async (req, res) => {
    try{
        const id = parseInt(req.params.id);
        if(isNaN(id)){
            return res.status(400).json({ message: "รหัส ID ไม่ถูกต้อง" })
        }
        const data = await prisma.partner.delete({
            where: {id},
        })
        return res.status(200).json(data)
    }catch(error){
        console.error("Delete partner error:", error);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์", error: error.message });
    }
});    

module.exports = PartnerRouter;
