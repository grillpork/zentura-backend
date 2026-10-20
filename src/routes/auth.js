const express = require('express');
const { prisma } = require('../config/db.js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../middlewares/authMiddleware.js');

const router = express.Router();

// Customer and employee IDs are generated in separate tables and can be equal.
// Never infer the account type by whichever table happens to contain the ID first.
const accountType = (claims) => {
    if (claims?.isEmployee === true && claims.portal === 'backoffice') return 'employee';
    if (claims?.isEmployee !== true && !claims?.portal) return 'customer';
    return null;
};

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
        const { email, password, isEmployee } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมลและรหัสผ่านให้ครบถ้วน' });
        }

        // 1. Check Customer User first
        const user = isEmployee === true ? null : await prisma.user.findUnique({
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
                    phone: user.phone || '',
                    lineId: user.lineId || '',
                    age: user.age || null,
                    roleId: user.roleId,
                    role: user.role?.name,
                    points: user.points || 0
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
            include: { Role: {
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

            if (emp.Role?.name?.toLowerCase() === 'suppler') {
                return res.status(403).json({ success: false, message: 'บัญชี Supplier ใช้งานได้ที่หน้า /supplier/login เท่านั้น' });
            }

            const token = jwt.sign(
                { 
                    id: emp.id, 
                    email: emp.email, 
                    roleId: emp.roleId,
                    role: emp.Role?.name || 'Admin',
                    isEmployee: true,
                    portal: 'backoffice'
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
                    isEmployee: true,
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
            include: { Role: { select: { id: true, name: true } },
            },
        });

        if (!emp) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลพนักงาน' });
        }

        if (emp.Role?.name?.toLowerCase() === 'suppler') {
            return res.status(403).json({ success: false, message: 'บัญชี Supplier ใช้งานได้ที่หน้า /supplier/login เท่านั้น' });
        }

        const matchesCurrentPassword = currentPassword && (
            emp.password === currentPassword || await bcrypt.compare(currentPassword, emp.password).catch(() => false)
        );
        if (!matchesCurrentPassword) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
        }

        const updated = await prisma.emp.update({
            where: { id: emp.id },
            data: {
                password: await bcrypt.hash(newPassword, 10),
                isPasswordSet: 1,
            },
            include: { Role: { select: { id: true, name: true } },
            },
        });

        const token = jwt.sign(
            { 
                id: updated.id, 
                email: updated.email, 
                roleId: updated.roleId,
                role: updated.Role?.name || 'Admin',
                isEmployee: true,
                portal: 'backoffice'
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
                isEmployee: true,
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
        const type = accountType(req.user);
        if (!type) return res.status(403).json({ message: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงโปรไฟล์' });
        const user = type === 'customer' ? await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { 
                id: true, 
                email: true, 
                name: true, 
                phone: true,
                lineId: true,
                age: true,
                points: true,
                roleId: true,
                role: { select: { id: true, name: true } },
                createdAt: true,
                _count: {
                    select: { bookings: true }
                }
            }
        }) : null;

        if (user && user.email === req.user.email) {
            return res.status(200).json({ user });
        }

        const emp = type === 'employee' ? await prisma.emp.findUnique({
            where: { id: req.user.id },
            include: { Role: { select: { name: true } }
            }
        }) : null;

        if (emp && emp.email === req.user.email && emp.status !== 'ปิดใช้งาน') {
            return res.status(200).json({
                user: {
                    id: emp.id,
                    email: emp.email,
                    name: emp.name,
                    phone: emp.phone || '',
                    lineId: emp.lineId || '',
                    age: emp.age || null,
                    roleId: emp.roleId,
                    role: emp.Role,
                    position: emp.Role?.name || 'Admin',
                    status: emp.status || 'ใช้งาน',
                    isPasswordSet: emp.isPasswordSet ?? 0,
                    isEmployee: true,
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

// Update profile for user or employee
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, phone, lineId, age } = req.body;
        const userId = req.user.id;
        const type = accountType(req.user);
        if (!type) return res.status(403).json({ success: false, message: 'บัญชีนี้ไม่มีสิทธิ์แก้ไขโปรไฟล์' });

        const user = type === 'customer' ? await prisma.user.findUnique({ where: { id: userId } }) : null;
        if (user && user.email === req.user.email) {
            const updated = await prisma.user.update({
                where: { id: userId },
                data: {
                    name: name !== undefined ? name.trim() : user.name,
                    phone: phone !== undefined ? (phone ? phone.trim() : null) : user.phone,
                    lineId: lineId !== undefined ? (lineId ? lineId.trim() : null) : user.lineId,
                    age: age !== undefined ? (age ? parseInt(age) : null) : user.age,
                },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    lineId: true,
                    age: true,
                    roleId: true,
                    role: { select: { id: true, name: true } },
                    createdAt: true,
                    _count: {
                        select: { bookings: true }
                    }
                }
            });
            return res.status(200).json({ success: true, message: 'บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว', user: updated });
        }

        const emp = type === 'employee' ? await prisma.emp.findUnique({ where: { id: userId } }) : null;
        if (emp && emp.email === req.user.email && emp.status !== 'ปิดใช้งาน') {
            const updatedEmp = await prisma.emp.update({
                where: { id: userId },
                data: {
                    name: name !== undefined ? name.trim() : emp.name,
                    phone: phone !== undefined ? (phone ? phone.trim() : null) : emp.phone,
                    lineId: lineId !== undefined ? (lineId ? lineId.trim() : null) : emp.lineId,
                    age: age !== undefined ? (age ? parseInt(age) : null) : emp.age,
                },
                include: { Role: { select: { name: true } } }
            });
            return res.status(200).json({
                success: true,
                message: 'บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว',
                user: {
                    id: updatedEmp.id,
                    email: updatedEmp.email,
                    name: updatedEmp.name,
                    phone: updatedEmp.phone || '',
                    lineId: updatedEmp.lineId || '',
                    age: updatedEmp.age || null,
                    roleId: updatedEmp.roleId,
                    role: updatedEmp.Role,
                    position: updatedEmp.Role?.name || 'Admin',
                    status: updatedEmp.status || 'ใช้งาน',
                    isEmployee: true,
                }
            });
        }

        return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    } catch (error) {
        console.error('Update profile error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการอัปเดตโปรไฟล์', error: error.message });
    }
});

// Change password for user
router.post('/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        const type = accountType(req.user);
        if (!type) return res.status(403).json({ success: false, message: 'บัญชีนี้ไม่มีสิทธิ์เปลี่ยนรหัสผ่าน' });

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสผ่านปัจจุบันและรหัสผ่านใหม่' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
        }

        const user = type === 'customer' ? await prisma.user.findUnique({ where: { id: userId } }) : null;
        if (user && user.email === req.user.email) {
            let isMatch = false;
            try {
                isMatch = await bcrypt.compare(currentPassword, user.password);
            } catch (e) {
                isMatch = false;
            }
            if (!isMatch && user.password === currentPassword) {
                isMatch = true;
            }
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(newPassword, salt);
            await prisma.user.update({
                where: { id: userId },
                data: { password: hashedPassword }
            });
            return res.status(200).json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
        }

        const emp = type === 'employee' ? await prisma.emp.findUnique({ where: { id: userId } }) : null;
        if (emp && emp.email === req.user.email && emp.status !== 'ปิดใช้งาน') {
            let isMatch = emp.password === currentPassword;
            if (!isMatch) {
                try {
                    isMatch = await bcrypt.compare(currentPassword, emp.password);
                } catch (e) {}
            }
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
            }

            await prisma.emp.update({
                where: { id: userId },
                data: { password: await bcrypt.hash(newPassword, 10), isPasswordSet: 1 }
            });
            return res.status(200).json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จเรียบร้อยแล้ว' });
        }

        return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
    } catch (error) {
        console.error('Change password error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน', error: error.message });
    }
});

