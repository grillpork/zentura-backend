// Zentura Backend
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { helloRoute } = require("./routes/hello.js");
const authRoutes = require("./routes/auth.js");
const locationRoutes = require("./routes/location.js");
const locationTypeRoutes = require("./routes/location_type.js");
const { employeeRoute } = require("./routes/employee.js");
const { positionRoute } = require("./routes/position.js");
const { prisma } = require("./config/db.js");

const server = express();
const PORT = process.env.PORT || 4000;

// Middlewares
server.use(cors());
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Routes
server.use("/", helloRoute);
server.use("/api/auth", authRoutes);
server.use("/auth", authRoutes);
server.use("/api/location", locationRoutes);
server.use("/location", locationRoutes);
server.use("/api/location-type", locationTypeRoutes);
server.use("/location-type", locationTypeRoutes);
server.use("/api", employeeRoute);
server.use("/", employeeRoute);
server.use("/api", positionRoute);
server.use("/", positionRoute);

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
