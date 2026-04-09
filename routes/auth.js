const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

router.post('/login', async function(req, res) {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const hash = process.env.HCC_PASSWORD_HASH;
    if (!hash) return res.status(500).json({ error: 'Server not configured' });

    try {
        const match = await bcrypt.compare(password, hash);
        if (match) {
            req.session.authenticated = true;
            req.session.loginTime = Date.now();
            res.json({ success: true });
        } else {
            res.status(401).json({ error: 'ACCESS DENIED' });
        }
    } catch (err) {
        console.error('[HCC] Auth error:', err.message);
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/logout', function(req, res) {
    req.session.destroy(function() {
        res.json({ success: true });
    });
});

router.get('/status', function(req, res) {
    res.json({
        authenticated: !!(req.session && req.session.authenticated),
        loginTime: req.session ? req.session.loginTime : null
    });
});

module.exports = router;
