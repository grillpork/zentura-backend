const express = require('express');
const { prisma } = require('../config/db.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middlewares/authMiddleware.js');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน' });
        }

        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ message: 'มีผู้ใช้งานอีเมลนี้ในระบบแล้ว' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const generatedName = name || email.split('@')[0];

        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: generatedName,
                roleId: 1
            }
        });

        res.status(201).json({
            message: 'สมัครสมาชิกสำเร็จ',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน' });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true }
        });

        if (!user) {
            return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email,
                roleId: user.roleId,
                role: user.role?.name
            },
            process.env.JWT_SECRET || 'fallback_secret_key_123',
            { expiresIn: '1d' }
        );

        res.status(200).json({
            message: 'เข้าสู่ระบบสำเร็จ',
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                roleId: user.roleId,
                role: user.role?.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { 
                id: true, 
                email: true, 
                name: true, 
                roleId: true,
                role: { select: { name: true } },
                createdAt: true 
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
        }
        res.status(200).json({ user });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
    }
});

module.exports = router;
