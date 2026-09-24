// Zentura Backend
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { helloRoute } = require("./routes/hello.js");
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
server.use("/", employeeRoute);
server.use("/api", employeeRoute);
server.use("/", positionRoute);
server.use("/api", positionRoute);

server.get("/role", async (req, res) => {
  return res.json({
    data: await prisma.role.findMany({ select: { id: true, name: true } }),
  });
});

server.listen(PORT, () => {
  console.log(`Zentura Backend Server running on port ${PORT}`);
});