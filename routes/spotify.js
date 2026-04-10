// Spotify OAuth + API proxy
// Solves the "redirect URIs are not valid" problem by handling OAuth server-side
// with http://127.0.0.1:PORT/spotify/callback as the registered URI.
// Frontend talks to /spotify/* on the same origin — no CORS, no token in browser.

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Persistent token store — single-user app, tokens survive restarts
// and are shared across sessions (so OAuth from 127.0.0.1 SSH tunnel
// works when accessing from 10.40.40.2 later).
const TOKEN_FILE = process.env.HCC_SPOTIFY_TOKEN_FILE || '/app/data/spotify-tokens.json';

function loadTokens() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
        }
    } catch(e) { console.error('[HCC] Spotify token load error:', e.message); }
    return null;
}

function saveTokens(tokens) {
    try {
        fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
        fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
    } catch(e) { console.error('[HCC] Spotify token save error:', e.message); }
}

function clearTokens() {
    try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch(e) {}
}

// Helpers ────────────────────────────────────────────────────────────────────
function base64Url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateCodeVerifier() {
    return base64Url(crypto.randomBytes(32));
}

function codeChallengeFromVerifier(verifier) {
    return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

function getRedirectUri(req) {
    // Use the host the request came in on so it works with SSH tunnels
    var host = req.get('host'); // includes port
    var proto = req.protocol;
    return proto + '://' + host + '/spotify/callback';
}

async function refreshIfNeeded() {
    var sp = loadTokens();
    if (!sp || !sp.token) return null;
    if (Date.now() < sp.expiresAt - 60000) return sp;
    if (!sp.refreshToken || !sp.clientId) return null;
    try {
        var res = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: sp.clientId,
                grant_type: 'refresh_token',
                refresh_token: sp.refreshToken
            }).toString()
        });
        var data = await res.json();
        if (data.access_token) {
            sp.token = data.access_token;
            sp.expiresAt = Date.now() + (data.expires_in * 1000);
            if (data.refresh_token) sp.refreshToken = data.refresh_token;
            saveTokens(sp);
            return sp;
        }
    } catch(e) { console.error('[HCC] Spotify refresh error:', e.message); }
    return null;
}

// Routes ─────────────────────────────────────────────────────────────────────

// Status — are tokens stored and valid?
router.get('/status', async function(req, res) {
    var sp = loadTokens();
    if (!sp || !sp.token) return res.json({ connected: false });
    var fresh = await refreshIfNeeded();
    res.json({ connected: !!fresh, clientId: sp.clientId || null });
});

// Begin OAuth — store client ID + verifier in session, redirect to Spotify
router.get('/login', function(req, res) {
    var clientId = req.query.client_id;
    if (!clientId) return res.status(400).send('Missing client_id query parameter');

    var verifier = generateCodeVerifier();
    var challenge = codeChallengeFromVerifier(verifier);
    var redirectUri = getRedirectUri(req);

    // Verifier needs to live in session until callback (matching pair)
    req.session.spotifyAuth = {
        verifier: verifier,
        clientId: clientId,
        redirectUri: redirectUri
    };

    var scope = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
    var authUrl = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        scope: scope
    }).toString();
    res.redirect(authUrl);
});

// Callback — exchange code for tokens, persist to disk
router.get('/callback', async function(req, res) {
    var code = req.query.code;
    var auth = req.session.spotifyAuth;
    if (!code || !auth || !auth.verifier || !auth.clientId) {
        return res.status(400).send('Spotify callback failed — missing code or session. Start the OAuth flow again.');
    }
    try {
        var tokRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: auth.clientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: auth.redirectUri,
                code_verifier: auth.verifier
            }).toString()
        });
        var data = await tokRes.json();
        if (!data.access_token) {
            return res.status(400).send('Spotify token exchange failed: ' + JSON.stringify(data));
        }
        // Persist to disk so any session can use them
        saveTokens({
            token: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: Date.now() + (data.expires_in * 1000),
            clientId: auth.clientId
        });
        delete req.session.spotifyAuth;
        res.redirect('/');
    } catch(e) {
        res.status(500).send('Spotify token error: ' + e.message);
    }
});

// Logout — clear stored tokens
router.post('/logout', function(req, res) {
    clearTokens();
    res.json({ ok: true });
});

// Generic API proxy — forwards to api.spotify.com with stored token
router.all('/api/*', async function(req, res) {
    var sp = await refreshIfNeeded();
    if (!sp || !sp.token) return res.status(401).json({ error: 'Not connected' });

    var path = req.params[0];
    var query = '';
    var qIdx = req.originalUrl.indexOf('?');
    if (qIdx !== -1) query = req.originalUrl.substring(qIdx);
    var url = 'https://api.spotify.com/v1/' + path + query;

    try {
        var opts = {
            method: req.method,
            headers: { 'Authorization': 'Bearer ' + sp.token }
        };
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(req.body);
        }
        var apiRes = await fetch(url, opts);
        if (apiRes.status === 204) return res.status(204).end();
        var text = await apiRes.text();
        res.status(apiRes.status);
        if (text) {
            res.set('Content-Type', apiRes.headers.get('content-type') || 'application/json');
            res.send(text);
        } else {
            res.end();
        }
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
