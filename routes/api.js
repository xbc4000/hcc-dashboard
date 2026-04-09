const express = require('express');
const router = express.Router();

router.get('/overview', function(req, res) {
    const poller = req.app.get('poller');
    if (!poller) return res.status(500).json({ error: 'Poller not initialized' });
    res.json(poller.getOverview());
});

router.get('/pihole', function(req, res) {
    const poller = req.app.get('poller');
    res.json(poller.cache.pihole);
});

router.get('/servers', function(req, res) {
    const poller = req.app.get('poller');
    res.json(poller.cache.prometheus);
});

router.get('/netwatch', function(req, res) {
    const poller = req.app.get('poller');
    res.json(poller.cache.netwatch);
});

module.exports = router;
