//Zentura Backend
const express = require('express')
const { helloRoute } = require("./routes/hello.js")
const { prisma } = require("./config/db.js")
const server = express()



server.use("/", helloRoute)

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



server.listen(3000, () => {
    console.log('Zentura Backend Server running on port 3000')
})