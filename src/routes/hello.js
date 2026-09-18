const { Router } = require('express');


const helloRoute = Router();

helloRoute.get('/', (req, res) => {
    res.send("Hello World")
})

module.exports = { helloRoute };