router.get('/users/search', async (req, res) => {
    try {
        const query = (req.query.q || req.query.query || '').trim();
        const users = await prisma.user.findMany({
            where: query ? {
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { email: { contains: query, mode: 'insensitive' } }
                ]
            } : {},
            select: {
                id: true,
                name: true,
                email: true,
            },
            take: 20
        });
        return res.status(200).json({ success: true, users, data: users });
    } catch (error) {
        console.error('Search users error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการค้นหาผู้ใช้งาน', error: error.message });
    }
});

// GET /points/my-points (or /api/auth/points/my-points)
router.get('/points/my-points', authMiddleware, async (req, res) => {
    try {
        if (accountType(req.user) !== 'customer') {
            return res.status(403).json({ success: false, message: 'แต้มสะสมสำหรับบัญชีลูกค้าเท่านั้น' });
        }
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                points: true,
                pointTransactions: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        booking: {
                            select: {
                                id: true,
                                booking_code: true,
                                total_price: true,
                                package: {
                                    select: {
                                        id: true,
                                        name: true,
                                        image: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!user || user.email !== req.user.email) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งาน' });
        }

        return res.status(200).json({
            success: true,
            data: {
                points: user.points || 0,
                transactions: user.pointTransactions || []
            }
        });
    } catch (error) {
        console.error('Get my-points error:', error);
        return res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการดึงข้อมูลแต้มสะสม', error: error.message });
    }
});

module.exports = router;

