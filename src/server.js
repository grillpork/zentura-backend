//Zentura Backend
const express = require('express')
const cors = require('cors')
const { helloRoute } = require("./routes/hello.js")
const authRoutes = require("./routes/auth.js")
const { prisma } = require("./config/db.js")
const server = express()

// Middleware
server.use(cors())
server.use(express.json()) // for parsing application/json

// Routes
server.use("/", helloRoute)
server.use("/api/auth", authRoutes)

// server.get('/role', async (req, res) => {
//     return res.json({ data: await prisma.role.findMany({ select: { name: true } }) })
// })

server.get('/role', async (req, res) => {
    const data = await prisma.role.findMany({
        select: {
            name: true,
            createAt: true
        }
    })

    console.log(data)

    if (data.length > 0) {
        console.log("เวลา Prisma:", data[0].createAt.toString())
    }

    return res.json({ data })
})



server.listen(4000, () => {
    console.log('Zentura Backend Server running on port 4000')
})