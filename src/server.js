// Zentura Backend
require("dotenv").config();
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is required to protect backoffice and insurance data");
const express = require("express");
const cors = require("cors");
const { helloRoute } = require("./routes/hello.js");
const authRoutes = require("./routes/auth.js");
const locationRoutes = require("./routes/location.js");
const locationTypeRoutes = require("./routes/location_type.js");
const partnerTypeRoutes = require("./routes/partner_type.js");
const partnerRoutes = require("./routes/partner.js");
const packageRoutes = require("./routes/package.js");
const BookingRouter = require("./routes/booking.js");
const collabRoutes = require("./routes/collab.js");
const BusRouter = require("./routes/bus.js");
const SeatingRouter = require("./routes/seating.js");
const SupplierRouter = require("./routes/supplier.js");
const guideRoutes = require("./routes/guide.js");
const insuranceRoutes = require("./routes/insurance.js");

const { employeeRoute } = require("./routes/employee.js");
const { positionRoute } = require("./routes/position.js");
const { prisma } = require("./config/db.js");

const server = express();
const PORT = process.env.PORT || 4000;

// Middlewares
server.use(cors());
server.post("/api/booking/stripe-webhook", express.raw({ type: "application/json" }), BookingRouter.stripeWebhook);
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

const path = require("path");
const uploadRoutes = require("./routes/upload.js");

// Serve uploaded files statically
server.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
server.use("/", helloRoute);
server.use("/api/auth", authRoutes);
server.use("/auth", authRoutes);
server.use("/api/upload", uploadRoutes);
server.use("/upload", uploadRoutes);
server.use("/api/location", locationRoutes);
server.use("/location", locationRoutes);
server.use("/api/location-type", locationTypeRoutes);
server.use("/location-type", locationTypeRoutes);
server.use("/api", employeeRoute);
server.use("/", employeeRoute);
server.use("/api", positionRoute);
server.use("/", positionRoute);
server.use("/api/partner-type", partnerTypeRoutes);
server.use("/partner-type", partnerTypeRoutes);
server.use("/api/partner", partnerRoutes);
server.use("/partner", partnerRoutes);
server.use("/api/packages", packageRoutes);
server.use("/packages", packageRoutes);
server.use("/api/booking", BookingRouter);
server.use("/booking", BookingRouter);
server.use("/api/insurance", insuranceRoutes);
server.use("/api/collab", collabRoutes);
server.use("/collab", collabRoutes);
server.use("/api/bus", BusRouter);
server.use("/bus", BusRouter);
server.use("/api/seating", SeatingRouter);
server.use("/api/supplier", SupplierRouter);
server.use("/api/guide", guideRoutes);

server.use("/api/collaps", collabRoutes);
server.use("/collaps", collabRoutes);


server.get("/role", async (req, res) => {
  try {
    const data = await prisma.role.findMany({
      select: {
        id: true,
        name: true,
        createAt: true,
      },
    });
    return res.json({ data });
  } catch (error) {
    console.error("GET /role error:", error);
    return res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในการดึงข้อมูลตำแหน่ง", error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Zentura Backend Server running on port ${PORT}`);
});
