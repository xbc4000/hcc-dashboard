const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.get('/overview', function(req, res) {
    var poller = req.app.get('poller');
    if (!poller) return res.status(500).json({ error: 'Poller not initialized' });
    res.json(poller.getOverview());
});

// SHA-256 helper for clients in non-secure contexts (no crypto.subtle over HTTP).
// Used by the OBS WebSocket auth flow which requires SHA-256 of password+salt+challenge.
router.post('/sha256-base64', function(req, res) {
    var input = req.body && req.body.input;
    if (typeof input !== 'string') return res.status(400).json({ error: 'input must be a string' });
    var hash = crypto.createHash('sha256').update(input).digest('base64');
    res.json({ hash: hash });
});

module.exports = router;
