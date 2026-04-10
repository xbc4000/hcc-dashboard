(function() {
    'use strict';

    var loginTime = null;
    var lastQueries = null;
    var lastBlocked = null;
    var prevServices = {};

    function checkAuth() {
        fetch('/auth/status').then(function(r) { return r.json(); })
        .then(function(d) {
            if (!d.authenticated) window.location.href = '/login.html';
            else { loginTime = d.loginTime || Date.now(); startDashboard(); }
        }).catch(function() { window.location.href = '/login.html'; });
    }

    function initClock() {
        var clockEl = document.getElementById('hcc-clock');
        var dateEl = document.getElementById('hcc-date');
        var sessionEl = document.getElementById('hcc-session');
        function tick() {
            var now = new Date();
            clockEl.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0') + ':' + String(now.getSeconds()).padStart(2,'0');
            var days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
            var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            dateEl.textContent = days[now.getDay()] + ' ' + String(now.getDate()).padStart(2,'0') + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
            if (loginTime) {
                var e = Math.floor((Date.now() - loginTime) / 1000);
                var h = Math.floor(e/3600), m = Math.floor((e%3600)/60), s = e%60;
                sessionEl.textContent = (h>0?String(h).padStart(2,'0')+':':'') + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
            }
        }
        tick(); setInterval(tick, 1000);
    }

    function pollData() {
        var dot = document.getElementById('hcc-poll-dot');
        if (dot) dot.style.boxShadow = '0 0 20px var(--cyan)';
        fetch('/api/overview').then(function(r) {
            if (r.status === 401) { window.location.href = '/login.html'; return null; }
            return r.json();
        }).then(function(d) {
            if (!d) return;
            renderOverview(d.services);
            renderThreat(d.threat);
            renderRouter(d.router);
            renderPihole(d.pihole, d.history);
            renderServers(d.prometheus);
            renderNetwatch(d.netwatch);
            renderTargets(d.prometheus);
            renderFirewall(d.firewall, d.addressLists);
            renderDHCP(d.dhcp);
            renderBandwidth(d.interfaces);
            renderLogs(d.logs);
            renderLinks(d.links);
            updateServiceCount(d.services);
            updateTicker(d.pihole);
            updateHeaderLive(d.pihole);
            if (typeof window._hccUpdateSidebar === 'function') window._hccUpdateSidebar(d.pihole, d.threat, d.services);
            doAudio(d.pihole, d.services);
            flashPanels();
            // Re-apply effects that get destroyed by innerHTML re-renders
            setTimeout(function() {
                if (typeof window._hccApplyArcs === 'function') window._hccApplyArcs();
                if (typeof window._hccApplyRings === 'function') window._hccApplyRings();
            }, 100);
            if (dot) setTimeout(function() { dot.style.boxShadow = '0 0 10px var(--cyan)'; }, 300);
        }).catch(function(err) { console.error('[HCC] Poll error:', err); });
    }

    function updateServiceCount(s) {
        if (!s) return;
        var up=0,t=0; for(var k in s){t++;if(s[k].status==='up')up++;}
        var el = document.getElementById('hcc-services-count');
        if (el) el.textContent = up+'/'+t+' SERVICES';
    }

    function renderThreat(threat) {
        if (!threat) return;
        var el = document.getElementById('hcc-threat');
        if (!el) return;
        el.textContent = threat.level;
        el.style.color = threat.color;
        el.style.borderColor = threat.color;
        el.style.textShadow = '0 0 10px ' + threat.color;
    }

    // ── SYSTEM OVERVIEW ──
    function renderOverview(services) {
        if (!services) return;
        var el = document.getElementById('overview-body');
        var items = [
            {name:'RouterOS',key:'router',sub:'RB3011-GW'},
            {name:'Pi-hole',key:'pihole',sub:'DNS Sinkhole'},
            {name:'Grafana',key:'grafana',sub:'Dashboards'},
            {name:'Prometheus',key:'prometheus',sub:'Metrics DB'}
        ];
        var html = '';
        items.forEach(function(item) {
            var svc = services[item.key]||{};
            var status = svc.status||'unknown';
            var ago = svc.lastPoll ? timeAgo(svc.lastPoll) : 'never';
            // Detect status change for audio
            if (prevServices[item.key] && prevServices[item.key] !== status && status === 'down') {
                if (typeof HCCAudio !== 'undefined') HCCAudio.down();
            }
            prevServices[item.key] = status;
            html += '<div class="service-row">';
            html += '<div class="service-name"><div class="status-dot-sm '+status+'"></div>';
            html += '<div><span>'+item.name+'</span><br><span style="font-size:0.75rem;color:var(--text-muted);">'+item.sub+'</span></div></div>';
            html += '<div style="text-align:right;"><div class="service-status '+status+'">'+status.toUpperCase()+'</div>';
            html += '<div style="font-size:0.85rem;color:var(--text-muted);">'+ago+'</div></div></div>';
        });
        el.innerHTML = html;
    }

    // ── ROUTER ──
    function renderRouter(router) {
        var el = document.getElementById('router-body');
        if (!router) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var memPct = router.totalMemory>0?((1-router.freeMemory/router.totalMemory)*100):0;
        var hddPct = router.totalHdd>0?((1-router.freeHdd/router.totalHdd)*100):0;
        var html = '';
        html += row('Version','<span style="color:var(--cyan-bright);">'+esc(router.version)+'</span>');
        html += row('Board','<span style="color:var(--text-bright);">'+esc(router.boardName)+'</span>');
        html += row('Uptime','<span style="color:var(--green);">'+esc(router.uptime)+'</span>');
        html += bar('CPU',router.cpuLoad,lvl(router.cpuLoad));
        html += bar('RAM',memPct,lvl(memPct));
        html += bar('HDD',hddPct,lvl(hddPct));
        el.innerHTML = html;
    }

    // ── PI-HOLE ──
    var DONUT_COLORS = ['#00B7FF','#FF00B2','#00ff88','#ff6600','#B986F2','#FFD700','#ff2244','#00d4ff'];

    function renderPihole(pihole, history) {
        var el = document.getElementById('pihole-body');
        if (!pihole) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var html = '';

        // ── Status bar
        var statusColor = pihole.status==='enabled'?'var(--green)':'var(--red)';
        html += '<div class="ph-status-bar"><span style="color:'+statusColor+';">'+pihole.status.toUpperCase()+'</span>';
        html += '<span style="color:var(--text-muted);">'+pihole.clients+' ACTIVE CLIENTS</span>';
        if (pihole.uniqueDomains) html += '<span style="color:var(--text-muted);">'+fmtNum(pihole.uniqueDomains)+' DOMAINS</span>';
        html += '</div>';

        // ── Stat boxes
        html += '<div class="stat-grid stat-grid-4">';
        html += statBox('QUERIES',fmtNum(pihole.totalQueries),'cyan');
        html += statBox('BLOCKED',fmtNum(pihole.blockedQueries),'red');
        html += statBox('BLOCK %',(pihole.percentBlocked||0).toFixed(1)+'%','orange');
        html += statBox('GRAVITY',fmtCompact(pihole.gravitySize),'green');
        html += '</div>';

        // ── Query breakdown bars (forwarded / cached / blocked)
        var fwd = pihole.forwarded || 0;
        var cached = pihole.cached || 0;
        var blocked = pihole.blockedQueries || 0;
        var total = pihole.totalQueries || 1;
        html += '<div class="ph-section">';
        html += '<div class="stat-label" style="margin-bottom:6px;">QUERY BREAKDOWN</div>';
        html += breakdownBar('FORWARDED', fwd, total, 'var(--cyan)');
        html += breakdownBar('CACHED', cached, total, 'var(--green)');
        html += breakdownBar('BLOCKED', blocked, total, 'var(--red)');
        html += '</div>';

        // ── Donut charts row
        var hasQueryTypes = pihole.queryTypes && pihole.queryTypes.length > 0;
        var hasUpstreams = pihole.upstreams && pihole.upstreams.length > 0;
        if (hasQueryTypes || hasUpstreams) {
            html += '<div class="ph-donuts">';
            if (hasQueryTypes) {
                var qtData = pihole.queryTypes.slice(0, 8).map(function(q, i) {
                    return { label: q.type, value: q.count, color: DONUT_COLORS[i % DONUT_COLORS.length] };
                });
                html += '<div class="ph-donut-col">';
                html += '<div class="stat-label">QUERY TYPES</div>';
                html += '<div class="ph-donut-wrap">';
                html += (typeof renderDonut==='function'?renderDonut(qtData, 130):'');
                html += '<div class="ph-donut-legend">'+(typeof renderDonutLegend==='function'?renderDonutLegend(qtData):'')+'</div>';
                html += '</div></div>';
            }
            if (hasUpstreams) {
                var usData = pihole.upstreams.slice(0, 6).map(function(u, i) {
                    return { label: u.name, value: u.pct, color: DONUT_COLORS[(i+3) % DONUT_COLORS.length] };
                });
                html += '<div class="ph-donut-col">';
                html += '<div class="stat-label">UPSTREAM SERVERS</div>';
                html += '<div class="ph-donut-wrap">';
                html += (typeof renderDonut==='function'?renderDonut(usData, 130):'');
                html += '<div class="ph-donut-legend">'+(typeof renderDonutLegend==='function'?renderDonutLegend(usData):'')+'</div>';
                html += '</div></div>';
            }
            html += '</div>';
        }

        // ── Top blocked domains
        if (pihole.topBlocked && pihole.topBlocked.length > 0) {
            html += '<div class="ph-section">';
            html += '<div class="stat-label" style="margin-bottom:6px;">TOP BLOCKED</div>';
            pihole.topBlocked.forEach(function(d) {
                var maxCount = pihole.topBlocked[0].count || 1;
                var pct = (d.count / maxCount * 100);
                html += '<div class="ph-domain-row">';
                html += '<div class="ph-domain-bar" style="width:'+pct+'%;"></div>';
                html += '<span class="ph-domain-name">'+esc(d.domain)+'</span>';
                html += '<span class="ph-domain-count">'+fmtNum(d.count)+'</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // ── Top queries
        if (pihole.topQueries && pihole.topQueries.length > 0) {
            html += '<div class="ph-section">';
            html += '<div class="stat-label" style="margin-bottom:6px;">TOP QUERIES</div>';
            pihole.topQueries.forEach(function(d) {
                var maxCount = pihole.topQueries[0].count || 1;
                var pct = (d.count / maxCount * 100);
                html += '<div class="ph-domain-row">';
                html += '<div class="ph-domain-bar allowed" style="width:'+pct+'%;"></div>';
                html += '<span class="ph-domain-name" style="color:var(--cyan);">'+esc(d.domain)+'</span>';
                html += '<span class="ph-domain-count">'+fmtNum(d.count)+'</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // ── Top clients
        if (pihole.topSources && pihole.topSources.length > 0) {
            html += '<div class="ph-section">';
            html += '<div class="stat-label" style="margin-bottom:6px;">TOP CLIENTS</div>';
            pihole.topSources.forEach(function(c) {
                var maxCount = pihole.topSources[0].count || 1;
                var pct = (c.count / maxCount * 100);
                html += '<div class="ph-domain-row">';
                html += '<div class="ph-domain-bar client" style="width:'+pct+'%;"></div>';
                html += '<span class="ph-domain-name" style="color:var(--purple);">'+esc(c.client)+'</span>';
                html += '<span class="ph-domain-count">'+fmtNum(c.count)+'</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // ── Sparklines
        if (history && history.queries && history.queries.length > 2) {
            html += '<div class="ph-section">';
            html += '<div class="stat-label" style="margin-bottom:4px;">QUERY TREND</div>';
            html += renderSparkline(history.queries, '#00B7FF', 400, 40);
            html += '</div>';
        }
        if (history && history.blocked && history.blocked.length > 2) {
            html += '<div style="margin-top:6px;">';
            html += '<div class="stat-label" style="margin-bottom:4px;">BLOCKED TREND</div>';
            html += renderSparkline(history.blocked, '#ff2244', 400, 40);
            html += '</div>';
        }

        el.innerHTML = html;
    }

    function breakdownBar(label, value, total, color) {
        var pct = total > 0 ? (value / total * 100) : 0;
        return '<div class="ph-breakdown">' +
            '<span class="ph-breakdown-label">' + label + '</span>' +
            '<div class="ph-breakdown-track"><div class="ph-breakdown-fill" style="width:' + pct.toFixed(1) + '%;background:' + color + ';box-shadow:0 0 8px ' + color + ';"></div></div>' +
            '<span class="ph-breakdown-value">' + fmtNum(value) + '</span>' +
            '<span class="ph-breakdown-pct" style="color:' + color + ';">' + pct.toFixed(1) + '%</span>' +
            '</div>';
    }

    function fmtCompact(n) {
        if (!n) return '0';
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return n.toLocaleString();
    }

    // ── SERVER HEALTH ──
    function renderServers(promData) {
        var el = document.getElementById('servers-body');
        if (!promData||!promData.servers) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var servers = promData.servers;
        var html = '';
        ['per730xd','per630'].forEach(function(key) {
            var s = servers[key]; if(!s) return;
            var hColor = s.health==='OK'?'var(--green)':'var(--red)';
            html += '<div class="server-block">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;"><div class="status-dot-sm '+(s.status==='up'?'up':'down')+'"></div>';
            html += '<span style="color:var(--text-bright);font-weight:700;letter-spacing:2px;">'+esc(s.name)+'</span></div>';
            html += '<span style="color:'+hColor+';font-size:0.8rem;letter-spacing:2px;">'+esc(s.health)+'</span></div>';
            if(s.model) html += '<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:6px;">'+esc(s.model)+'</div>';
            if(s.power!==null) {
                var pp=s.powerCap?(s.power/s.powerCap*100):0;
                html += '<div style="margin-bottom:4px;"><div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span class="stat-label">POWER</span><span style="color:var(--orange);">'+s.power+'W</span></div>';
                if(s.powerCap) html += '<div class="progress-wrap"><div class="progress-fill '+lvl(pp)+'" style="width:'+pp+'%;"></div></div>';
                html += '</div>';
            }
            if(s.temp!==null) html += row('Temp','<span style="color:'+(s.temp<35?'var(--green)':'var(--orange)')+';">'+s.temp+'°C</span>');
            if(s.fanSpeed!==null) html += row('Fan','<span style="color:var(--cyan);">'+fmtNum(s.fanSpeed)+' RPM</span>');
            if(s.totalRamGB!==null) html += row('RAM','<span style="color:var(--cyan-bright);">'+s.totalRamGB+' GB</span>');
            if(s.drives>0) { var dc=s.drivesHealthy===s.drives?'var(--green)':'var(--red)'; html += row('Drives','<span style="color:'+dc+';">'+s.drivesHealthy+'/'+s.drives+' Healthy</span>'); }
            if(s.psu>0) { var pc=s.psuHealthy===s.psu?'var(--green)':'var(--red)'; html += row('PSU','<span style="color:'+pc+';">'+s.psuHealthy+'/'+s.psu+' Healthy</span>'); }
            html += '</div>';
        });
        // RPi
        var rpi = servers.rpi;
        if (rpi && rpi.status==='up') {
            html += '<div class="server-block">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">';
            html += '<div style="display:flex;align-items:center;gap:8px;"><div class="status-dot-sm up"></div>';
            html += '<span style="color:var(--text-bright);font-weight:700;letter-spacing:2px;">RPi 4</span></div>';
            html += '<span style="color:var(--text-muted);font-size:0.75rem;">VLAN40</span></div>';
            html += bar('CPU',rpi.cpu,lvl(rpi.cpu));
            html += bar('RAM',rpi.ram,lvl(rpi.ram));
            html += bar('DISK',rpi.disk,lvl(rpi.disk));
            if(rpi.temp!==null) html += row('Temp','<span style="color:'+(rpi.temp<60?'var(--green)':'var(--orange)')+';">'+rpi.temp.toFixed(1)+'°C</span>');
            if(rpi.load!==null) html += row('Load','<span style="color:var(--text-bright);">'+rpi.load.toFixed(2)+'</span>');
            if(rpi.uptime!==null) html += row('Uptime','<span style="color:var(--green);">'+fmtUptime(rpi.uptime)+'</span>');
            html += '</div>';
        }
        el.innerHTML = html;
    }

    // ── NETWATCH ──
    function renderNetwatch(netwatch) {
        var el = document.getElementById('netwatch-body');
        var countEl = document.getElementById('netwatch-count');
        if (!netwatch||!Array.isArray(netwatch)) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        if (countEl) countEl.textContent = netwatch.length;
        var up = netwatch.filter(function(e){return e.status==='up';}).length;
        var html = '<div style="margin-bottom:6px;font-size:0.8rem;color:var(--text-muted);letter-spacing:2px;"><span style="color:var(--green);">'+up+' UP</span> / <span style="color:'+(netwatch.length-up>0?'var(--red)':'var(--text-muted)')+';">'+(netwatch.length-up)+' DOWN</span></div>';
        netwatch.forEach(function(e) {
            var s = e.status||'unknown';
            html += '<div class="service-row"><div class="service-name"><div class="status-dot-sm '+s+'"></div>'+esc(e.comment||e.host)+'</div><div class="service-status '+s+'">'+s.toUpperCase()+'</div></div>';
        });
        el.innerHTML = html;
    }

    // ── PROMETHEUS TARGETS ──
    function renderTargets(promData) {
        var el = document.getElementById('targets-body');
        if (!promData||!promData.targets) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var t = promData.targets;
        var html = '<div style="margin-bottom:6px;font-size:0.8rem;color:var(--text-muted);letter-spacing:2px;"><span style="color:var(--green);">'+t.up+' UP</span> / <span style="color:'+(t.down>0?'var(--red)':'var(--text-muted)')+';">'+t.down+' DOWN</span> — '+t.total+' TOTAL</div>';
        t.targets.forEach(function(tgt) {
            var s = tgt.health==='up'?'up':'down';
            html += '<div class="service-row"><div class="service-name"><div class="status-dot-sm '+s+'"></div><div><span>'+esc(tgt.job)+'</span><br><span style="font-size:0.75rem;color:var(--text-muted);">'+esc(tgt.instance)+'</span></div></div><div class="service-status '+s+'">'+s.toUpperCase()+'</div></div>';
        });
        el.innerHTML = html;
    }

    // ── FIREWALL ──
    function renderFirewall(fw, addrLists) {
        var el = document.getElementById('firewall-body');
        if (!fw) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var html = '';
        html += '<div class="stat-grid">';
        html += statBox('RULES',fw.totalRules,'cyan');
        html += statBox('DROP RULES',fw.dropRules,'red');
        html += statBox('DROPPED',fmtNum(fw.totalDropped),'orange');
        html += statBox('BLACKLISTS',addrLists?Object.keys(addrLists).length:0,'purple');
        html += '</div>';
        if (addrLists) {
            html += '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">';
            html += '<div class="stat-label" style="margin-bottom:6px;">ADDRESS LISTS</div>';
            for (var list in addrLists) {
                var color = list.indexOf('ssh')!==-1||list.indexOf('scan')!==-1||list.indexOf('ddos')!==-1?'var(--red)':'var(--text)';
                html += '<div class="service-row"><div class="service-name" style="color:'+color+';">'+esc(list)+'</div><div style="color:var(--cyan-bright);font-weight:700;">'+addrLists[list]+'</div></div>';
            }
            html += '</div>';
        }
        if (fw.topDrops && fw.topDrops.length > 0) {
            html += '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px;">';
            html += '<div class="stat-label" style="margin-bottom:6px;">TOP DROP RULES</div>';
            var maxPkts = fw.topDrops[0].packets || 1;
            fw.topDrops.slice(0,5).forEach(function(d) {
                var pct = (d.packets / maxPkts * 100);
                html += '<div class="ph-domain-row">';
                html += '<div class="ph-domain-bar" style="width:'+pct+'%;"></div>';
                html += '<span class="ph-domain-name" style="color:var(--red);">'+esc(d.comment)+'</span>';
                html += '<span class="ph-domain-count">'+fmtNum(d.packets)+' pkts</span>';
                html += '</div>';
            });
            html += '</div>';
        }
        el.innerHTML = html;
    }

    // ── DHCP LEASES ──
    function renderDHCP(dhcp) {
        var el = document.getElementById('dhcp-body');
        if (!dhcp||!Array.isArray(dhcp)) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var bound = dhcp.filter(function(l){return l.status==='bound';});
        var html = '<div style="margin-bottom:6px;font-size:0.8rem;color:var(--text-muted);letter-spacing:2px;"><span style="color:var(--green);">'+bound.length+' ACTIVE</span> / '+dhcp.length+' TOTAL</div>';
        dhcp.forEach(function(l) {
            var isBound = l.status === 'bound';
            var name = l.hostName || l.comment || l.macAddress || 'unknown';
            html += '<div class="service-row">';
            html += '<div class="service-name"><div class="status-dot-sm '+(isBound?'up':'unknown')+'"></div>';
            html += '<div><span>'+esc(name)+'</span><br><span style="font-size:0.75rem;color:var(--text-muted);">'+esc(l.address)+' — '+esc(l.server)+'</span></div></div>';
            html += '<div style="font-size:0.8rem;color:'+(isBound?'var(--green)':'var(--text-muted)')+';">'+l.status.toUpperCase()+'</div>';
            html += '</div>';
        });
        el.innerHTML = html;
    }

    // ── NETWORK BANDWIDTH ──
    function renderBandwidth(interfaces) {
        var el = document.getElementById('bandwidth-body');
        if (!interfaces||!Array.isArray(interfaces)) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var html = '';
        interfaces.slice(0,10).forEach(function(iface) {
            var rx = fmtBytes(iface.rxBytes);
            var tx = fmtBytes(iface.txBytes);
            html += '<div class="service-row">';
            html += '<div class="service-name" style="min-width:100px;"><span style="color:var(--text-bright);">'+esc(iface.name)+'</span></div>';
            html += '<div style="display:flex;gap:12px;font-size:0.85rem;">';
            html += '<span style="color:var(--green);">RX '+rx+'</span>';
            html += '<span style="color:var(--magenta);">TX '+tx+'</span>';
            html += '</div></div>';
        });
        el.innerHTML = html;
    }

    // ── ROUTER LOGS ──
    function renderLogs(logs) {
        var el = document.getElementById('logs-body');
        if (!logs||!Array.isArray(logs)) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }
        var html = '<div>';
        logs.forEach(function(log) {
            var topicColor = 'var(--text-muted)';
            if (log.topics.indexOf('error')!==-1||log.topics.indexOf('critical')!==-1) topicColor = 'var(--red)';
            else if (log.topics.indexOf('warning')!==-1) topicColor = 'var(--orange)';
            else if (log.topics.indexOf('info')!==-1) topicColor = 'var(--cyan)';
            html += '<div style="font-size:0.8rem;padding:2px 0;border-bottom:1px solid rgba(22,34,66,0.3);">';
            html += '<span style="color:var(--text-muted);">'+esc(log.time)+'</span> ';
            html += '<span style="color:'+topicColor+';">'+esc(log.topics)+'</span> ';
            html += '<span style="color:var(--text);">'+esc(log.message)+'</span>';
            html += '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
    }

    // ── QUICK LINKS ──
    function renderLinks(links) {
        var el = document.getElementById('links-body');
        if (!links) return;
        var html = '<div class="links-grid">';
        links.forEach(function(link) {
            var s = link.status||'unknown';
            html += '<a href="'+esc(link.url)+'" target="_blank" class="link-card">';
            html += '<div class="link-card-name">'+esc(link.name)+'</div>';
            html += '<div class="link-card-status service-status '+s+'">'+s.toUpperCase()+'</div></a>';
        });
        html += '</div>';
        el.innerHTML = html;
        document.querySelectorAll('.link-card').forEach(function(c) { if(typeof addCornerBrackets==='function') addCornerBrackets(c); });
    }

    // ── BLOCKED TICKER ──
    function updateTicker(pihole) {
        var content = document.getElementById('ticker-content');
        if (!content || !pihole) return;
        // Use top blocked from pihole exporter data if available
        var text = 'QUERIES: ' + fmtNum(pihole.totalQueries) + '  ◆  BLOCKED: ' + fmtNum(pihole.blockedQueries) + '  ◆  BLOCK RATE: ' + (pihole.percentBlocked||0).toFixed(1) + '%  ◆  GRAVITY: ' + fmtNum(pihole.gravitySize) + ' DOMAINS  ◆  CLIENTS: ' + (pihole.clients||0);
        content.textContent = text + '  ◆  ' + text;
    }

    // ── HEADER LIVE INDICATORS ──
    function updateHeaderLive(pihole) {
        if (!pihole) return;
        // DNS counter
        var dnsEl = document.getElementById('hcc-dns-count');
        if (dnsEl) dnsEl.textContent = fmtNum(pihole.totalQueries);
        // LIVE dot flash on query change
        var dot = document.getElementById('hcc-live-dot');
        var label = document.getElementById('hcc-live-label');
        if (dot && lastQueries !== null && pihole.totalQueries !== lastQueries) {
            dot.style.transform = 'scale(2)';
            dot.style.boxShadow = '0 0 20px #00ff88, 0 0 40px rgba(0,255,136,0.7)';
            dot.style.opacity = '1';
            dot.style.animation = 'none';
            if (label) label.style.textShadow = '0 0 15px rgba(0,255,136,0.9)';
            setTimeout(function() {
                dot.style.transform = 'scale(1)';
                dot.style.boxShadow = '';
                dot.style.opacity = '';
                dot.style.animation = 'hccLivePulse 1.5s ease-in-out infinite';
                if (label) label.style.textShadow = '0 0 8px rgba(0,255,136,0.4)';
            }, 500);
        }
    }

    // ── AUDIO ──
    function doAudio(pihole, services) {
        if (typeof HCCAudio === 'undefined' || !HCCAudio.ctx) return;
        if (pihole) {
            var q = pihole.totalQueries;
            var b = pihole.blockedQueries;
            if (lastQueries !== null && q !== lastQueries) {
                if (lastBlocked !== null && b !== lastBlocked) HCCAudio.alert();
                else HCCAudio.chirp();
            }
            lastQueries = q;
            lastBlocked = b;
        }
    }

    // ── PANEL FLASH ──
    function flashPanels() {
        document.querySelectorAll('.hcc-panel').forEach(function(p) {
            p.style.borderColor = 'rgba(0,183,255,0.4)';
            p.style.boxShadow = '0 0 15px rgba(0,183,255,0.1)';
            setTimeout(function() { p.style.borderColor = ''; p.style.boxShadow = ''; }, 400);
        });
    }

    // ── HELPERS ──
    function esc(s) { return s?String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'):''; }
    function fmtNum(n) { return Number(n||0).toLocaleString(); }
    function lvl(p) { return (p||0)<50?'low':((p||0)<80?'mid':'high'); }
    function row(label,value) { return '<div class="stat-row"><span class="stat-label">'+label+'</span>'+value+'</div>'; }
    function bar(label,pct,level) {
        var v=pct!==null&&pct!==undefined?pct.toFixed(1):'---';
        return '<div style="margin-bottom:5px;"><div style="display:flex;justify-content:space-between;font-size:0.85rem;"><span class="stat-label">'+label+'</span><span style="color:var(--text-bright);">'+v+'%</span></div><div class="progress-wrap"><div class="progress-fill '+level+'" style="width:'+(pct||0)+'%;"></div></div></div>';
    }
    function statBox(label,value,color) {
        return '<div class="stat-box"><div class="stat-box-value '+color+'">'+value+'</div><div class="stat-box-label">'+label+'</div></div>';
    }
    function timeAgo(ts) { var s=Math.floor((Date.now()-ts)/1000); if(s<5)return 'just now'; if(s<60)return s+'s ago'; if(s<3600)return Math.floor(s/60)+'m ago'; return Math.floor(s/3600)+'h ago'; }
    function fmtUptime(seconds) { if(!seconds)return '---'; var d=Math.floor(seconds/86400),h=Math.floor((seconds%86400)/3600),m=Math.floor((seconds%3600)/60); if(d>0)return d+'d '+h+'h'; if(h>0)return h+'h '+m+'m'; return m+'m'; }
    function fmtBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        var units = ['B','KB','MB','GB','TB'];
        var i = Math.floor(Math.log(bytes)/Math.log(1024));
        return (bytes/Math.pow(1024,i)).toFixed(1)+' '+units[i];
    }

    // ── GRIDSTACK LAYOUT ──
    var hccGrid = null;
    var editMode = false;
    var LAYOUT_KEY = 'hcc-layout';

    function initGrid() {
        if (typeof GridStack === 'undefined') return;

        // Load saved layout and apply positions before init
        var saved = null;
        try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch(e) {}
        if (saved && Array.isArray(saved)) {
            saved.forEach(function(item) {
                var el = document.querySelector('[gs-id="' + item.id + '"]');
                if (el) {
                    if (item.x !== undefined) el.setAttribute('gs-x', item.x);
                    if (item.y !== undefined) el.setAttribute('gs-y', item.y);
                    if (item.w !== undefined) el.setAttribute('gs-w', item.w);
                    if (item.h !== undefined) el.setAttribute('gs-h', item.h);
                }
            });
        }

        hccGrid = GridStack.init({
            column: 12,
            cellHeight: 80,
            margin: 6,
            animate: true,
            float: false,
            handle: '.hcc-panel-header',
            disableResize: true,
            disableDrag: true
        });

        // Save layout on any change
        hccGrid.on('change', function() { saveLayout(); });

        // Edit mode toggle
        var editBtn = document.getElementById('hcc-edit-btn');
        var resetBtn = document.getElementById('hcc-reset-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                editMode = !editMode;
                hccGrid.enableMove(editMode);
                hccGrid.enableResize(editMode);
                editBtn.textContent = editMode ? 'LOCK' : 'EDIT';
                editBtn.classList.toggle('active', editMode);
                resetBtn.style.display = editMode ? '' : 'none';
                document.body.classList.toggle('hcc-edit-mode', editMode);
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', function() {
                localStorage.removeItem(LAYOUT_KEY);
                window.location.reload();
            });
        }
    }

    function saveLayout() {
        if (!hccGrid) return;
        var items = hccGrid.getGridItems();
        var layout = items.map(function(el) {
            return {
                id: el.getAttribute('gs-id'),
                x: parseInt(el.getAttribute('gs-x')),
                y: parseInt(el.getAttribute('gs-y')),
                w: parseInt(el.getAttribute('gs-w')),
                h: parseInt(el.getAttribute('gs-h'))
            };
        });
        localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    }

    // ── SIDEBAR ──
    var NAV_ITEMS = [
        { id: 'home',     icon: 'HM', label: 'HOME',       color: '#00d4ff' },
        { id: 'pihole',   icon: 'PH', label: 'PI-HOLE',    color: '#00ff88' },
        { id: 'servers',  icon: 'SV', label: 'SERVERS',     color: '#ff6600' },
        { id: 'firewall', icon: 'FW', label: 'FIREWALL',    color: '#ff2244' },
        { id: 'network',  icon: 'NW', label: 'NETWORK',     color: '#B986F2' },
        { id: 'router',   icon: 'RT', label: 'ROUTER',      color: '#FFD700' },
        { id: 'monitor',  icon: 'MO', label: 'MONITOR',     color: '#FF00B2' }
    ];

    var currentPage = 'home';
    var homeLayoutSaved = null;

    // Dedicated page layouts: panels get resized for full-page view
    var PAGE_LAYOUTS = {
        pihole:   [{ id: 'pihole', w: 12, h: 10 }],
        servers:  [{ id: 'servers', w: 12, h: 10 }],
        firewall: [{ id: 'firewall', w: 6, h: 8 }, { id: 'netwatch', w: 6, h: 8 }],
        network:  [{ id: 'bandwidth', w: 6, h: 6 }, { id: 'dhcp', w: 6, h: 6 }],
        router:   [{ id: 'router', w: 5, h: 6 }, { id: 'logs', w: 7, h: 6 }],
        monitor:  [{ id: 'overview', w: 4, h: 5 }, { id: 'targets', w: 4, h: 5 }, { id: 'netwatch', w: 4, h: 5 }]
    };

    function switchPage(pageId) {
        if (pageId === currentPage) return;

        // Save HOME layout before leaving
        if (currentPage === 'home' && hccGrid) {
            homeLayoutSaved = [];
            hccGrid.getGridItems().forEach(function(el) {
                homeLayoutSaved.push({
                    id: el.getAttribute('gs-id'),
                    x: parseInt(el.getAttribute('gs-x')),
                    y: parseInt(el.getAttribute('gs-y')),
                    w: parseInt(el.getAttribute('gs-w')),
                    h: parseInt(el.getAttribute('gs-h'))
                });
            });
        }

        currentPage = pageId;

        // Show/hide panels based on data-pages
        var allItems = document.querySelectorAll('.grid-stack-item');
        if (hccGrid) hccGrid.batchUpdate(true);

        allItems.forEach(function(el) {
            var pages = (el.dataset.pages || 'home').split(',');
            if (pages.indexOf(pageId) !== -1) {
                el.classList.remove('hcc-page-hidden');
            } else {
                el.classList.add('hcc-page-hidden');
            }
        });

        // Resize panels for dedicated pages
        if (pageId !== 'home' && PAGE_LAYOUTS[pageId] && hccGrid) {
            PAGE_LAYOUTS[pageId].forEach(function(layout) {
                var el = document.querySelector('[gs-id="' + layout.id + '"]');
                if (el) hccGrid.update(el, { w: layout.w, h: layout.h, x: undefined, y: undefined });
            });
        }

        // Restore HOME layout
        if (pageId === 'home' && homeLayoutSaved && hccGrid) {
            homeLayoutSaved.forEach(function(item) {
                var el = document.querySelector('[gs-id="' + item.id + '"]');
                if (el) hccGrid.update(el, { x: item.x, y: item.y, w: item.w, h: item.h });
            });
        }

        if (hccGrid) {
            hccGrid.batchUpdate(false);
            hccGrid.compact();
        }

        // Update sidebar active state
        document.querySelectorAll('.hcc-sb-item').forEach(function(li) {
            li.classList.toggle('active', li.dataset.page === pageId);
        });

        // Re-apply effects after layout change
        setTimeout(function() {
            if (typeof window._hccApplyArcs === 'function') window._hccApplyArcs();
            if (typeof window._hccApplyRings === 'function') window._hccApplyRings();
        }, 200);
    }

    function buildSidebar() {
        var nav = document.getElementById('hcc-sb-nav');
        if (!nav) return;
        var sidebar = document.getElementById('hcc-sidebar');

        // ── HCC LOGO at top ──
        var logo = document.createElement('div');
        logo.id = 'hcc-sb-logo';
        logo.style.cssText = 'text-align:center;padding:14px 6px 10px;border-bottom:1px solid var(--border);margin-bottom:4px;';
        logo.innerHTML = '<div style="font-size:28px;font-weight:800;color:var(--cyan-bright);letter-spacing:4px;text-shadow:0 0 20px rgba(0,212,255,0.5),0 0 40px rgba(0,212,255,0.2);line-height:1;">HCC</div>' +
            '<div class="hcc-sb-label" style="font-size:8px;letter-spacing:3px;color:var(--text-muted);margin-top:4px;">COMMAND CENTER</div>';
        sidebar.insertBefore(logo, nav);

        NAV_ITEMS.forEach(function(item, i) {
            var accent = item.color;
            var isActive = item.id === 'home';
            var borderAlpha = isActive ? '' : '55';

            var li = document.createElement('li');
            li.className = 'hcc-sb-item' + (isActive ? ' active' : '');
            li.dataset.page = item.id;

            var panel = document.createElement('div');
            panel.className = 'hcc-sb-panel';

            // ── ICON ZONE ──
            var iconZone = document.createElement('div');
            iconZone.className = 'hcc-sb-iconzone';
            iconZone.style.cssText = 'border:1px solid ' + accent + borderAlpha + ';background:linear-gradient(180deg,rgba(2,4,12,0.97),' + accent + '08);' + (isActive ? 'box-shadow:0 0 15px ' + accent + '30,inset 0 0 10px ' + accent + '08;' : 'box-shadow:0 0 4px ' + accent + '10;');

            // Hex icon
            var iconWrap = document.createElement('div');
            iconWrap.className = 'hcc-sb-icon';
            iconWrap.style.cssText = 'background:' + accent + '18;border:2px solid ' + accent + 'aa;box-shadow:0 0 10px ' + accent + '35,inset 0 0 8px ' + accent + '12;color:' + accent + ';text-shadow:0 0 10px ' + accent + ',0 0 20px ' + accent + '60;';
            iconWrap.textContent = item.icon;
            iconZone.appendChild(iconWrap);

            // Index number
            var idx = document.createElement('div');
            idx.className = 'hcc-sb-idx';
            idx.style.color = accent;
            idx.textContent = String(i + 1).padStart(2, '0');
            iconZone.appendChild(idx);

            // Active dot
            if (isActive) {
                var dot = document.createElement('div');
                dot.className = 'hcc-sb-dot';
                iconZone.appendChild(dot);
            }

            // Activity bar
            var bar = document.createElement('div');
            bar.className = 'hcc-sb-bar';
            bar.style.cssText = 'background:linear-gradient(90deg,' + accent + ',' + accent + 'aa);box-shadow:0 0 4px ' + accent + '50;width:' + (isActive ? '100%' : '0%') + ';';
            iconZone.appendChild(bar);

            // Scan line
            var scan = document.createElement('div');
            scan.className = 'hcc-sb-scan';
            iconZone.appendChild(scan);

            panel.appendChild(iconZone);

            // ── LABEL ZONE ──
            var labelZone = document.createElement('div');
            labelZone.className = 'hcc-sb-labelzone';
            labelZone.style.cssText = 'border:1px solid ' + accent + borderAlpha + ';border-left:none;background:linear-gradient(135deg,rgba(2,4,12,0.95),' + accent + '06);' + (isActive ? 'box-shadow:0 0 10px ' + accent + '20;' : '');

            var label = document.createElement('span');
            label.className = 'hcc-sb-label';
            label.style.cssText = 'color:' + accent + ';text-shadow:0 0 8px ' + accent + '50;';
            label.textContent = item.label;
            labelZone.appendChild(label);
            panel.appendChild(labelZone);

            // ── HOVER EFFECTS ──
            panel.addEventListener('mouseenter', function() {
                iconZone.style.borderColor = accent;
                iconZone.style.boxShadow = '0 0 18px ' + accent + '40,inset 0 0 12px ' + accent + '0a';
                labelZone.style.borderColor = accent;
                labelZone.style.boxShadow = '0 0 12px ' + accent + '25';
                iconWrap.style.background = accent + '25';
                iconWrap.style.boxShadow = '0 0 15px ' + accent + '50,inset 0 0 10px ' + accent + '18';
                if (!isActive) bar.style.width = '60%';
            });

            panel.addEventListener('mouseleave', function() {
                iconZone.style.borderColor = accent + borderAlpha;
                iconZone.style.boxShadow = isActive ? '0 0 15px ' + accent + '30,inset 0 0 10px ' + accent + '08' : '0 0 4px ' + accent + '10';
                labelZone.style.borderColor = accent + borderAlpha;
                labelZone.style.boxShadow = isActive ? '0 0 10px ' + accent + '20' : 'none';
                iconWrap.style.background = accent + '18';
                iconWrap.style.boxShadow = '0 0 10px ' + accent + '35,inset 0 0 8px ' + accent + '12';
                if (!isActive) bar.style.width = '0%';
            });

            // Click to switch page
            (function(pageId) {
                panel.addEventListener('click', function() {
                    switchPage(pageId);
                });
            })(item.id);

            li.appendChild(panel);
            nav.appendChild(li);
        });

        // ── SIDEBAR WIDGETS (below nav) ──
        var sidebar = document.getElementById('hcc-sidebar');
        var widgetCSS = 'margin:8px 5px;padding:8px 10px;border:1px solid rgba(0,183,255,0.15);background:linear-gradient(180deg,rgba(0,183,255,0.03),rgba(0,0,0,0.3));font-family:var(--font-mono);clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));';
        var hdrCSS = 'font-size:9px;letter-spacing:3px;color:#0088bb;text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:5px;';
        var rowCSS = 'display:flex;justify-content:space-between;align-items:center;padding:1px 0;';

        // DNS Stats widget
        var dnsWidget = document.createElement('div');
        dnsWidget.className = 'hcc-sb-widget';
        dnsWidget.style.cssText = widgetCSS;
        dnsWidget.innerHTML = '<div style="' + hdrCSS + '"><span style="color:#00ff88;font-size:10px;animation:hccLivePulse 2s ease-in-out infinite;">●</span> DNS STATS</div>' +
            '<div style="' + rowCSS + '"><span style="font-size:10px;letter-spacing:2px;color:#6688aa;">QRY</span><span id="sb-queries" style="font-size:13px;color:#00d4ff;font-weight:700;text-shadow:0 0 6px rgba(0,212,255,0.4);letter-spacing:1px;">---</span></div>' +
            '<div style="' + rowCSS + '"><span style="font-size:10px;letter-spacing:2px;color:#6688aa;">BLK</span><span id="sb-blocked" style="font-size:13px;color:#ff6600;font-weight:700;text-shadow:0 0 6px rgba(255,102,0,0.4);letter-spacing:1px;">---</span></div>' +
            '<div style="' + rowCSS + '"><span style="font-size:10px;letter-spacing:2px;color:#6688aa;">PCT</span><span id="sb-pct" style="font-size:13px;color:#FF00B2;font-weight:700;text-shadow:0 0 6px rgba(255,0,178,0.4);letter-spacing:1px;">---</span></div>';
        sidebar.appendChild(dnsWidget);

        // Services widget
        var svcWidget = document.createElement('div');
        svcWidget.className = 'hcc-sb-widget';
        svcWidget.style.cssText = widgetCSS;
        svcWidget.innerHTML = '<div style="' + hdrCSS + '"><span style="color:#00d4ff;font-size:10px;">◆</span> SERVICES</div>' +
            '<div id="sb-services" style="font-size:10px;letter-spacing:1px;color:#6688aa;">---</div>';
        sidebar.appendChild(svcWidget);

        // Threat widget
        var threatWidget = document.createElement('div');
        threatWidget.className = 'hcc-sb-widget';
        threatWidget.style.cssText = widgetCSS;
        threatWidget.innerHTML = '<div style="' + hdrCSS + '"><span style="color:#ff6600;font-size:10px;">▲</span> THREAT</div>' +
            '<div style="height:3px;background:#111;border:1px solid rgba(0,183,255,0.1);margin:3px 0;position:relative;overflow:hidden;"><div id="sb-threat-fill" style="height:100%;width:20%;background:linear-gradient(90deg,#00ff88,#FFD700,#ff6600);transition:width 1s ease;"></div></div>' +
            '<div style="' + rowCSS + '"><span style="font-size:10px;color:#6688aa;letter-spacing:1px;">STATUS</span><span id="sb-threat-text" style="font-size:12px;color:#00ff88;font-weight:700;letter-spacing:2px;">LOW</span></div>';
        sidebar.appendChild(threatWidget);

        // Update sidebar widgets on each poll
        window._hccUpdateSidebar = function(pihole, threat, services) {
            var q = document.getElementById('sb-queries');
            var b = document.getElementById('sb-blocked');
            var p = document.getElementById('sb-pct');
            if (q && pihole) q.textContent = fmtNum(pihole.totalQueries);
            if (b && pihole) b.textContent = fmtNum(pihole.blockedQueries);
            if (p && pihole) p.textContent = (pihole.percentBlocked||0).toFixed(1) + '%';

            // Services
            var svcEl = document.getElementById('sb-services');
            if (svcEl && services) {
                var up=0,total=0;
                for(var k in services){total++;if(services[k].status==='up')up++;}
                svcEl.innerHTML = '<span style="color:var(--green);">' + up + ' UP</span> / <span style="color:' + (total-up>0?'var(--red)':'var(--text-muted)') + ';">' + (total-up) + ' DOWN</span>';
            }

            // Threat
            var tf = document.getElementById('sb-threat-fill');
            var tt = document.getElementById('sb-threat-text');
            if (tf && tt && threat) {
                var pctW = threat.level === 'LOW' ? 20 : threat.level === 'MEDIUM' ? 45 : threat.level === 'HIGH' ? 75 : 95;
                tf.style.width = pctW + '%';
                tt.textContent = threat.level;
                tt.style.color = threat.color;
            }
        };

        // ── NETWORK TOPOLOGY MINI-PANEL ──
        var topoWidget = document.createElement('div');
        topoWidget.className = 'hcc-sb-widget';
        topoWidget.style.cssText = widgetCSS + 'position:relative;overflow:hidden;';
        topoWidget.innerHTML = '<div style="' + hdrCSS + '"><span style="color:#B986F2;font-size:10px;">◎</span> NETWORK MAP</div>';

        // Topology canvas
        var topoCanvas = document.createElement('canvas');
        topoCanvas.id = 'hcc-sb-topo';
        topoCanvas.style.cssText = 'width:100%;height:140px;display:block;';
        topoWidget.appendChild(topoCanvas);
        sidebar.appendChild(topoWidget);

        // Draw topology nodes
        setTimeout(function() {
            var tc = document.getElementById('hcc-sb-topo');
            if (!tc) return;
            tc.width = tc.offsetWidth;
            tc.height = 140;
            var tCtx = tc.getContext('2d');
            var nodes = [
                { x: 0.5, y: 0.15, label: 'WAN', color: '#00d4ff', r: 5 },
                { x: 0.5, y: 0.38, label: 'RB3011', color: '#FFD700', r: 6 },
                { x: 0.18, y: 0.62, label: 'V10', color: '#00ff88', r: 4 },
                { x: 0.42, y: 0.62, label: 'V20', color: '#ff6600', r: 4 },
                { x: 0.65, y: 0.62, label: 'V30', color: '#ff2244', r: 4 },
                { x: 0.85, y: 0.62, label: 'V40', color: '#B986F2', r: 4 },
                { x: 0.18, y: 0.88, label: 'PCs', color: '#00ff88', r: 3 },
                { x: 0.42, y: 0.88, label: 'SRV', color: '#ff6600', r: 3 },
                { x: 0.65, y: 0.88, label: 'iDRAC', color: '#ff2244', r: 3 },
                { x: 0.85, y: 0.88, label: 'RPi', color: '#B986F2', r: 3 }
            ];
            var links = [[0,1],[1,2],[1,3],[1,4],[1,5],[2,6],[3,7],[4,8],[5,9]];

            function drawTopo() {
                var w = tc.width, h = tc.height;
                tCtx.clearRect(0, 0, w, h);
                // Draw links
                links.forEach(function(l) {
                    var a = nodes[l[0]], b = nodes[l[1]];
                    tCtx.beginPath();
                    tCtx.moveTo(a.x * w, a.y * h);
                    tCtx.lineTo(b.x * w, b.y * h);
                    tCtx.strokeStyle = 'rgba(0,183,255,0.25)';
                    tCtx.lineWidth = 1;
                    tCtx.stroke();
                });
                // Draw nodes
                var time = Date.now() * 0.001;
                nodes.forEach(function(n, ni) {
                    var nx = n.x * w, ny = n.y * h;
                    var pulse = 0.7 + Math.sin(time + ni) * 0.3;
                    // Glow
                    tCtx.beginPath();
                    tCtx.arc(nx, ny, n.r * 3, 0, Math.PI * 2);
                    tCtx.fillStyle = n.color.replace(')', ',' + (pulse * 0.1) + ')').replace('rgb', 'rgba').replace('#', '');
                    tCtx.fillStyle = 'rgba(' + hexToRgb(n.color) + ',' + (pulse * 0.12) + ')';
                    tCtx.fill();
                    // Core
                    tCtx.beginPath();
                    tCtx.arc(nx, ny, n.r, 0, Math.PI * 2);
                    tCtx.fillStyle = n.color;
                    tCtx.globalAlpha = pulse;
                    tCtx.fill();
                    tCtx.globalAlpha = 1;
                    // Label
                    tCtx.font = '7px "JetBrains Mono",monospace';
                    tCtx.fillStyle = 'rgba(153,170,208,0.7)';
                    tCtx.textAlign = 'center';
                    tCtx.fillText(n.label, nx, ny + n.r + 10);
                });
                requestAnimationFrame(drawTopo);
            }

            function hexToRgb(hex) {
                var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
                return r+','+g+','+b;
            }
            drawTopo();
        }, 500);

        // ── SIDEBAR EFFECTS ──
        var sbEffects = document.getElementById('hcc-sb-effects');
        if (sbEffects) {
            // Scan line
            var scanLine = document.createElement('div');
            scanLine.id = 'hcc-sb-scan';
            sbEffects.appendChild(scanLine);

            // Data rain
            var rainStyle = document.createElement('style');
            rainStyle.textContent = '@keyframes hccSbRainFall{0%{top:-20%}100%{top:120%}}';
            document.head.appendChild(rainStyle);
            var hexChars = '0123456789ABCDEF>|.:[]{}';
            for (var ri = 0; ri < 6; ri++) {
                var col = document.createElement('div');
                col.style.cssText = 'position:absolute;top:-100%;left:' + (3 + ri * 8) + 'px;font-family:var(--font-mono);font-size:8px;color:#00B7FF;line-height:10px;white-space:pre;writing-mode:vertical-lr;letter-spacing:2px;text-shadow:0 0 4px rgba(0,183,255,0.4);opacity:0.4;animation:hccSbRainFall ' + (15 + Math.random() * 20) + 's linear ' + (Math.random() * 10) + 's infinite;';
                var str = '';
                for (var rj = 0; rj < 60; rj++) str += hexChars[Math.floor(Math.random() * hexChars.length)];
                col.textContent = str;
                sbEffects.appendChild(col);
            }

            // Particles (neural network canvas)
            var canvas = document.createElement('canvas');
            canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;';
            sbEffects.appendChild(canvas);
            var ctx = canvas.getContext('2d');
            var sbParticles = [];
            var lastW = 0, lastH = 0;

            function sbResize() {
                var w = sidebar.offsetWidth;
                var h = sidebar.offsetHeight;
                if (w === lastW && h === lastH) return;
                var scaleX = lastW > 0 ? w / lastW : 1;
                canvas.width = w;
                canvas.height = h;
                if (scaleX !== 1 && lastW > 0) {
                    for (var si = 0; si < sbParticles.length; si++) {
                        sbParticles[si].x = Math.min(sbParticles[si].x * scaleX, w - 2);
                    }
                }
                lastW = w; lastH = h;
            }
            sbResize();
            window.addEventListener('resize', sbResize);

            for (var pi = 0; pi < 35; pi++) {
                sbParticles.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    vx: (Math.random() - 0.5) * 0.3,
                    vy: (Math.random() - 0.5) * 0.2,
                    r: Math.random() * 2 + 1,
                    pulse: Math.random() * Math.PI * 2
                });
            }

            function sbDraw() {
                sbResize();
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                for (var di = 0; di < sbParticles.length; di++) {
                    var dp = sbParticles[di];
                    dp.x += dp.vx; dp.y += dp.vy; dp.pulse += 0.02;
                    if (dp.x < 0 || dp.x > canvas.width) dp.vx *= -1;
                    if (dp.y < 0 || dp.y > canvas.height) dp.vy *= -1;
                    var glow = 0.6 + Math.sin(dp.pulse) * 0.3;
                    // Halo
                    ctx.beginPath(); ctx.arc(dp.x, dp.y, dp.r * 4, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,183,255,' + (glow * 0.06) + ')'; ctx.fill();
                    // Core
                    ctx.beginPath(); ctx.arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(0,220,255,' + glow + ')'; ctx.fill();
                    // Hot center
                    ctx.beginPath(); ctx.arc(dp.x, dp.y, dp.r * 0.3, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(200,245,255,' + glow + ')'; ctx.fill();
                    // Connections
                    for (var dj = di + 1; dj < sbParticles.length; dj++) {
                        var dp2 = sbParticles[dj];
                        var ddx = dp.x - dp2.x, ddy = dp.y - dp2.y;
                        var dist = Math.sqrt(ddx * ddx + ddy * ddy);
                        if (dist < 100) {
                            ctx.beginPath(); ctx.moveTo(dp.x, dp.y); ctx.lineTo(dp2.x, dp2.y);
                            ctx.strokeStyle = 'rgba(0,200,255,' + (0.5 * (1 - dist / 100)) + ')';
                            ctx.lineWidth = 1; ctx.stroke();
                        }
                    }
                }
                requestAnimationFrame(sbDraw);
            }
            sbDraw();
        }
    }

    function startDashboard() {
        initClock();
        initGrid();
        buildSidebar();
        // Core effects
        if (typeof addParticleField === 'function') addParticleField('particle-bg');
        if (typeof addDataRain === 'function') addDataRain();
        if (typeof addScanLine === 'function') addScanLine();
        if (typeof HCCAudio !== 'undefined') HCCAudio.init();
        document.querySelectorAll('.hcc-panel').forEach(function(p) { if(typeof addCornerBrackets==='function') addCornerBrackets(p); });
        // Pi-hole theme effects
        if (typeof addNeonPulse === 'function') addNeonPulse();
        if (typeof addCornerHUD === 'function') addCornerHUD();
        if (typeof addDataStreams === 'function') addDataStreams();
        if (typeof addEqualizerBars === 'function') addEqualizerBars();
        if (typeof addGlitchOnUpdate === 'function') addGlitchOnUpdate();
        // Delayed effects (need DOM content rendered first)
        setTimeout(function() {
            if (typeof addPulseRings === 'function') addPulseRings();
            if (typeof addRotatingArcs === 'function') addRotatingArcs();
        }, 3000);
        pollData();
        setInterval(pollData, 10000);
    }

    checkAuth();
})();
