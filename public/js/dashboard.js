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
            clockEl.textContent = String(now.getHours()).padStart(2, '0') + ':' +
                String(now.getMinutes()).padStart(2, '0') + ':' +
                String(now.getSeconds()).padStart(2, '0');

            var days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
            var months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
            dateEl.textContent = days[now.getDay()] + ' ' + String(now.getDate()).padStart(2, '0') + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();

            if (loginTime) {
                var elapsed = Math.floor((Date.now() - loginTime) / 1000);
                var hrs = Math.floor(elapsed / 3600);
                var mins = Math.floor((elapsed % 3600) / 60);
                var secs = elapsed % 60;
                sessionEl.textContent = (hrs > 0 ? String(hrs).padStart(2, '0') + ':' : '') +
                    String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            }
        }
        tick();
        setInterval(tick, 1000);
    }

    // ── Data Polling ──
    function pollData() {
        var dot = document.getElementById('hcc-poll-dot');
        if (dot) { dot.style.boxShadow = '0 0 20px var(--cyan)'; }

        fetch('/api/overview')
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/login.html'; return null; }
                return r.json();
            })
            .then(function(data) {
                if (!data) return;
                renderOverview(data.services);
                renderRouter(data.router);
                renderPihole(data.pihole);
                renderServers(data.prometheus);
                renderNetwatch(data.netwatch);
                renderTargets(data.prometheus);
                renderLinks(data.links);
                updateServiceCount(data.services);
                if (dot) { setTimeout(function() { dot.style.boxShadow = '0 0 10px var(--cyan)'; }, 300); }
            })
            .catch(function(err) {
                console.error('[HCC] Poll error:', err);
            });
    }

    function updateServiceCount(services) {
        if (!services) return;
        var up = 0, total = 0;
        for (var k in services) {
            total++;
            if (services[k].status === 'up') up++;
        }
        var el = document.getElementById('hcc-services-count');
        if (el) el.textContent = up + '/' + total + ' SERVICES';
    }

    // ── Render: System Overview ──
    function renderOverview(services) {
        if (!services) return;
        var el = document.getElementById('overview-body');
        var items = [
            { name: 'RouterOS', key: 'router', sub: 'RB3011-GW' },
            { name: 'Pi-hole', key: 'pihole', sub: 'DNS Sinkhole' },
            { name: 'Grafana', key: 'grafana', sub: 'Dashboards' },
            { name: 'Prometheus', key: 'prometheus', sub: 'Metrics DB' }
        ];

        var html = '';
        items.forEach(function(item) {
            var svc = services[item.key] || {};
            var status = svc.status || 'unknown';
            var ago = svc.lastPoll ? timeAgo(svc.lastPoll) : 'never';
            html += '<div class="service-row">';
            html += '  <div class="service-name"><div class="status-dot-sm ' + status + '"></div>';
            html += '    <div><span>' + item.name + '</span><br><span style="font-size:0.6rem;color:var(--text-muted);">' + item.sub + '</span></div>';
            html += '  </div>';
            html += '  <div style="text-align:right;"><div class="service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '    <div style="font-size:0.55rem;color:var(--text-muted);">' + ago + '</div>';
            html += '  </div>';
            html += '</div>';
        });
        el.innerHTML = html;
    }

    // ── Render: Router ──
    function renderRouter(router) {
        var el = document.getElementById('router-body');
        if (!router) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }
        var memPct = router.totalMemory > 0 ? ((1 - router.freeMemory / router.totalMemory) * 100) : 0;
        var hddPct = router.totalHdd > 0 ? ((1 - router.freeHdd / router.totalHdd) * 100) : 0;
        var memLevel = memPct < 50 ? 'low' : (memPct < 80 ? 'mid' : 'high');
        var hddLevel = hddPct < 50 ? 'low' : (hddPct < 80 ? 'mid' : 'high');
        var cpuLevel = router.cpuLoad < 50 ? 'low' : (router.cpuLoad < 80 ? 'mid' : 'high');

        var html = '';
        html += '<div class="stat-row"><span class="stat-label">Version</span><span style="color:var(--cyan-bright);font-size:0.85rem;">' + esc(router.version) + '</span></div>';
        html += '<div class="stat-row"><span class="stat-label">Board</span><span style="color:var(--text-bright);font-size:0.85rem;">' + esc(router.boardName) + '</span></div>';
        html += '<div class="stat-row"><span class="stat-label">Uptime</span><span style="color:var(--green);font-size:0.85rem;">' + esc(router.uptime) + '</span></div>';
        html += renderBar('CPU', router.cpuLoad, cpuLevel);
        html += renderBar('RAM', memPct, memLevel);
        html += renderBar('HDD', hddPct, hddLevel);
        el.innerHTML = html;
    }

    // ── Render: Pi-hole ──
    function renderPihole(pihole) {
        var el = document.getElementById('pihole-body');
        if (!pihole) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }

        var html = '';
        html += '<div class="stat-grid">';
        html += statBox('QUERIES', fmtNum(pihole.totalQueries), 'cyan');
        html += statBox('BLOCKED', fmtNum(pihole.blockedQueries), 'red');
        html += statBox('BLOCK %', (pihole.percentBlocked || 0).toFixed(1) + '%', 'orange');
        html += statBox('GRAVITY', fmtNum(pihole.gravitySize), 'green');
        html += '</div>';

        if (pihole.clients) {
            html += '<div class="stat-row" style="margin-top:8px;"><span class="stat-label">Active Clients</span><span class="stat-value">' + pihole.clients + '</span></div>';
        }

        if (pihole.topBlocked && pihole.topBlocked.length > 0) {
            html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">';
            html += '<div class="stat-label" style="margin-bottom:8px;">Top Blocked</div>';
            pihole.topBlocked.slice(0, 6).forEach(function(d) {
                var domain = d.domain || d;
                var count = d.count || 0;
                html += '<div class="domain-row"><span class="domain-name" style="color:var(--red);">' + esc(domain) + '</span><span class="domain-count">' + count + '</span></div>';
            });
            html += '</div>';
        }

        el.innerHTML = html;
    }

    // ── Render: Server Health ──
    function renderServers(promData) {
        var el = document.getElementById('servers-body');
        if (!promData || !promData.servers) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }

        var servers = promData.servers;
        var html = '';
        var serverList = [
            { key: 'per730xd', name: 'PER730XD', vlan: 'VLAN10', role: 'Workstation' },
            { key: 'per630', name: 'PER630', vlan: 'VLAN20', role: 'Ubuntu Server' }
        ];

        serverList.forEach(function(srv) {
            var data = servers[srv.key];
            if (!data) return;
            var statusCls = data.status === 'up' ? 'up' : 'down';

            html += '<div class="server-block">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">';
            html += '  <div style="display:flex;align-items:center;gap:8px;"><div class="status-dot-sm ' + statusCls + '"></div>';
            html += '    <span style="color:var(--text-bright);font-weight:700;letter-spacing:2px;">' + srv.name + '</span></div>';
            html += '  <span style="color:var(--text-muted);font-size:0.65rem;letter-spacing:1px;">' + srv.vlan + ' — ' + srv.role + '</span>';
            html += '</div>';

            html += renderBar('CPU', data.cpu, barLevel(data.cpu));
            html += renderBar('RAM', data.ram, barLevel(data.ram));
            html += renderBar('DISK', data.disk, barLevel(data.disk));

            if (data.load !== null) {
                html += '<div class="stat-row"><span class="stat-label">Load</span><span style="color:var(--text-bright);font-size:0.8rem;">' + data.load.toFixed(2) + '</span></div>';
            }
            if (data.uptime !== null) {
                html += '<div class="stat-row"><span class="stat-label">Uptime</span><span style="color:var(--green);font-size:0.8rem;">' + formatUptime(data.uptime) + '</span></div>';
            }
            html += '</div>';
        });

        el.innerHTML = html;
    }

    // ── Render: Netwatch ──
    function renderNetwatch(netwatch) {
        var el = document.getElementById('netwatch-body');
        var countEl = document.getElementById('netwatch-count');
        if (!netwatch || !Array.isArray(netwatch)) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }

        if (countEl) countEl.textContent = netwatch.length;
        var upCount = netwatch.filter(function(e) { return e.status === 'up'; }).length;

        var html = '<div style="margin-bottom:8px;font-size:0.7rem;color:var(--text-muted);letter-spacing:2px;">' +
            '<span style="color:var(--green);">' + upCount + ' UP</span> / ' +
            '<span style="color:' + (netwatch.length - upCount > 0 ? 'var(--red)' : 'var(--text-muted)') + ';">' +
            (netwatch.length - upCount) + ' DOWN</span></div>';

        netwatch.forEach(function(entry) {
            var status = entry.status || 'unknown';
            var name = entry.comment || entry.host;
            html += '<div class="service-row">';
            html += '  <div class="service-name"><div class="status-dot-sm ' + status + '"></div>' + esc(name) + '</div>';
            html += '  <div class="service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '</div>';
        });

        el.innerHTML = html;
    }

    // ── Render: Prometheus Targets ──
    function renderTargets(promData) {
        var el = document.getElementById('targets-body');
        if (!promData || !promData.targets) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }
        var t = promData.targets;
        var html = '<div style="margin-bottom:8px;font-size:0.7rem;color:var(--text-muted);letter-spacing:2px;">' +
            '<span style="color:var(--green);">' + t.up + ' UP</span> / ' +
            '<span style="color:' + (t.down > 0 ? 'var(--red)' : 'var(--text-muted)') + ';">' + t.down + ' DOWN</span>' +
            ' — ' + t.total + ' TOTAL</div>';

        t.targets.forEach(function(target) {
            var status = target.health === 'up' ? 'up' : 'down';
            html += '<div class="service-row">';
            html += '  <div class="service-name"><div class="status-dot-sm ' + status + '"></div>';
            html += '    <div><span>' + esc(target.job) + '</span><br><span style="font-size:0.6rem;color:var(--text-muted);">' + esc(target.instance) + '</span></div>';
            html += '  </div>';
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
            html += '<a href="' + esc(link.url) + '" target="_blank" class="link-card">';
            html += '  <div class="link-card-name">' + esc(link.name) + '</div>';
            html += '  <div class="link-card-status service-status ' + status + '">' + status.toUpperCase() + '</div>';
            html += '</a>';
        });
        html += '</div>';
        el.innerHTML = html;

        document.querySelectorAll('.link-card').forEach(function(card) {
            if (typeof addCornerBrackets === 'function') addCornerBrackets(card);
        });
    }

    // ── Helpers ──
    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function fmtNum(n) { return Number(n || 0).toLocaleString(); }

    function barLevel(pct) { return (pct || 0) < 50 ? 'low' : ((pct || 0) < 80 ? 'mid' : 'high'); }

    function renderBar(label, pct, level) {
        var val = pct !== null && pct !== undefined ? pct.toFixed(1) : '---';
        var w = pct || 0;
        return '<div style="margin-bottom:6px;">' +
            '<div style="display:flex;justify-content:space-between;font-size:0.7rem;">' +
            '<span class="stat-label">' + label + '</span>' +
            '<span style="color:var(--text-bright);">' + val + '%</span></div>' +
            '<div class="progress-wrap"><div class="progress-fill ' + level + '" style="width:' + w + '%;"></div></div></div>';
    }

    function statBox(label, value, color) {
        return '<div class="stat-box">' +
            '<div class="stat-box-value ' + color + '">' + value + '</div>' +
            '<div class="stat-box-label">' + label + '</div></div>';
    }

    function timeAgo(ts) {
        var s = Math.floor((Date.now() - ts) / 1000);
        if (s < 5) return 'just now';
        if (s < 60) return s + 's ago';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        return Math.floor(s / 3600) + 'h ago';
    }

    function formatUptime(seconds) {
        if (!seconds) return '---';
        var d = Math.floor(seconds / 86400);
        var h = Math.floor((seconds % 86400) / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return d + 'd ' + h + 'h';
        if (h > 0) return h + 'h ' + m + 'm';
        return m + 'm';
    }

    // ── Start ──
    function startDashboard() {
        initClock();
        if (typeof addParticleField === 'function') addParticleField('particle-bg');
        if (typeof addScanLine === 'function') addScanLine();

        document.querySelectorAll('.hcc-panel').forEach(function(panel) {
            if (typeof addCornerBrackets === 'function') addCornerBrackets(panel);
        });

        pollData();
        setInterval(pollData, 10000);
    }

    checkAuth();
})();
