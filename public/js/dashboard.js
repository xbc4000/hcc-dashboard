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
            doAudio(d.pihole, d.services);
            flashPanels();
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
                html += '<div class="service-row">';
                html += '<span style="color:var(--text-bright);">'+esc(c.client)+'</span>';
                html += '<span style="color:var(--purple);font-weight:700;">'+fmtNum(c.count)+'</span>';
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
            fw.topDrops.slice(0,5).forEach(function(d) {
                html += '<div class="domain-row"><span class="domain-name" style="color:var(--red);max-width:60%;">'+esc(d.comment)+'</span><span class="domain-count">'+fmtNum(d.packets)+' pkts</span></div>';
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
            p.style.borderColor = 'rgba(0,183,255,0.3)';
            setTimeout(function() { p.style.borderColor = ''; }, 300);
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

    function startDashboard() {
        initClock();
        initGrid();
        if (typeof addParticleField === 'function') addParticleField('particle-bg');
        if (typeof addDataRain === 'function') addDataRain();
        if (typeof addScanLine === 'function') addScanLine();
        if (typeof HCCAudio !== 'undefined') HCCAudio.init();
        document.querySelectorAll('.hcc-panel').forEach(function(p) { if(typeof addCornerBrackets==='function') addCornerBrackets(p); });
        pollData();
        setInterval(pollData, 10000);
    }

    checkAuth();
})();
