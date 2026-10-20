const { prisma } = require("../config/db.js");
const { authMiddleware } = require("./authMiddleware.js");

const backofficeOnly = [authMiddleware, async (req, res, next) => {
  try {
    if (req.user?.isEmployee !== true || req.user?.portal !== "backoffice") {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลหลังบ้าน" });
    }
    const employee = await prisma.emp.findUnique({
      where: { id: req.user.id }, include: { Role: { select: { name: true } } }
    });
    if (!employee || employee.email !== req.user.email || employee.status === "ปิดใช้งาน" || employee.isPasswordSet !== 1 ||
        employee.Role?.name?.toLowerCase() === "suppler") {
      return res.status(403).json({ success: false, message: "ไม่มีสิทธิ์เข้าถึงข้อมูลหลังบ้าน" });
    }
    req.employee = employee;
    next();
  } catch (error) { next(error); }
}];

module.exports = { backofficeOnly };
