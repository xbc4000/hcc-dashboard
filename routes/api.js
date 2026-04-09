const express = require('express');
const router = express.Router();

router.get('/overview', function(req, res) {
    var poller = req.app.get('poller');
    if (!poller) return res.status(500).json({ error: 'Poller not initialized' });
    res.json(poller.getOverview());
});

module.exports = router;
