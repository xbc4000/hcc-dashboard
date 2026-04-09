(function() {
    'use strict';

    var loginTime = null;

    // ── Auth check ──
    function checkAuth() {
        fetch('/auth/status')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.authenticated) {
                    window.location.href = '/login.html';
                } else {
                    loginTime = data.loginTime || Date.now();
                    startDashboard();
                }
            })
            .catch(function() { window.location.href = '/login.html'; });
    }

    // ── Clock ──
    function initClock() {
        var clockEl = document.getElementById('hcc-clock');
        var dateEl = document.getElementById('hcc-date');
        var sessionEl = document.getElementById('hcc-session');

        function tick() {
            var now = new Date();
            var h = String(now.getHours()).padStart(2, '0');
            var m = String(now.getMinutes()).padStart(2, '0');
            var s = String(now.getSeconds()).padStart(2, '0');
            clockEl.textContent = h + ':' + m + ':' + s;

            var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            dateEl.textContent = days[now.getDay()] + ' ' + String(now.getDate()).padStart(2, '0') + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

            // Session timer
            if (loginTime) {
                var elapsed = Math.floor((Date.now() - loginTime) / 1000);
                var mins = Math.floor(elapsed / 60);
                var secs = elapsed % 60;
                sessionEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            }
        }
        tick();
        setInterval(tick, 1000);
    }

    // ── Data Polling ──
    function pollData() {
        fetch('/api/overview')
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/login.html'; return null; }
                return r.json();
            })
            .then(function(data) {
                if (!data) return;
                renderOverview(data.services);
                renderPihole(data.pihole);
                renderServers(data.prometheus);
                renderNetwatch(data.netwatch);
                renderLinks(data.links);
            })
            .catch(function(err) {
                console.error('[HCC] Poll error:', err);
            });
    }

    // ── Render: System Overview ──
    function renderOverview(services) {
        if (!services) return;
        var el = document.getElementById('overview-body');
        var html = '';

        var items = [
            { name: 'Router', key: 'router' },
            { name: 'Pi-hole', key: 'pihole' },
            { name: 'Grafana', key: 'grafana' },
            { name: 'Prometheus', key: 'prometheus' }
        ];

        items.forEach(function(item) {
            var svc = services[item.key] || {};
            var status = svc.status || 'unknown';
            html += '<div class="service-row">';
            html += '  <div class="service-name"><div class="status-dot-sm ' + status + '"></div>' + item.name + '</div>';
            html += '  <div class="service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '</div>';
        });

        el.innerHTML = html;
    }

    // ── Render: Pi-hole ──
    function renderPihole(pihole) {
        var el = document.getElementById('pihole-body');
        if (!pihole) {
            el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;letter-spacing:2px;">AWAITING DATA...</div>';
            return;
        }

        var html = '';
        html += '<div class="stat-row"><span class="stat-label">Queries</span><span class="stat-value">' + Number(pihole.totalQueries).toLocaleString() + '</span></div>';
        html += '<div class="stat-row"><span class="stat-label">Blocked</span><span class="stat-value red">' + Number(pihole.blockedQueries).toLocaleString() + '</span></div>';
        html += '<div class="stat-row"><span class="stat-label">Block %</span><span class="stat-value orange">' + (pihole.percentBlocked || 0).toFixed(1) + '%</span></div>';
        html += '<div class="stat-row"><span class="stat-label">Gravity</span><span class="stat-value green">' + Number(pihole.gravitySize).toLocaleString() + '</span></div>';

        if (pihole.topBlocked && pihole.topBlocked.length > 0) {
            html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
            html += '<div class="stat-label" style="margin-bottom:8px;">Top Blocked</div>';
            pihole.topBlocked.slice(0, 5).forEach(function(d) {
                var domain = d.domain || d;
                var count = d.count || 0;
                html += '<div class="domain-row"><span class="domain-name">' + escapeHtml(domain) + '</span><span class="domain-count">' + count + '</span></div>';
            });
            html += '</div>';
        }

        el.innerHTML = html;
    }

    // ── Render: Server Health ──
    function renderServers(servers) {
        var el = document.getElementById('servers-body');
        if (!servers) {
            el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;letter-spacing:2px;">AWAITING DATA...</div>';
            return;
        }

        var html = '';
        var serverList = [
            { key: 'per730xd', name: 'PER730XD', vlan: 'VLAN10' },
            { key: 'per630', name: 'PER630', vlan: 'VLAN20' }
        ];

        serverList.forEach(function(srv) {
            var data = servers[srv.key];
            if (!data) return;

            html += '<div style="margin-bottom:16px;">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
            html += '  <span style="color:var(--text-bright);font-weight:700;letter-spacing:2px;">' + srv.name + '</span>';
            html += '  <span style="color:var(--text-muted);font-size:0.7rem;letter-spacing:1px;">' + srv.vlan + '</span>';
            html += '</div>';

            var metrics = [
                { label: 'CPU', value: data.cpu },
                { label: 'RAM', value: data.ram },
                { label: 'DISK', value: data.disk }
            ];

            metrics.forEach(function(m) {
                var val = m.value !== null ? m.value.toFixed(1) : '---';
                var pct = m.value || 0;
                var level = pct < 50 ? 'low' : (pct < 80 ? 'mid' : 'high');

                html += '<div style="margin-bottom:6px;">';
                html += '<div style="display:flex;justify-content:space-between;font-size:0.75rem;">';
                html += '  <span class="stat-label">' + m.label + '</span>';
                html += '  <span style="color:var(--text-bright);">' + val + '%</span>';
                html += '</div>';
                html += '<div class="progress-wrap"><div class="progress-fill ' + level + '" style="width:' + pct + '%;"></div></div>';
                html += '</div>';
            });

            if (data.load !== null) {
                html += '<div class="stat-row"><span class="stat-label">Load</span><span style="color:var(--text-bright);font-size:0.85rem;">' + data.load.toFixed(2) + '</span></div>';
            }
            html += '</div>';
        });

        el.innerHTML = html;
    }

    // ── Render: Netwatch ──
    function renderNetwatch(netwatch) {
        var el = document.getElementById('netwatch-body');
        if (!netwatch || !Array.isArray(netwatch)) {
            el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;letter-spacing:2px;">AWAITING DATA...</div>';
            return;
        }

        var html = '';
        netwatch.forEach(function(entry) {
            var status = entry.status || 'unknown';
            var name = entry.comment || entry.host;
            html += '<div class="service-row">';
            html += '  <div class="service-name"><div class="status-dot-sm ' + status + '"></div>' + escapeHtml(name) + '</div>';
            html += '  <div class="service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '</div>';
        });

        el.innerHTML = html;
    }

    // ── Render: Quick Links ──
    function renderLinks(links) {
        var el = document.getElementById('links-body');
        if (!links) return;

        var html = '<div class="links-grid">';
        links.forEach(function(link) {
            var status = link.status || 'unknown';
            html += '<a href="' + escapeHtml(link.url) + '" target="_blank" class="link-card">';
            html += '  <div class="link-card-name">' + escapeHtml(link.name) + '</div>';
            html += '  <div class="link-card-status service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '</a>';
        });
        html += '</div>';

        el.innerHTML = html;

        // Add corner brackets to each link card
        document.querySelectorAll('.link-card').forEach(function(card) {
            if (typeof addCornerBrackets === 'function') addCornerBrackets(card);
        });
    }

    // ── Helpers ──
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Start ──
    function startDashboard() {
        initClock();
        if (typeof addParticleField === 'function') addParticleField('particle-bg');
        if (typeof addScanLine === 'function') addScanLine();

        // Add corner brackets to panels
        document.querySelectorAll('.hcc-panel').forEach(function(panel) {
            if (typeof addCornerBrackets === 'function') addCornerBrackets(panel);
        });

        pollData();
        setInterval(pollData, 10000);
    }

    checkAuth();
})();
