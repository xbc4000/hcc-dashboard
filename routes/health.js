const express = require('express');
const router = express.Router();

const startTime = Date.now();

router.get('/', function(req, res) {
    res.json({
        status: 'ok',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        version: '1.0.0'
    });
});

module.exports = router;
