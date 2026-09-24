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
            return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน' });
        }

        // 1. Check Customer User first
        const user = await prisma.user.findUnique({
            where: { email },
            include: { role: true }
        });

        if (user) {
            let isMatch = false;
            try {
                isMatch = await bcrypt.compare(password, user.password);
            } catch (e) {
                isMatch = false;
            }
            if (!isMatch && user.password === password) {
                isMatch = true;
            }

            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
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

            return res.status(200).json({
                success: true,
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
        }

        // 2. Check Backoffice Employee (Emp) if not a customer User
        const emp = await prisma.emp.findFirst({
            where: {
                email: {
                    equals: email.trim(),
                    mode: 'insensitive',
                },
            },
            include: {
                Role: {
                    select: { id: true, name: true },
                },
            },
        });

        if (emp) {
            if (emp.status === 'ปิดใช้งาน') {
                return res.status(403).json({ success: false, message: 'บัญชีพนักงานนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ' });
            }

            let isMatch = emp.password === password;
            if (!isMatch) {
                try {
                    isMatch = await bcrypt.compare(password, emp.password);
                } catch (e) {
                    isMatch = false;
                }
            }

            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
            }

            const token = jwt.sign(
                { 
                    id: emp.id, 
                    email: emp.email, 
                    roleId: emp.roleId,
                    role: emp.Role?.name || 'Admin',
                    isEmployee: true
                },
                process.env.JWT_SECRET || 'fallback_secret_key_123',
                { expiresIn: '1d' }
            );

            return res.status(200).json({
                success: true,
                message: 'เข้าสู่ระบบสำเร็จ',
                token,
                user: {
                    id: emp.id,
                    email: emp.email,
                    name: emp.name,
                    phone: emp.phone || '',
                    roleId: emp.roleId,
                    role: emp.Role?.name || 'Admin',
                    position: emp.Role?.name || 'Admin',
                    status: emp.status || 'ใช้งาน',
                    isPasswordSet: emp.isPasswordSet ?? 0,
                }
            });
        }

        return res.status(401).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
    }
});

// POST /set-password (for Backoffice employee password update)
router.post('/set-password', async (req, res) => {
    try {
        const { employeeId, email, currentPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
        }

        const whereClause = employeeId
            ? { id: parseInt(employeeId, 10) }
            : { email: (email || '').trim().toLowerCase() };

        const emp = await prisma.emp.findFirst({
            where: whereClause,
            include: {
                Role: { select: { id: true, name: true } },
            },
        });

        if (!emp) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
        }

        if (currentPassword && emp.password !== currentPassword) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }

        const updated = await prisma.emp.update({
            where: { id: emp.id },
            data: {
                password: newPassword,
                isPasswordSet: 1,
            },
            include: {
                Role: { select: { id: true, name: true } },
            },
        });

        const token = jwt.sign(
            { 
                id: updated.id, 
                email: updated.email, 
                roleId: updated.roleId,
                role: updated.Role?.name || 'Admin',
                isEmployee: true
            },
            process.env.JWT_SECRET || 'fallback_secret_key_123',
            { expiresIn: '1d' }
        );

        return res.json({
            success: true,
            message: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว',
            user: {
                id: updated.id,
                name: updated.name,
                email: updated.email,
                phone: updated.phone || '',
                roleId: updated.roleId,
                position: updated.Role ? updated.Role.name : 'ไม่ระบุ',
                status: updated.status || 'ใช้งาน',
                isPasswordSet: 1,
            },
            token,
        });
    } catch (error) {
        console.error('POST /auth/set-password error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการตั้งรหัสผ่านใหม่', error: error.message });
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

        if (user) {
            return res.status(200).json({ user });
        }

        const emp = await prisma.emp.findUnique({
            where: { id: req.user.id },
            include: {
                Role: { select: { name: true } }
            }
        });

        if (emp) {
            return res.status(200).json({
                user: {
                    id: emp.id,
                    email: emp.email,
                    name: emp.name,
                    phone: emp.phone || '',
                    roleId: emp.roleId,
                    role: emp.Role,
                    position: emp.Role?.name || 'Admin',
                    status: emp.status || 'ใช้งาน',
                    isPasswordSet: emp.isPasswordSet ?? 0,
                    createdAt: emp.createdAt
                }
            });
        }

        return res.status(404).json({ message: 'ไม่พบข้อมูลผู้ใช้งาน' });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({ message: 'เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง' });
    }
});

module.exports = router;
