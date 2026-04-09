require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const healthRoutes = require('./routes/health');
const { Poller } = require('./services/poller');

const app = express();
const PORT = process.env.PORT || 3080;

// Security headers — CSP disabled (internal network only)
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(express.json());

// Session config
app.use(session({
    secret: process.env.SESSION_SECRET || 'hcc-default-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// Auth middleware — protect everything except login page, health, and static assets
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) return next();
    res.status(401).json({ error: 'Unauthorized' });
}

// Health check (unauthenticated)
app.use('/health', healthRoutes);

// Auth routes (unauthenticated)
app.use('/auth', authRoutes);

// Static files — login.html always accessible, index.html requires auth
app.get('/', function(req, res) {
    if (req.session && req.session.authenticated) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.redirect('/login.html');
    }
});
app.use(express.static(path.join(__dirname, 'public')));

// API routes (authenticated)
app.use('/api', requireAuth, apiRoutes);

// Start poller
const poller = new Poller();
poller.start();

// Expose poller to routes
app.set('poller', poller);

app.listen(PORT, '0.0.0.0', function() {
    console.log('[HCC] Dashboard running on port ' + PORT);
});
