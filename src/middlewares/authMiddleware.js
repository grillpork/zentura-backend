const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db.js');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ message: 'ไม่พบ Token การยืนยันตัวตน' });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'รูปแบบ Token ไม่ถูกต้อง' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_123');
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }
};

const checkRole = (...allowedRoles) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        }

        try {
            let userRoleName = req.user.role;
            let userRoleId = req.user.roleId;

            if (!userRoleName && !userRoleId) {
                let user = await prisma.user.findUnique({
                    where: { id: req.user.id },
                    include: { role: true }
                });

                if (!user) {
                    const emp = await prisma.emp.findUnique({
                        where: { id: req.user.id },
                        include: { Role: true }
                    });
                    if (emp && emp.Role) {
                        user = {
                            ...emp,
                            role: emp.Role
                        };
                    }
                }

                if (!user || !user.role) {
                    return res.status(403).json({ message: 'ไม่พบข้อมูลสิทธิ์ของผู้ใช้งาน' });
                }

                userRoleName = user.role.name;
                userRoleId = user.roleId;
                req.user.role = userRoleName;
                req.user.roleId = userRoleId;
            }

            const hasPermission = allowedRoles.some((role) => {
                if (typeof role === 'number') {
                    return role === userRoleId;
                }
                return String(role).toLowerCase() === String(userRoleName).toLowerCase();
            });

            if (!hasPermission) {
                return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงการทำงานนี้' });
            }

            next();
        } catch (error) {
            console.error('Role authorization error:', error);
            return res.status(500).json({ message: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์' });
        }
    };
};

module.exports = { 
    authMiddleware, 
    checkRole, 
    authorizeRoles: checkRole 
};

