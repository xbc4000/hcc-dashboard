require('dotenv').config();

// Prevent ANY unhandled error from crashing the process
process.on('uncaughtException', function(err) {
    console.error('[HCC] Uncaught exception:', err.message);
});
process.on('unhandledRejection', function(err) {
    console.error('[HCC] Unhandled rejection:', err && err.message ? err.message : err);
});

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const path = require('path');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const healthRoutes = require('./routes/health');
const spotifyRoutes = require('./routes/spotify');
const { Poller } = require('./services/poller');

const app = express();
const PORT = process.env.PORT || 3080;

// Session secret must be explicitly set — no silent weak fallback.
// Generate with: openssl rand -hex 32
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error('[HCC] FATAL: SESSION_SECRET env var must be set and at least 32 characters.');
    console.error('[HCC] Generate one with: openssl rand -hex 32');
    process.exit(1);
}

// Security headers — CSP disabled (internal network only)
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());

// Session config — file-backed store so sessions survive container
// recreations (rebuilds, docker restarts, host reboots). Files are
// written to /app/data/sessions which is a persistent volume.
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new FileStore({
        path: path.join(__dirname, 'data', 'sessions'),
        ttl: 24 * 60 * 60,          // seconds — matches cookie maxAge
        reapInterval: 60 * 60,      // prune expired sessions hourly
        retries: 0,                 // don't retry — return fresh session on read failure
        logFn: function() {},       // silent — no dev-console noise
    }),
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Auth middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Health check (unauthenticated)
app.use('/health', healthRoutes);

// Auth routes (unauthenticated)
app.use('/auth', authRoutes);

// Root — redirect to login or serve dashboard
app.get('/', function(req, res) {
    if (req.session && req.session.authenticated) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});

// Vendor files (gridstack from node_modules)
app.use('/vendor/gridstack', express.static(path.join(__dirname, 'node_modules/gridstack/dist')));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Spotify OAuth + API proxy (authenticated)
app.use('/spotify', requireAuth, spotifyRoutes);

// API routes (authenticated)
app.use('/api', requireAuth, apiRoutes);

// Start poller
const poller = new Poller();
poller.start();
app.set('poller', poller);

app.listen(PORT, '0.0.0.0', function() {
    console.log('[HCC] Dashboard running on port ' + PORT);
    console.log('[HCC] Prometheus: ' + (process.env.PROMETHEUS_URL || 'not configured'));
    console.log('[HCC] RouterOS: ' + (process.env.ROUTEROS_HOST || 'not configured'));
    console.log('[HCC] Grafana: ' + (process.env.GRAFANA_URL || 'not configured'));
});
