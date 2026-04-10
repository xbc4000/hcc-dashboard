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
            renderQueryMonitor(d.pihole);
            renderServers(d.prometheus);
            renderPer730(d.prometheus);
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
            if (typeof window._hccUpdateNetPopup === 'function') window._hccUpdateNetPopup(d.pihole);
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

    // ── PER730XD DEDICATED PAGE ──
    function renderPer730(promData) {
        var el = document.getElementById('per730-body');
        if (!el) return;
        if (!promData || !promData.servers || !promData.servers.per730xd) {
            el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>';
            return;
        }
        var s = promData.servers.per730xd;
        var hColor = s.health === 'OK' ? 'var(--green)' : 'var(--red)';
        var pp = s.powerCap ? (s.power / s.powerCap * 100) : 0;

        var html = '<div class="per730-grid">';

        // ── Hero card ──
        html += '<div class="per730-hero">';
        html += '<div class="per730-hero-left">';
        html += '<div class="status-dot-sm '+(s.status==='up'?'up':'down')+'" style="width:14px;height:14px;"></div>';
        html += '<div><div class="per730-name">'+esc(s.name)+'</div>';
        html += '<div class="per730-model">'+esc(s.model || 'Dell PowerEdge R730XD')+'</div>';
        if (s.serial) html += '<div class="per730-serial">SN: '+esc(s.serial)+'</div>';
        html += '</div></div>';
        html += '<div class="per730-hero-right">';
        html += '<div class="per730-health" style="color:'+hColor+';border-color:'+hColor+';text-shadow:0 0 12px '+hColor+';">'+esc(s.health)+'</div>';
        html += '<div class="per730-instance">'+esc(s.instance || '10.30.30.10')+'</div>';
        html += '</div></div>';

        // ── Top stat boxes ──
        html += '<div class="stat-grid stat-grid-4" style="margin-top:14px;">';
        html += statBox('POWER', (s.power||0)+'W', 'orange');
        html += statBox('TEMP', (s.temp!==null?s.temp+'°C':'---'), s.temp<35?'green':'orange');
        html += statBox('FAN AVG', s.fanSpeed?fmtNum(s.fanSpeed)+' RPM':'---', 'cyan');
        html += statBox('RAM', (s.totalRamGB||'--')+' GB', 'cyan');
        html += '</div>';

        // ── 2-column layout for sections ──
        html += '<div class="per730-cols">';

        // ── LEFT COLUMN ──
        html += '<div class="per730-col">';

        // POWER detail
        if (s.power !== null && s.power !== undefined) {
            html += '<div class="per730-section">';
            html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--orange);"></span>POWER CONSUMPTION</div>';
            html += '<div class="per730-power-row">';
            html += '<div class="per730-power-stat"><div class="per730-power-label">CURRENT</div><div class="per730-power-val" style="color:var(--orange);">'+(s.power||0)+'W</div></div>';
            if (s.powerAvg !== null) html += '<div class="per730-power-stat"><div class="per730-power-label">AVG</div><div class="per730-power-val" style="color:var(--gold);">'+s.powerAvg+'W</div></div>';
            if (s.powerMin !== null) html += '<div class="per730-power-stat"><div class="per730-power-label">MIN</div><div class="per730-power-val" style="color:var(--green);">'+s.powerMin+'W</div></div>';
            if (s.powerMax !== null) html += '<div class="per730-power-stat"><div class="per730-power-label">MAX</div><div class="per730-power-val" style="color:var(--red);">'+s.powerMax+'W</div></div>';
            if (s.powerCap !== null) html += '<div class="per730-power-stat"><div class="per730-power-label">CAP</div><div class="per730-power-val" style="color:var(--text-muted);">'+s.powerCap+'W</div></div>';
            html += '</div>';
            if (s.powerCap) {
                html += '<div class="progress-wrap" style="height:10px;margin-top:6px;"><div class="progress-fill '+lvl(pp)+'" style="width:'+pp+'%;"></div></div>';
                html += '<div style="text-align:right;font-size:0.75rem;color:var(--text-muted);margin-top:2px;">'+pp.toFixed(1)+'% of cap</div>';
            }
            html += '</div>';
        }

        // CPU detail
        html += '<div class="per730-section">';
        html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--cyan);"></span>CPU</div>';
        html += '<div class="per730-kv">';
        if (s.cpuCount !== null) html += row('Sockets', '<span style="color:var(--cyan-bright);">'+s.cpuCount+'</span>');
        if (s.cpuCores !== null) html += row('Cores', '<span style="color:var(--cyan-bright);">'+s.cpuCores+'</span>');
        if (s.cpuThreads !== null) html += row('Threads', '<span style="color:var(--cyan-bright);">'+s.cpuThreads+'</span>');
        html += '</div>';
        if (s.cpus && s.cpus.length > 0) {
            s.cpus.forEach(function(c) {
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(c.id)+'</span>';
                html += '<span class="per730-list-detail">'+esc(c.model || 'Unknown')+'</span>';
                html += '</div>';
            });
        }
        html += '</div>';

        // MEMORY detail
        html += '<div class="per730-section">';
        html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--cyan-bright);"></span>MEMORY</div>';
        if (s.dimms && s.dimms.length > 0) {
            html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">'+s.dimms.length+' DIMMs · '+s.totalRamGB+' GB total</div>';
            s.dimms.forEach(function(d) {
                var hc = d.healthy === false ? 'var(--red)' : 'var(--green)';
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(d.slot)+'</span>';
                html += '<span class="per730-list-detail">';
                if (d.capacityGB) html += '<span style="color:var(--text-bright);">'+d.capacityGB+'GB</span> ';
                if (d.speedMHz) html += '<span style="color:var(--text-muted);">'+d.speedMHz+'MHz</span> ';
                if (d.type) html += '<span style="color:var(--text-muted);">'+esc(d.type)+'</span> ';
                if (d.vendor) html += '<span style="color:var(--text-muted);">'+esc(d.vendor)+'</span>';
                html += '</span>';
                if (d.healthy !== null) html += '<span style="color:'+hc+';font-size:0.7rem;">●</span>';
                html += '</div>';
            });
        } else {
            html += '<div class="per730-kv">';
            html += row('Total', '<span style="color:var(--cyan-bright);">'+(s.totalRamGB||'--')+' GB</span>');
            html += '</div>';
        }
        html += '</div>';

        // POWER SUPPLIES
        html += '<div class="per730-section">';
        html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--orange);"></span>POWER SUPPLIES</div>';
        if (s.psus && s.psus.length > 0) {
            s.psus.forEach(function(p) {
                var hc = p.healthy ? 'var(--green)' : 'var(--red)';
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(p.name || p.id)+'</span>';
                html += '<span class="per730-list-detail">';
                if (p.voltage) html += '<span style="color:var(--orange);">'+p.voltage.toFixed(0)+'V</span>';
                html += '</span>';
                html += '<span style="color:'+hc+';font-size:0.7rem;">●</span>';
                html += '</div>';
            });
        } else {
            html += '<div class="per730-kv">';
            var pc = s.psuHealthy === s.psu ? 'var(--green)' : 'var(--red)';
            html += row('Status', '<span style="color:'+pc+';">'+s.psuHealthy+' / '+s.psu+' Healthy</span>');
            html += '</div>';
        }
        html += '</div>';

        html += '</div>'; // end LEFT col

        // ── RIGHT COLUMN ──
        html += '<div class="per730-col">';

        // STORAGE — drives
        html += '<div class="per730-section">';
        html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--purple);"></span>STORAGE DRIVES</div>';
        if (s.drivesDetail && s.drivesDetail.length > 0) {
            html += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">'+s.drivesDetail.length+' drives · '+s.drivesHealthy+' healthy</div>';
            s.drivesDetail.forEach(function(d) {
                var hc = d.healthy ? 'var(--green)' : 'var(--red)';
                var lifeColor = d.lifePercent>=80?'var(--green)':(d.lifePercent>=50?'var(--orange)':'var(--red)');
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(d.id)+'</span>';
                html += '<span class="per730-list-detail">';
                if (d.capacityGB) html += '<span style="color:var(--text-bright);">'+d.capacityGB+'GB</span> ';
                if (d.protocol) html += '<span style="color:var(--text-muted);">'+esc(d.protocol)+'</span> ';
                if (d.model) html += '<span style="color:var(--text-muted);">'+esc(d.model)+'</span>';
                if (d.lifePercent !== null) html += ' <span style="color:'+lifeColor+';">'+d.lifePercent+'%</span>';
                html += '</span>';
                html += '<span style="color:'+hc+';font-size:0.7rem;">●</span>';
                html += '</div>';
            });
        } else {
            var dc = s.drivesHealthy === s.drives ? 'var(--green)' : 'var(--red)';
            html += '<div class="per730-kv">';
            html += row('Status', '<span style="color:'+dc+';">'+s.drivesHealthy+' / '+s.drives+' Healthy</span>');
            html += '</div>';
        }
        html += '</div>';

        // RAID VOLUMES
        if (s.volumes && s.volumes.length > 0) {
            html += '<div class="per730-section">';
            html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--purple);"></span>RAID VOLUMES</div>';
            s.volumes.forEach(function(v) {
                var hc = v.healthy ? 'var(--green)' : 'var(--red)';
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(v.name || v.id)+'</span>';
                html += '<span class="per730-list-detail">';
                if (v.raid) html += '<span style="color:var(--purple);">'+esc(v.raid)+'</span> ';
                if (v.capacityGB) html += '<span style="color:var(--text-bright);">'+v.capacityGB+'GB</span> ';
                if (v.spans) html += '<span style="color:var(--text-muted);">'+v.spans+' spans</span>';
                html += '</span>';
                html += '<span style="color:'+hc+';font-size:0.7rem;">●</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // THERMAL — all sensors
        if (s.temps && s.temps.length > 0) {
            html += '<div class="per730-section">';
            html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--red);"></span>THERMAL SENSORS</div>';
            s.temps.forEach(function(t) {
                var tc = t.value < 35 ? 'var(--green)' : (t.value < 60 ? 'var(--orange)' : 'var(--red)');
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(t.name)+'</span>';
                html += '<span style="color:'+tc+';font-weight:700;">'+t.value.toFixed(0)+'°C</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // FANS
        if (s.fans && s.fans.length > 0) {
            html += '<div class="per730-section">';
            html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--cyan);"></span>FANS</div>';
            s.fans.forEach(function(f) {
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(f.name)+'</span>';
                html += '<span style="color:var(--cyan-bright);font-weight:700;">'+fmtNum(Math.round(f.rpm))+' RPM</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        // NETWORK PORTS
        if (s.nics && s.nics.length > 0) {
            html += '<div class="per730-section">';
            html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--green);"></span>NETWORK PORTS</div>';
            s.nics.forEach(function(n) {
                var lc = n.linkUp ? 'var(--green)' : 'var(--red)';
                html += '<div class="per730-list-item">';
                html += '<span class="per730-list-id">'+esc(n.name)+'</span>';
                html += '<span class="per730-list-detail">';
                if (n.speedMbps) html += '<span style="color:var(--text-bright);">'+n.speedMbps+' Mbps</span>';
                html += '</span>';
                html += '<span style="color:'+lc+';font-size:0.7rem;">●</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += '</div>'; // end RIGHT col
        html += '</div>'; // end cols

        // ── Quick actions ──
        html += '<div class="per730-section" style="margin-top:14px;">';
        html += '<div class="per730-section-title"><span class="per730-bullet" style="background:var(--cyan);"></span>QUICK ACTIONS</div>';
        html += '<div class="per730-actions">';
        html += '<a href="https://10.30.30.10" target="_blank" class="per730-action"><span class="per730-action-icon">⌘</span><span>iDRAC</span></a>';
        html += '<a href="https://10.30.30.10/restgui/start.html#/console" target="_blank" class="per730-action"><span class="per730-action-icon">▦</span><span>CONSOLE</span></a>';
        html += '<a href="https://10.30.30.10/restgui/start.html#/storage" target="_blank" class="per730-action"><span class="per730-action-icon">▤</span><span>STORAGE</span></a>';
        html += '<a href="https://10.30.30.10/restgui/start.html#/power" target="_blank" class="per730-action"><span class="per730-action-icon">⚡</span><span>POWER</span></a>';
        html += '</div></div>';

        html += '</div>'; // end grid
        el.innerHTML = html;
    }

    // ── CONTROL CENTER ──
    function renderControl() {
        var el = document.getElementById('control-body');
        if (!el || el.dataset.built === '1') return;
        el.dataset.built = '1';

        var html = '<div class="cc-grid">';

        // ── OBS WebSocket Controller ──
        html += '<div class="cc-card cc-obs">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:var(--cyan-bright);">◉</span><span class="cc-card-title">OBS STUDIO</span><span id="cc-obs-status" class="cc-card-status">DISCONNECTED</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row"><input type="text" id="cc-obs-host" placeholder="10.10.10.2:4455 (ws:// auto-added)" class="cc-input" /></div>';
        html += '<div class="cc-row"><input type="password" id="cc-obs-pass" placeholder="WebSocket password (blank if disabled)" class="cc-input" /></div>';
        html += '<div class="cc-row"><button id="cc-obs-connect" class="cc-btn">CONNECT</button><button id="cc-obs-disconnect" class="cc-btn cc-btn-warn">DISCONNECT</button></div>';
        html += '<div id="cc-obs-log" class="cc-log"></div>';
        html += '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;line-height:1.5;">';
        html += 'In OBS: <span style="color:var(--cyan);">Tools → WebSocket Server Settings</span><br/>';
        html += 'Enable, port 4455, set or clear password.';
        html += '</div>';
        html += '<div class="cc-divider"></div>';
        html += '<div class="obs-cols">';
        html += '<div class="obs-col"><div class="cc-section-label">SCENES</div>';
        html += '<div id="cc-obs-scenes" class="cc-scenes"><div class="cc-empty">Connect to load</div></div>';
        html += '</div>';
        html += '<div class="obs-col"><div class="cc-section-label">SOURCES</div>';
        html += '<div id="cc-obs-sources" class="cc-scenes"><div class="cc-empty">Select a scene</div></div>';
        html += '</div>';
        html += '</div>';
        html += '<div class="cc-divider"></div>';
        html += '<div class="cc-section-label">STREAM / RECORD / VIRTUAL CAM</div>';
        html += '<div class="cc-row">';
        html += '<button id="cc-obs-stream" class="cc-btn cc-btn-action">STREAM</button>';
        html += '<button id="cc-obs-record" class="cc-btn cc-btn-action">REC</button>';
        html += '<button id="cc-obs-vcam" class="cc-btn cc-btn-action">V-CAM</button>';
        html += '</div>';
        html += '<div class="cc-row">';
        html += '<div class="cc-stat"><span class="cc-stat-label">STREAM</span><span id="cc-obs-stream-status" class="cc-stat-val">OFFLINE</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">REC</span><span id="cc-obs-rec-status" class="cc-stat-val">OFFLINE</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">VCAM</span><span id="cc-obs-vcam-status" class="cc-stat-val">OFFLINE</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">FPS</span><span id="cc-obs-fps" class="cc-stat-val">--</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">CPU</span><span id="cc-obs-cpu" class="cc-stat-val">--</span></div>';
        html += '</div>';
        html += '</div></div>';

        // ── Spotify Remote ──
        html += '<div class="cc-card cc-spotify spotify-card">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:#1DB954;">♪</span><span class="cc-card-title">SPOTIFY CONNECT</span><span id="cc-spotify-status" class="cc-card-status">DISCONNECTED</span></div>';
        html += '<div class="cc-card-body">';
        // Setup view (shown until OAuth complete)
        html += '<div id="cc-spotify-setup">';
        html += '<div class="cc-row"><input type="text" id="cc-spotify-clientid" placeholder="Spotify Client ID" class="cc-input" /></div>';
        html += '<div class="cc-row"><button id="cc-spotify-connect" class="cc-btn">CONNECT TO SPOTIFY</button></div>';
        html += '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:8px;line-height:1.6;">';
        html += '<span style="color:var(--cyan);">[1]</span> Create app at <span style="color:var(--cyan);">developer.spotify.com/dashboard</span><br/>';
        html += '<span style="color:var(--cyan);">[2]</span> Add redirect URI <span style="color:var(--orange);">EXACTLY</span>:<br/>';
        html += '<span id="cc-spotify-redirect" style="color:var(--green);word-break:break-all;display:block;padding:4px 6px;background:rgba(0,0,0,0.4);border:1px solid var(--border);margin:4px 0;"></span>';
        html += '<span style="color:var(--cyan);">[3]</span> Spotify rejects HTTP except for <span style="color:var(--orange);">127.0.0.1</span>. If you see "redirect URIs are not valid", reach HCC via SSH tunnel:<br/>';
        html += '<code style="color:var(--green);background:rgba(0,0,0,0.4);padding:2px 4px;display:block;margin:4px 0;font-size:0.65rem;">ssh -L 3080:localhost:3080 dietpi@10.40.40.2</code>';
        html += 'Then open <span style="color:var(--cyan);">http://127.0.0.1:3080/</span> and connect.<br/>';
        html += '<span style="color:var(--cyan);">[4]</span> After auth, tokens are stored on the server — you can access HCC from any URL afterwards.';
        html += '</div>';
        html += '</div>';
        // Player view (shown when authenticated)
        html += '<div id="cc-spotify-player" style="display:none;">';
        html += '<div class="sp-now-playing">';
        html += '<div class="sp-art-wrap"><img id="cc-sp-art" class="sp-art" src="" alt=""/><div class="sp-art-overlay"></div></div>';
        html += '<div class="sp-meta">';
        html += '<div id="cc-sp-track" class="sp-track">---</div>';
        html += '<div id="cc-sp-artist" class="sp-artist">---</div>';
        html += '<div id="cc-sp-album" class="sp-album">---</div>';
        html += '</div>';
        html += '</div>';
        // Progress bar
        html += '<div class="sp-progress-row">';
        html += '<span id="cc-sp-time" class="sp-time">0:00</span>';
        html += '<div class="sp-progress-track" id="cc-sp-progress-track"><div id="cc-sp-progress-fill" class="sp-progress-fill"></div></div>';
        html += '<span id="cc-sp-duration" class="sp-time">0:00</span>';
        html += '</div>';
        // Controls
        html += '<div class="sp-controls">';
        html += '<button class="sp-ctrl" id="cc-sp-devices" title="Devices">⌃</button>';
        html += '<button class="sp-ctrl" id="cc-sp-shuffle" title="Shuffle">⇄</button>';
        html += '<button class="sp-ctrl" id="cc-sp-prev" title="Previous">⏮</button>';
        html += '<button class="sp-ctrl sp-ctrl-play" id="cc-sp-play" title="Play/Pause">⏵</button>';
        html += '<button class="sp-ctrl" id="cc-sp-next" title="Next">⏭</button>';
        html += '<button class="sp-ctrl" id="cc-sp-repeat" title="Repeat">⟳</button>';
        html += '</div>';
        // Visualizer
        html += '<div class="sp-visualizer" id="cc-sp-viz">';
        for (var vi = 0; vi < 24; vi++) html += '<div class="sp-viz-bar" style="animation-delay:-' + (vi * 0.1) + 's;"></div>';
        html += '</div>';
        // Volume
        html += '<div class="sp-volume-row">';
        html += '<span style="color:var(--text-muted);font-size:0.7rem;">VOL</span>';
        html += '<input type="range" min="0" max="100" value="50" id="cc-sp-volume" class="cc-slider" style="flex:1;" />';
        html += '<span id="cc-sp-volume-val" style="color:var(--text-bright);font-size:0.7rem;min-width:30px;text-align:right;">50</span>';
        html += '</div>';
        // Devices (hidden by default)
        html += '<div id="cc-sp-devices-list" class="sp-devices" style="display:none;"></div>';
        html += '<div class="cc-row" style="margin-top:8px;"><button id="cc-sp-logout" class="cc-btn cc-btn-warn" style="font-size:0.65rem;padding:4px 10px;">LOGOUT</button></div>';
        html += '</div>';
        html += '</div></div>';

        // ── HCC Spotify Bridge (librespot supervisor) ──
        html += '<div class="cc-card cc-spbridge">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:#1DB954;">⌬</span><span class="cc-card-title">SPOTIFY BRIDGE</span><span id="cc-spbr-status" class="cc-card-status">CHECKING</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row" style="gap:6px;">';
        html += '<div class="cc-stat"><span class="cc-stat-label">DEVICE</span><span id="cc-spbr-name" class="cc-stat-val">--</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">FORMAT</span><span id="cc-spbr-format" class="cc-stat-val">--</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">BITRATE</span><span id="cc-spbr-bitrate" class="cc-stat-val">--</span></div>';
        html += '</div>';
        html += '<div class="cc-row" style="gap:6px;">';
        html += '<div class="cc-stat"><span class="cc-stat-label">UPTIME</span><span id="cc-spbr-uptime" class="cc-stat-val">--</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">RESTARTS</span><span id="cc-spbr-restarts" class="cc-stat-val">0</span></div>';
        html += '<div class="cc-stat"><span class="cc-stat-label">EVENT</span><span id="cc-spbr-event" class="cc-stat-val">idle</span></div>';
        html += '</div>';
        html += '<div class="cc-divider"></div>';
        html += '<div class="cc-section-label">NOW STREAMING (LOCAL)</div>';
        html += '<div id="cc-spbr-now" class="cc-empty">Bridge idle — start playing on this device from any Spotify client</div>';
        html += '<div class="cc-divider"></div>';
        html += '<div class="cc-section-label">NAD CEC CONTROL <span id="cc-spbr-cec-status" style="color:var(--text-muted);font-weight:400;margin-left:8px;">checking...</span></div>';
        html += '<div class="cc-row" style="gap:6px;">';
        html += '<button id="cc-spbr-cec-down" class="cc-btn cc-btn-cec">VOL −</button>';
        html += '<button id="cc-spbr-cec-mute" class="cc-btn cc-btn-cec">MUTE</button>';
        html += '<button id="cc-spbr-cec-up" class="cc-btn cc-btn-cec">VOL +</button>';
        html += '</div>';
        html += '<div class="cc-row" style="gap:6px;">';
        html += '<button id="cc-spbr-cec-poweron" class="cc-btn">POWER ON</button>';
        html += '<button id="cc-spbr-cec-poweroff" class="cc-btn cc-btn-warn">STANDBY</button>';
        html += '</div>';
        html += '<div class="cc-divider"></div>';
        html += '<div class="cc-row">';
        html += '<input type="text" id="cc-spbr-url" placeholder="http://10.40.40.2:3081" class="cc-input" />';
        html += '</div>';
        html += '<div class="cc-row">';
        html += '<button id="cc-spbr-restart" class="cc-btn cc-btn-warn">RESTART LIBRESPOT</button>';
        html += '<button id="cc-spbr-refresh" class="cc-btn">REFRESH</button>';
        html += '</div>';
        html += '<div id="cc-spbr-log" class="cc-log"></div>';
        html += '</div></div>';

        // ── Govee Lights ──
        html += '<div class="cc-card cc-govee">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:#B986F2;">✦</span><span class="cc-card-title">GOVEE LIGHTS</span><span id="cc-govee-status" class="cc-card-status">NOT CONFIGURED</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row"><input type="password" id="cc-govee-key" placeholder="Govee API key" class="cc-input" /></div>';
        html += '<div class="cc-row"><button id="cc-govee-save" class="cc-btn">SAVE & LOAD DEVICES</button></div>';
        html += '<div id="cc-govee-devices" class="cc-devices"><div class="cc-empty">Enter API key to load devices</div></div>';
        html += '</div></div>';

        // ── Dell OpenManage / iDRAC quick links ──
        html += '<div class="cc-card cc-dell">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:var(--cyan);">▣</span><span class="cc-card-title">DELL OPENMANAGE</span><span class="cc-card-status">LINKS</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row"><a href="https://10.30.30.10" target="_blank" class="cc-btn cc-btn-link">PER730XD iDRAC</a></div>';
        html += '<div class="cc-row"><a href="https://10.30.30.11" target="_blank" class="cc-btn cc-btn-link">PER630 iDRAC</a></div>';
        html += '<div class="cc-row"><input type="text" id="cc-ome-url" placeholder="OpenManage Enterprise URL" class="cc-input" /></div>';
        html += '<div class="cc-row"><button id="cc-ome-save" class="cc-btn">SAVE OME LINK</button></div>';
        html += '</div></div>';

        // ── Home Assistant ──
        html += '<div class="cc-card cc-ha">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:#41BDF5;">⌂</span><span class="cc-card-title">HOME ASSISTANT</span><span id="cc-ha-status" class="cc-card-status">NOT CONFIGURED</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row"><input type="text" id="cc-ha-url" placeholder="http://homeassistant.local:8123" class="cc-input" /></div>';
        html += '<div class="cc-row"><input type="password" id="cc-ha-token" placeholder="Long-lived access token" class="cc-input" /></div>';
        html += '<div class="cc-row"><button id="cc-ha-save" class="cc-btn">SAVE & TEST</button></div>';
        html += '<div id="cc-ha-info" class="cc-empty">Enter HA URL + token to connect</div>';
        html += '</div></div>';

        // ── AMP Game Server ──
        html += '<div class="cc-card cc-amp">';
        html += '<div class="cc-card-header"><span class="cc-card-icon" style="color:var(--orange);">▲</span><span class="cc-card-title">AMP GAME PANEL</span><span class="cc-card-status">LINK</span></div>';
        html += '<div class="cc-card-body">';
        html += '<div class="cc-row"><a href="http://10.20.20.3:8080" target="_blank" class="cc-btn cc-btn-link">OPEN AMP</a></div>';
        html += '</div></div>';

        html += '</div>';
        el.innerHTML = html;

        initOBSController();
        initSpotifyEmbed();
        initSpotifyBridge();
        initGoveeController();
        initHAController();
        initOMELink();
    }

    // ── HCC SPOTIFY BRIDGE (librespot supervisor) ──
    var spbrPollTimer = null;
    function initSpotifyBridge() {
        var urlEl = document.getElementById('cc-spbr-url');
        var statusEl = document.getElementById('cc-spbr-status');
        var nameEl = document.getElementById('cc-spbr-name');
        var fmtEl = document.getElementById('cc-spbr-format');
        var brEl = document.getElementById('cc-spbr-bitrate');
        var upEl = document.getElementById('cc-spbr-uptime');
        var restEl = document.getElementById('cc-spbr-restarts');
        var evEl = document.getElementById('cc-spbr-event');
        var nowEl = document.getElementById('cc-spbr-now');
        var logEl = document.getElementById('cc-spbr-log');
        var restartBtn = document.getElementById('cc-spbr-restart');
        var refreshBtn = document.getElementById('cc-spbr-refresh');

        var saved = localStorage.getItem('hcc-spbr-url') || 'http://' + window.location.hostname + ':3081';
        urlEl.value = saved;

        function spbrLog(msg, type) {
            var ts = new Date().toLocaleTimeString();
            var color = type === 'err' ? 'var(--red)' : type === 'ok' ? 'var(--green)' : 'var(--text-muted)';
            var line = document.createElement('div');
            line.style.cssText = 'font-size:0.65rem;color:' + color + ';line-height:1.4;';
            line.textContent = '[' + ts + '] ' + msg;
            logEl.appendChild(line);
            while (logEl.children.length > 12) logEl.removeChild(logEl.firstChild);
            logEl.scrollTop = logEl.scrollHeight;
        }

        function fmtUptime(ms) {
            if (!ms) return '--';
            var s = Math.floor(ms / 1000);
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            s = s % 60;
            if (h > 0) return h + 'h ' + m + 'm';
            if (m > 0) return m + 'm ' + s + 's';
            return s + 's';
        }

        async function fetchStatus() {
            var url = urlEl.value.trim().replace(/\/$/, '');
            try {
                var res = await fetch(url + '/status', { signal: AbortSignal.timeout(4000) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var d = await res.json();
                statusEl.textContent = d.running ? 'RUNNING' : 'DOWN';
                statusEl.style.color = d.running ? '#1DB954' : 'var(--red)';
                if (d.opts) {
                    nameEl.textContent = d.opts.name || '--';
                    fmtEl.textContent = d.opts.format || '--';
                    brEl.textContent = (d.opts.bitrate || '--') + 'k';
                }
                upEl.textContent = fmtUptime(d.uptime_ms);
                restEl.textContent = d.totalRestarts || 0;
                if (d.state) {
                    evEl.textContent = d.state.event || 'idle';
                    if (d.state.track && d.state.artist) {
                        nowEl.innerHTML = '<div style="color:var(--text-bright);font-weight:700;font-size:0.85rem;">' + esc(d.state.track) + '</div>' +
                            '<div style="color:#1DB954;font-size:0.75rem;margin-top:2px;">' + esc(d.state.artist) + '</div>' +
                            (d.state.album ? '<div style="color:var(--text-muted);font-size:0.7rem;margin-top:1px;">' + esc(d.state.album) + '</div>' : '');
                    } else {
                        nowEl.innerHTML = '<div class="cc-empty" style="padding:8px 0;">Bridge idle — start playing on this device from any Spotify client</div>';
                    }
                }
                // CEC status
                var cecStatusEl = document.getElementById('cc-spbr-cec-status');
                if (cecStatusEl && d.cec) {
                    if (d.cec.ready) {
                        cecStatusEl.textContent = 'READY (LA' + d.cec.targetLA + ', ' + (d.cec.commandCount || 0) + ' cmds sent)';
                        cecStatusEl.style.color = 'var(--green)';
                    } else {
                        cecStatusEl.textContent = 'NOT READY';
                        cecStatusEl.style.color = 'var(--red)';
                    }
                }
                return true;
            } catch (e) {
                statusEl.textContent = 'UNREACHABLE';
                statusEl.style.color = 'var(--red)';
                evEl.textContent = '--';
                nowEl.innerHTML = '<div class="cc-empty" style="padding:8px 0;">Bridge not reachable at ' + esc(url) + '</div>';
                return false;
            }
        }

        async function fetchLogs() {
            var url = urlEl.value.trim().replace(/\/$/, '');
            try {
                var res = await fetch(url + '/logs?n=10', { signal: AbortSignal.timeout(4000) });
                if (!res.ok) return;
                var d = await res.json();
                if (!d.logs || !d.logs.length) return;
                logEl.innerHTML = '';
                d.logs.forEach(function (entry) {
                    var ts = new Date(entry.ts).toLocaleTimeString();
                    var color = entry.level === 'error' ? 'var(--red)' :
                                entry.level === 'warn' ? 'var(--orange)' :
                                entry.level === 'librespot' ? 'var(--cyan)' :
                                'var(--text-muted)';
                    var line = document.createElement('div');
                    line.style.cssText = 'font-size:0.65rem;color:' + color + ';line-height:1.4;';
                    line.textContent = '[' + ts + '] ' + entry.msg;
                    logEl.appendChild(line);
                });
                logEl.scrollTop = logEl.scrollHeight;
            } catch (e) {}
        }

        restartBtn.addEventListener('click', async function () {
            var url = urlEl.value.trim().replace(/\/$/, '');
            spbrLog('Restart requested...', 'info');
            try {
                var res = await fetch(url + '/restart', { method: 'POST', signal: AbortSignal.timeout(4000) });
                if (res.ok) spbrLog('Restart initiated', 'ok');
                else spbrLog('Restart failed: HTTP ' + res.status, 'err');
            } catch (e) { spbrLog('Restart error: ' + e.message, 'err'); }
            setTimeout(function () { fetchStatus(); fetchLogs(); }, 2500);
        });

        // ── CEC button handlers ──
        async function cecPost(path, label) {
            var url = urlEl.value.trim().replace(/\/$/, '');
            try {
                var res = await fetch(url + path, { method: 'POST', signal: AbortSignal.timeout(3000) });
                if (res.ok) spbrLog('CEC ' + label + ' OK', 'ok');
                else spbrLog('CEC ' + label + ' failed: HTTP ' + res.status, 'err');
            } catch (e) { spbrLog('CEC ' + label + ' error: ' + e.message, 'err'); }
        }
        document.getElementById('cc-spbr-cec-up').addEventListener('click', function () { cecPost('/cec/vol/up', 'vol+'); });
        document.getElementById('cc-spbr-cec-down').addEventListener('click', function () { cecPost('/cec/vol/down', 'vol−'); });
        document.getElementById('cc-spbr-cec-mute').addEventListener('click', function () { cecPost('/cec/mute', 'mute'); });
        document.getElementById('cc-spbr-cec-poweron').addEventListener('click', function () { cecPost('/cec/power/on', 'power on'); });
        document.getElementById('cc-spbr-cec-poweroff').addEventListener('click', function () { cecPost('/cec/power/off', 'standby'); });

        refreshBtn.addEventListener('click', function () {
            fetchStatus();
            fetchLogs();
        });

        urlEl.addEventListener('change', function () {
            localStorage.setItem('hcc-spbr-url', urlEl.value.trim());
            fetchStatus();
            fetchLogs();
        });

        // Initial + recurring
        fetchStatus();
        fetchLogs();
        if (spbrPollTimer) clearInterval(spbrPollTimer);
        spbrPollTimer = setInterval(function () {
            fetchStatus();
        }, 5000);
    }

    // ── OBS WEBSOCKET CONTROLLER ──
    var obsWs = null, obsMsgId = 1, obsCallbacks = {};
    function obsRequest(type, data) {
        return new Promise(function(resolve, reject) {
            if (!obsWs || obsWs.readyState !== 1) return reject('not connected');
            var id = String(obsMsgId++);
            obsCallbacks[id] = resolve;
            obsWs.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
            setTimeout(function() {
                if (obsCallbacks[id]) { delete obsCallbacks[id]; reject('timeout'); }
            }, 5000);
        });
    }

    function obsLog(msg, type) {
        var logEl = document.getElementById('cc-obs-log');
        if (!logEl) return;
        var ts = new Date().toLocaleTimeString();
        var color = type === 'err' ? 'var(--red)' : type === 'ok' ? 'var(--green)' : type === 'warn' ? 'var(--orange)' : 'var(--text-muted)';
        var line = document.createElement('div');
        line.style.cssText = 'font-size:0.65rem;color:' + color + ';line-height:1.4;';
        line.textContent = '[' + ts + '] ' + msg;
        logEl.appendChild(line);
        // Keep only last 12 lines
        while (logEl.children.length > 12) logEl.removeChild(logEl.firstChild);
        logEl.scrollTop = logEl.scrollHeight;
    }

    function initOBSController() {
        var hostEl = document.getElementById('cc-obs-host');
        var passEl = document.getElementById('cc-obs-pass');
        var statusEl = document.getElementById('cc-obs-status');
        var connectBtn = document.getElementById('cc-obs-connect');
        var disconnectBtn = document.getElementById('cc-obs-disconnect');
        var scenesEl = document.getElementById('cc-obs-scenes');
        var sourcesEl = document.getElementById('cc-obs-sources');
        var streamBtn = document.getElementById('cc-obs-stream');
        var recBtn = document.getElementById('cc-obs-record');
        var vcamBtn = document.getElementById('cc-obs-vcam');
        var statusInterval = null;
        var currentSceneName = null;

        // Restore saved settings
        try {
            var saved = JSON.parse(localStorage.getItem('hcc-obs') || '{}');
            if (saved.host) hostEl.value = saved.host;
            if (saved.pass) passEl.value = saved.pass;
        } catch(e) {}

        connectBtn.addEventListener('click', function() {
            var raw = hostEl.value.trim();
            var pass = passEl.value;
            if (!raw) { obsLog('Enter a host first', 'warn'); return; }

            // Auto-prefix ws:// and default port :4455
            var host = raw;
            if (!/^wss?:\/\//.test(host)) host = 'ws://' + host;
            if (!/:\d+/.test(host.replace(/^wss?:\/\//, ''))) host = host + ':4455';
            obsLog('Connecting to ' + host, 'info');

            localStorage.setItem('hcc-obs', JSON.stringify({ host: raw, pass: pass }));

            // Close any existing connection
            if (obsWs) {
                try { obsWs.close(); } catch(e) {}
                obsWs = null;
            }
            if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }

            try {
                obsWs = new WebSocket(host);
            } catch(e) {
                obsLog('Invalid URL: ' + e.message, 'err');
                statusEl.textContent = 'INVALID URL';
                statusEl.style.color = 'var(--red)';
                return;
            }
            statusEl.textContent = 'CONNECTING...';
            statusEl.style.color = 'var(--orange)';

            obsWs.onopen = function() {
                obsLog('Socket open, waiting for Hello...', 'ok');
                statusEl.textContent = 'WAIT HELLO';
            };
            obsWs.onerror = function(ev) {
                obsLog('WebSocket error — host unreachable, port closed, or wrong URL', 'err');
                statusEl.textContent = 'ERROR';
                statusEl.style.color = 'var(--red)';
            };
            obsWs.onclose = function(ev) {
                var reason = '';
                if (ev.code === 4009) reason = ' (auth failed — wrong password)';
                else if (ev.code === 4008) reason = ' (auth required but no password sent)';
                else if (ev.code === 1006) reason = ' (abnormal close — usually unreachable)';
                else if (ev.code === 1000) reason = ' (normal close)';
                obsLog('Closed: code=' + ev.code + reason, ev.code === 1000 ? 'info' : 'err');
                statusEl.textContent = 'DISCONNECTED';
                statusEl.style.color = 'var(--text-muted)';
                if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
            };

            obsWs.onmessage = async function(ev) {
                var msg;
                try { msg = JSON.parse(ev.data); } catch(e) { obsLog('Bad JSON from server', 'err'); return; }

                // Hello (op 0) → Identify (op 1)
                if (msg.op === 0) {
                    obsLog('Hello received (rpcVersion ' + msg.d.rpcVersion + ')', 'info');
                    var identifyData = { rpcVersion: 1, eventSubscriptions: 69 };
                    if (msg.d.authentication) {
                        if (!pass) {
                            obsLog('Server requires password but none provided', 'err');
                            statusEl.textContent = 'PASSWORD REQ';
                            statusEl.style.color = 'var(--red)';
                            obsWs.close();
                            return;
                        }
                        try {
                            // Use server-side SHA-256 (crypto.subtle is unavailable on HTTP)
                            async function sha256B64(input) {
                                var r = await fetch('/api/sha256-base64', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ input: input })
                                });
                                if (!r.ok) throw new Error('SHA-256 helper returned ' + r.status);
                                return (await r.json()).hash;
                            }
                            var b64a = await sha256B64(pass + msg.d.authentication.salt);
                            identifyData.authentication = await sha256B64(b64a + msg.d.authentication.challenge);
                            obsLog('Sending Identify with auth', 'info');
                        } catch(e) {
                            obsLog('Auth hash error: ' + e.message, 'err');
                            return;
                        }
                    } else {
                        obsLog('No auth required, sending Identify', 'info');
                    }
                    obsWs.send(JSON.stringify({ op: 1, d: identifyData }));
                }
                // Identified (op 2)
                if (msg.op === 2) {
                    obsLog('Identified — connected', 'ok');
                    statusEl.textContent = 'CONNECTED';
                    statusEl.style.color = 'var(--green)';
                    loadOBSScenes();
                    loadOBSStatus();
                    statusInterval = setInterval(loadOBSStatus, 2000);
                }
                // Response (op 7)
                if (msg.op === 7 && obsCallbacks[msg.d.requestId]) {
                    if (msg.d.requestStatus && !msg.d.requestStatus.result) {
                        obsLog('Request failed: ' + msg.d.requestStatus.comment, 'err');
                    }
                    obsCallbacks[msg.d.requestId](msg.d.responseData);
                    delete obsCallbacks[msg.d.requestId];
                }
                // Event (op 5)
                if (msg.op === 5) {
                    var ev = msg.d.eventType;
                    if (ev === 'CurrentProgramSceneChanged') loadOBSScenes();
                    if (ev === 'SceneItemEnableStateChanged' && currentSceneName) loadOBSSources(currentSceneName);
                    if (ev === 'StreamStateChanged' || ev === 'RecordStateChanged' || ev === 'VirtualcamStateChanged') loadOBSStatus();
                }
            };
        });

        disconnectBtn.addEventListener('click', function() {
            if (obsWs) { obsWs.close(); obsLog('Manually disconnected', 'info'); }
            obsWs = null;
            if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
        });

        async function loadOBSScenes() {
            try {
                var scenes = await obsRequest('GetSceneList');
                currentSceneName = scenes.currentProgramSceneName;
                scenesEl.innerHTML = '';
                scenes.scenes.reverse().forEach(function(sc) {
                    var btn = document.createElement('button');
                    btn.className = 'cc-scene-btn' + (sc.sceneName === currentSceneName ? ' active' : '');
                    btn.textContent = sc.sceneName;
                    btn.addEventListener('click', async function() {
                        await obsRequest('SetCurrentProgramScene', { sceneName: sc.sceneName });
                        currentSceneName = sc.sceneName;
                        loadOBSSources(sc.sceneName);
                    });
                    scenesEl.appendChild(btn);
                });
                if (currentSceneName) loadOBSSources(currentSceneName);
            } catch(e) { scenesEl.innerHTML = '<div class="cc-empty">No scenes</div>'; }
        }

        async function loadOBSSources(sceneName) {
            try {
                var data = await obsRequest('GetSceneItemList', { sceneName: sceneName });
                if (!data || !data.sceneItems) { sourcesEl.innerHTML = '<div class="cc-empty">No sources</div>'; return; }
                sourcesEl.innerHTML = '';
                data.sceneItems.forEach(function(item) {
                    var btn = document.createElement('button');
                    btn.className = 'cc-scene-btn' + (item.sceneItemEnabled ? ' active' : '');
                    btn.textContent = item.sourceName;
                    btn.title = (item.sceneItemEnabled ? 'Visible — click to hide' : 'Hidden — click to show');
                    btn.addEventListener('click', async function() {
                        var newState = !item.sceneItemEnabled;
                        await obsRequest('SetSceneItemEnabled', {
                            sceneName: sceneName,
                            sceneItemId: item.sceneItemId,
                            sceneItemEnabled: newState
                        });
                        item.sceneItemEnabled = newState;
                        btn.classList.toggle('active', newState);
                        btn.title = (newState ? 'Visible — click to hide' : 'Hidden — click to show');
                    });
                    sourcesEl.appendChild(btn);
                });
                if (data.sceneItems.length === 0) sourcesEl.innerHTML = '<div class="cc-empty">No sources</div>';
            } catch(e) { sourcesEl.innerHTML = '<div class="cc-empty">Error</div>'; }
        }

        async function loadOBSStatus() {
            try {
                var stream = await obsRequest('GetStreamStatus');
                var rec = await obsRequest('GetRecordStatus');
                var vcam = await obsRequest('GetVirtualCamStatus').catch(function() { return null; });
                var stats = await obsRequest('GetStats');
                document.getElementById('cc-obs-stream-status').textContent = stream.outputActive ? 'LIVE' : 'OFFLINE';
                document.getElementById('cc-obs-stream-status').style.color = stream.outputActive ? 'var(--red)' : 'var(--text-muted)';
                document.getElementById('cc-obs-rec-status').textContent = rec.outputActive ? 'REC' : 'OFFLINE';
                document.getElementById('cc-obs-rec-status').style.color = rec.outputActive ? 'var(--red)' : 'var(--text-muted)';
                if (vcam) {
                    document.getElementById('cc-obs-vcam-status').textContent = vcam.outputActive ? 'ACTIVE' : 'OFFLINE';
                    document.getElementById('cc-obs-vcam-status').style.color = vcam.outputActive ? '#1DB954' : 'var(--text-muted)';
                    vcamBtn.textContent = vcam.outputActive ? 'STOP V-CAM' : 'V-CAM';
                    vcamBtn.classList.toggle('active', vcam.outputActive);
                }
                document.getElementById('cc-obs-fps').textContent = stats.activeFps ? stats.activeFps.toFixed(1) : '--';
                document.getElementById('cc-obs-cpu').textContent = stats.cpuUsage ? stats.cpuUsage.toFixed(1) + '%' : '--';
                streamBtn.textContent = stream.outputActive ? 'STOP STREAM' : 'STREAM';
                streamBtn.classList.toggle('active', stream.outputActive);
                recBtn.textContent = rec.outputActive ? 'STOP REC' : 'REC';
                recBtn.classList.toggle('active', rec.outputActive);
            } catch(e) {}
        }

        streamBtn.addEventListener('click', function() { obsRequest('ToggleStream'); });
        recBtn.addEventListener('click', function() { obsRequest('ToggleRecord'); });
        vcamBtn.addEventListener('click', function() { obsRequest('ToggleVirtualCam'); });
    }

    // ── SPOTIFY REMOTE CONTROLLER (server-proxied) ──
    var spState = { connected: false, clientId: null, pollTimer: null };

    async function spApi(method, path, body) {
        // Strip leading / and call our backend proxy
        var clean = path.replace(/^\//, '');
        try {
            var opts = { method: method, headers: {} };
            if (body) {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
            var res = await fetch('/spotify/api/' + clean, opts);
            if (res.status === 401) {
                spState.connected = false;
                spShowSetup();
                return null;
            }
            if (res.status === 204) return {};
            if (!res.ok) return null;
            return await res.json();
        } catch(e) { return null; }
    }

    function spFmtTime(ms) {
        var s = Math.floor(ms / 1000);
        var m = Math.floor(s / 60);
        s = s % 60;
        return m + ':' + String(s).padStart(2, '0');
    }

    function spShowPlayer() {
        document.getElementById('cc-spotify-setup').style.display = 'none';
        document.getElementById('cc-spotify-player').style.display = '';
    }
    function spShowSetup() {
        document.getElementById('cc-spotify-setup').style.display = '';
        document.getElementById('cc-spotify-player').style.display = 'none';
    }

    var spPlaying = false;
    async function spPoll() {
        var data = await spApi('GET', '/me/player');
        var statusEl = document.getElementById('cc-spotify-status');
        if (!data || !data.item) {
            if (statusEl) { statusEl.textContent = 'IDLE'; statusEl.style.color = 'var(--text-muted)'; }
            return;
        }
        if (statusEl) { statusEl.textContent = data.is_playing ? 'PLAYING' : 'PAUSED'; statusEl.style.color = data.is_playing ? '#1DB954' : 'var(--text-muted)'; }
        spPlaying = data.is_playing;

        var item = data.item;
        document.getElementById('cc-sp-track').textContent = item.name || '---';
        document.getElementById('cc-sp-artist').textContent = (item.artists || []).map(function(a) { return a.name; }).join(', ');
        document.getElementById('cc-sp-album').textContent = item.album ? item.album.name : '';
        if (item.album && item.album.images && item.album.images[0]) {
            var artEl = document.getElementById('cc-sp-art');
            if (artEl.src !== item.album.images[0].url) artEl.src = item.album.images[0].url;
        }
        // Progress
        var progressMs = data.progress_ms || 0;
        var durationMs = item.duration_ms || 1;
        document.getElementById('cc-sp-time').textContent = spFmtTime(progressMs);
        document.getElementById('cc-sp-duration').textContent = '-' + spFmtTime(durationMs - progressMs);
        document.getElementById('cc-sp-progress-fill').style.width = (progressMs / durationMs * 100) + '%';
        // Play button
        document.getElementById('cc-sp-play').textContent = data.is_playing ? '⏸' : '⏵';
        // Volume
        if (data.device && data.device.volume_percent !== undefined) {
            var v = data.device.volume_percent;
            document.getElementById('cc-sp-volume').value = v;
            document.getElementById('cc-sp-volume-val').textContent = v;
        }
        // Visualizer state
        document.getElementById('cc-sp-viz').classList.toggle('playing', data.is_playing);
        // Shuffle/Repeat highlight
        document.getElementById('cc-sp-shuffle').classList.toggle('active', !!data.shuffle_state);
        document.getElementById('cc-sp-repeat').classList.toggle('active', data.repeat_state && data.repeat_state !== 'off');
    }

    async function spLoadDevices() {
        var listEl = document.getElementById('cc-sp-devices-list');
        listEl.innerHTML = '<div class="cc-empty">Loading...</div>';
        var data = await spApi('GET', '/me/player/devices');
        if (!data || !data.devices) { listEl.innerHTML = '<div class="cc-empty">No devices</div>'; return; }
        listEl.innerHTML = '';
        data.devices.forEach(function(dev) {
            var item = document.createElement('div');
            item.className = 'sp-device' + (dev.is_active ? ' active' : '');
            var icon = dev.type === 'Computer' ? '▣' : dev.type === 'Smartphone' ? '▢' : dev.type === 'Speaker' ? '◈' : '◯';
            item.innerHTML = '<span class="sp-device-icon">' + icon + '</span><span class="sp-device-name">' + esc(dev.name) + '</span><span class="sp-device-type">' + esc(dev.type) + '</span>';
            item.addEventListener('click', async function() {
                await spApi('PUT', '/me/player', { device_ids: [dev.id], play: spPlaying });
                setTimeout(function() { spPoll(); spLoadDevices(); }, 500);
            });
            listEl.appendChild(item);
        });
    }

    async function initSpotifyEmbed() {
        // Show the proper redirect URI for the user to register in Spotify dashboard
        var redirEl = document.getElementById('cc-spotify-redirect');
        if (redirEl) redirEl.textContent = window.location.origin + '/spotify/callback';

        // Check backend status — does it have valid tokens already?
        try {
            var res = await fetch('/spotify/status');
            var data = await res.json();
            spState.connected = !!data.connected;
            spState.clientId = data.clientId || null;
        } catch(e) {}

        if (spState.connected) {
            spShowPlayer();
            spPoll();
            spState.pollTimer = setInterval(spPoll, 3000);
        }

        // Setup view
        var clientIdInput = document.getElementById('cc-spotify-clientid');
        if (spState.clientId) clientIdInput.value = spState.clientId;
        // Persist client ID locally for convenience
        try {
            var savedCid = localStorage.getItem('hcc-spotify-clientid');
            if (savedCid && !clientIdInput.value) clientIdInput.value = savedCid;
        } catch(e) {}

        document.getElementById('cc-spotify-connect').addEventListener('click', function() {
            var cid = clientIdInput.value.trim();
            if (!cid) return;
            try { localStorage.setItem('hcc-spotify-clientid', cid); } catch(e) {}
            // Hand off to backend OAuth
            window.location.href = '/spotify/login?client_id=' + encodeURIComponent(cid);
        });

        // Player controls
        document.getElementById('cc-sp-play').addEventListener('click', async function() {
            await spApi('PUT', spPlaying ? '/me/player/pause' : '/me/player/play');
            setTimeout(spPoll, 300);
        });
        document.getElementById('cc-sp-prev').addEventListener('click', async function() {
            await spApi('POST', '/me/player/previous');
            setTimeout(spPoll, 500);
        });
        document.getElementById('cc-sp-next').addEventListener('click', async function() {
            await spApi('POST', '/me/player/next');
            setTimeout(spPoll, 500);
        });
        document.getElementById('cc-sp-shuffle').addEventListener('click', async function() {
            var btn = this;
            var newState = !btn.classList.contains('active');
            await spApi('PUT', '/me/player/shuffle?state=' + newState);
            setTimeout(spPoll, 300);
        });
        document.getElementById('cc-sp-repeat').addEventListener('click', async function() {
            // Cycle: off → context → track → off
            var data = await spApi('GET', '/me/player');
            var cur = (data && data.repeat_state) || 'off';
            var next = cur === 'off' ? 'context' : cur === 'context' ? 'track' : 'off';
            await spApi('PUT', '/me/player/repeat?state=' + next);
            setTimeout(spPoll, 300);
        });
        document.getElementById('cc-sp-volume').addEventListener('input', function() {
            document.getElementById('cc-sp-volume-val').textContent = this.value;
        });
        document.getElementById('cc-sp-volume').addEventListener('change', async function() {
            await spApi('PUT', '/me/player/volume?volume_percent=' + this.value);
        });
        // Seek on progress bar click
        document.getElementById('cc-sp-progress-track').addEventListener('click', async function(e) {
            var rect = this.getBoundingClientRect();
            var pct = (e.clientX - rect.left) / rect.width;
            var data = await spApi('GET', '/me/player');
            if (data && data.item) {
                var seekMs = Math.floor(data.item.duration_ms * pct);
                await spApi('PUT', '/me/player/seek?position_ms=' + seekMs);
                setTimeout(spPoll, 300);
            }
        });
        // Devices toggle
        document.getElementById('cc-sp-devices').addEventListener('click', function() {
            var listEl = document.getElementById('cc-sp-devices-list');
            if (listEl.style.display === 'none') {
                listEl.style.display = '';
                spLoadDevices();
            } else {
                listEl.style.display = 'none';
            }
        });
        // Logout — clear server-side tokens
        document.getElementById('cc-sp-logout').addEventListener('click', async function() {
            if (spState.pollTimer) { clearInterval(spState.pollTimer); spState.pollTimer = null; }
            try { await fetch('/spotify/logout', { method: 'POST' }); } catch(e) {}
            spState.connected = false;
            spShowSetup();
        });
    }

    // ── GOVEE CONTROLLER ──
    function initGoveeController() {
        var keyEl = document.getElementById('cc-govee-key');
        var saveBtn = document.getElementById('cc-govee-save');
        var statusEl = document.getElementById('cc-govee-status');
        var devicesEl = document.getElementById('cc-govee-devices');

        var saved = localStorage.getItem('hcc-govee-key');
        if (saved) { keyEl.value = saved; loadDevices(saved); }

        async function loadDevices(key) {
            statusEl.textContent = 'LOADING...';
            statusEl.style.color = 'var(--orange)';
            try {
                var res = await fetch('https://developer-api.govee.com/v1/devices', {
                    headers: { 'Govee-API-Key': key }
                });
                if (!res.ok) throw new Error('API error ' + res.status);
                var data = await res.json();
                var devices = (data.data && data.data.devices) || [];
                statusEl.textContent = devices.length + ' DEVICES';
                statusEl.style.color = 'var(--green)';
                devicesEl.innerHTML = '';
                devices.forEach(function(d) {
                    var card = document.createElement('div');
                    card.className = 'cc-device';
                    card.innerHTML = '<div class="cc-device-name">' + esc(d.deviceName) + '</div>' +
                        '<div class="cc-device-controls">' +
                        '<button class="cc-btn-mini" data-act="on">ON</button>' +
                        '<button class="cc-btn-mini" data-act="off">OFF</button>' +
                        '<input type="range" min="1" max="100" value="50" class="cc-slider" />' +
                        '</div>';
                    var controls = card.querySelectorAll('button');
                    controls.forEach(function(b) {
                        b.addEventListener('click', function() {
                            controlGovee(key, d, { name: 'turn', value: b.dataset.act });
                        });
                    });
                    var slider = card.querySelector('.cc-slider');
                    slider.addEventListener('change', function() {
                        controlGovee(key, d, { name: 'brightness', value: parseInt(slider.value) });
                    });
                    devicesEl.appendChild(card);
                });
                if (devices.length === 0) devicesEl.innerHTML = '<div class="cc-empty">No devices found</div>';
            } catch(e) {
                statusEl.textContent = 'ERROR';
                statusEl.style.color = 'var(--red)';
                devicesEl.innerHTML = '<div class="cc-empty">' + e.message + '</div>';
            }
        }

        function controlGovee(key, device, cmd) {
            fetch('https://developer-api.govee.com/v1/devices/control', {
                method: 'PUT',
                headers: { 'Govee-API-Key': key, 'Content-Type': 'application/json' },
                body: JSON.stringify({ device: device.device, model: device.model, cmd: cmd })
            }).catch(function() {});
        }

        saveBtn.addEventListener('click', function() {
            var k = keyEl.value.trim();
            if (!k) return;
            localStorage.setItem('hcc-govee-key', k);
            loadDevices(k);
        });
    }

    // ── HOME ASSISTANT ──
    function initHAController() {
        var urlEl = document.getElementById('cc-ha-url');
        var tokEl = document.getElementById('cc-ha-token');
        var saveBtn = document.getElementById('cc-ha-save');
        var statusEl = document.getElementById('cc-ha-status');
        var infoEl = document.getElementById('cc-ha-info');

        var saved = JSON.parse(localStorage.getItem('hcc-ha') || '{}');
        if (saved.url) urlEl.value = saved.url;
        if (saved.token) tokEl.value = saved.token;
        if (saved.url && saved.token) testConnection(saved.url, saved.token);

        async function testConnection(url, token) {
            statusEl.textContent = 'TESTING...';
            statusEl.style.color = 'var(--orange)';
            try {
                var res = await fetch(url.replace(/\/$/, '') + '/api/', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                var data = await res.json();
                statusEl.textContent = 'CONNECTED';
                statusEl.style.color = 'var(--green)';
                infoEl.innerHTML = '<div style="font-size:0.75rem;color:var(--text-muted);">' + esc(data.message || 'OK') + '</div>' +
                    '<div style="margin-top:6px;"><a href="' + esc(url) + '" target="_blank" class="cc-btn cc-btn-link">OPEN HA UI</a></div>';
            } catch(e) {
                statusEl.textContent = 'ERROR';
                statusEl.style.color = 'var(--red)';
                infoEl.innerHTML = '<div class="cc-empty">' + e.message + '</div>';
            }
        }

        saveBtn.addEventListener('click', function() {
            var u = urlEl.value.trim();
            var t = tokEl.value.trim();
            if (!u || !t) return;
            localStorage.setItem('hcc-ha', JSON.stringify({ url: u, token: t }));
            testConnection(u, t);
        });
    }

    // ── OME LINK ──
    function initOMELink() {
        var urlEl = document.getElementById('cc-ome-url');
        var saveBtn = document.getElementById('cc-ome-save');
        var saved = localStorage.getItem('hcc-ome-url');
        if (saved) urlEl.value = saved;
        saveBtn.addEventListener('click', function() {
            var u = urlEl.value.trim();
            if (!u) return;
            localStorage.setItem('hcc-ome-url', u);
            window.open(u, '_blank');
        });
    }

    // ── DNS QUERY MONITOR ──
    function renderQueryMonitor(pihole) {
        var el = document.getElementById('qmonitor-body');
        if (!el) return;
        if (!pihole) { el.innerHTML = '<div class="panel-loading">AWAITING DATA...</div>'; return; }

        var entries = [];
        // Mix top blocked + top queries
        if (pihole.topBlocked) pihole.topBlocked.forEach(function(d) {
            entries.push({ domain: d.domain, count: d.count, type: 'BLOCK' });
        });
        if (pihole.topQueries) pihole.topQueries.forEach(function(d) {
            entries.push({ domain: d.domain, count: d.count, type: 'PERMIT' });
        });
        // Shuffle and limit
        entries.sort(function() { return Math.random() - 0.5; });
        entries = entries.slice(0, 16);

        if (entries.length === 0) { el.innerHTML = '<div class="panel-loading">NO DATA</div>'; return; }

        var html = '<div class="qm-feed">';
        var now = new Date();
        entries.forEach(function(e, idx) {
            var fakeSec = (now.getSeconds() - idx * 4 + 60) % 60;
            var fakeMin = (now.getMinutes() - Math.floor(idx / 15) + 60) % 60;
            var timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(fakeMin).padStart(2,'0') + ':' + String(fakeSec).padStart(2,'0');
            html += '<div class="qm-line">';
            html += '<span class="qm-time">' + timeStr + '</span>';
            html += '<span class="qm-badge qm-' + e.type.toLowerCase() + '">' + e.type + '</span>';
            html += '<span class="qm-domain">' + esc(e.domain) + '</span>';
            html += '<span class="qm-count">' + fmtNum(e.count) + '</span>';
            html += '</div>';
        });
        html += '</div>';
        el.innerHTML = html;
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
        var parts = [];
        // Lead with blocked domains if we have them
        if (pihole.topBlocked && pihole.topBlocked.length > 0) {
            pihole.topBlocked.forEach(function(d) {
                parts.push(d.domain + ' (' + fmtNum(d.count) + ')');
            });
        }
        // Append summary stats at the end
        parts.push('QUERIES: ' + fmtNum(pihole.totalQueries));
        parts.push('BLOCKED: ' + fmtNum(pihole.blockedQueries));
        parts.push('BLOCK RATE: ' + (pihole.percentBlocked||0).toFixed(1) + '%');
        parts.push('GRAVITY: ' + fmtNum(pihole.gravitySize));
        var text = parts.join('  ◆  ');
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
        { id: 'servers',  icon: 'SV', label: 'SERVERS',    color: '#ff6600' },
        { id: 'per730',   icon: 'P7', label: 'PER730XD',   color: '#00B7FF' },
        { id: 'firewall', icon: 'FW', label: 'FIREWALL',   color: '#ff2244' },
        { id: 'network',  icon: 'NW', label: 'NETWORK',    color: '#B986F2' },
        { id: 'router',   icon: 'RT', label: 'ROUTER',     color: '#FFD700' },
        { id: 'monitor',  icon: 'MO', label: 'MONITOR',    color: '#FF00B2' },
        { id: 'control',  icon: 'CC', label: 'CONTROL',    color: '#00FFCC' }
    ];

    var currentPage = 'home';
    var homeLayoutSaved = null;

    // Dedicated page layouts: panels get resized for full-page view
    var PAGE_LAYOUTS = {
        pihole:   [{ id: 'pihole', w: 12, h: 10 }],
        servers:  [{ id: 'servers', w: 12, h: 10 }],
        per730:   [{ id: 'per730', w: 12, h: 12 }],
        firewall: [{ id: 'firewall', w: 6, h: 8 }, { id: 'netwatch', w: 6, h: 8 }],
        network:  [{ id: 'bandwidth', w: 6, h: 6 }, { id: 'dhcp', w: 6, h: 6 }],
        router:   [{ id: 'router', w: 5, h: 6 }, { id: 'logs', w: 7, h: 6 }],
        monitor:  [{ id: 'overview', w: 4, h: 5 }, { id: 'targets', w: 4, h: 5 }, { id: 'netwatch', w: 4, h: 5 }],
        control:  [{ id: 'control', w: 12, h: 12 }]
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

    function buildNetworkPopup() {
        if (document.getElementById('hcc-net-popout')) return;

        // Add styles
        if (!document.getElementById('hcc-net-style')) {
            var ns = document.createElement('style');
            ns.id = 'hcc-net-style';
            ns.textContent = [
                '@keyframes hccNetNodePulse{0%,100%{opacity:0.7;box-shadow:0 0 4px currentColor}50%{opacity:1;box-shadow:0 0 8px currentColor,0 0 16px currentColor}}',
                '@keyframes hccNetHdrScan{0%{left:-30%}100%{left:100%}}',
                '#hcc-net-popout::-webkit-scrollbar{width:4px}',
                '#hcc-net-popout::-webkit-scrollbar-track{background:transparent}',
                '#hcc-net-popout::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#006699,#990066);}'
            ].join('\n');
            document.head.appendChild(ns);
        }

        var panel = document.createElement('div');
        panel.id = 'hcc-net-popout';
        panel.style.cssText = 'position:fixed;top:50%;left:-1200px;transform:translateY(-50%);width:920px;max-width:calc(100vw - 100px);height:auto;max-height:calc(100vh - 80px);background:#030610;border:1px solid rgba(0,183,255,0.35);font-family:var(--font-mono);z-index:99999;padding:0;overflow-y:auto;overflow-x:hidden;transition:left 0.4s cubic-bezier(0.4,0,0.2,1),box-shadow 0.4s ease;scrollbar-width:thin;scrollbar-color:rgba(0,183,255,0.3) transparent;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 20px,100% 100%,20px 100%,0 calc(100% - 20px));';

        // ── HEADER ──
        var hdr = document.createElement('div');
        hdr.style.cssText = 'padding:20px 28px 16px;border-bottom:2px solid rgba(0,183,255,0.2);background:linear-gradient(90deg,rgba(0,183,255,0.08),#030610);position:relative;';
        var title = document.createElement('div');
        title.style.cssText = 'font-size:16px;letter-spacing:6px;color:#00d4ff;text-transform:uppercase;text-shadow:0 0 16px rgba(0,183,255,0.7);';
        title.textContent = 'NETWORK TOPOLOGY // HOMELAB';
        hdr.appendChild(title);
        var subtitle = document.createElement('div');
        subtitle.style.cssText = 'font-size:11px;letter-spacing:3px;color:#8899bb;margin-top:6px;';
        subtitle.textContent = 'RB3011 CORE + 6 VLANS + CONTAINER';
        hdr.appendChild(subtitle);
        var hdrScan = document.createElement('div');
        hdrScan.style.cssText = 'position:absolute;bottom:0;left:0;width:30%;height:1px;background:linear-gradient(90deg,#00B7FF,transparent);animation:hccNetHdrScan 3s linear infinite;';
        hdr.appendChild(hdrScan);
        panel.appendChild(hdr);

        // ── NODES ──
        var nodesContainer = document.createElement('div');
        nodesContainer.style.cssText = 'padding:18px 24px;';
        var nodes = [
            { name: 'RB3011-GW', ip: '10.10.10.1', color: '#00d4ff', icon: '◈', role: 'CORE ROUTER / CAPSMAN / CONTAINER HOST', ports: 'ether1-WAN  ether2-10  sfp1', type: 'MIKROTIK ROUTEROS 7.x' },
            { name: 'PER730XD', ip: '10.10.10.2', color: '#00B7FF', icon: '▣', role: 'WORKSTATION — FEDORA, DAILY DRIVER', ports: 'VLAN10  bond0 (eno3+eno4)', type: 'DELL POWEREDGE R730XD', vlan: '10' },
            { name: 'PER630', ip: '10.20.20.2', color: '#FF00B2', icon: '▣', role: 'UBUNTU SERVER / AMP GAME PANEL', ports: 'VLAN20  NIC1 mgmt + NIC2 AMP', type: 'DELL POWEREDGE R630', vlan: '20' },
            { name: 'iDRAC x2', ip: '10.30.30.10-11', color: '#ff6600', icon: '◇', role: 'OUT-OF-BAND MANAGEMENT', ports: 'VLAN30  ether6 + ether7', type: 'DELL iDRAC 8', vlan: '30' },
            { name: 'Raspberry Pi', ip: '10.40.40.2', color: '#00ff88', icon: '●', role: 'MONITORING — GRAFANA / PROMETHEUS / EXPORTERS', ports: 'VLAN40  ether8', type: 'RPI4 / DIETPI', vlan: '40' },
            { name: 'WiFi Mesh', ip: '10.60.60.200-201', color: '#B986F2', icon: '◠', role: 'CAPSMAN APs — mAP2nD + wAP2nD', ports: 'VLAN60  ether10 → chain', type: '2.4GHz CH1/CH11', vlan: '60' },
            { name: 'Pi-hole DNS', ip: '172.17.0.2', color: '#00d4ff', icon: '◉', role: 'DNS SINKHOLE + AD BLOCKING', ports: 'CONTAINER  veth 172.17.0.0/24', type: 'PI-HOLE v6 (CONTAINER)' }
        ];

        nodes.forEach(function(node, idx) {
            var card = document.createElement('div');
            card.style.cssText = 'position:relative;padding:14px 18px;margin:10px 0;border:1px solid ' + node.color + '30;background:linear-gradient(135deg,#050a14,' + node.color + '0a);transition:all 0.25s ease;clip-path:polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px));';

            var topRow = document.createElement('div');
            topRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;';
            var dot = document.createElement('span');
            dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + node.color + ';box-shadow:0 0 10px ' + node.color + ',0 0 24px ' + node.color + '50;flex-shrink:0;animation:hccNetNodePulse ' + (2 + idx * 0.3) + 's ease-in-out infinite;';
            topRow.appendChild(dot);
            var icon = document.createElement('span');
            icon.style.cssText = 'font-size:20px;color:' + node.color + ';text-shadow:0 0 12px ' + node.color + '60;';
            icon.textContent = node.icon;
            topRow.appendChild(icon);
            var nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-size:15px;font-weight:700;color:' + node.color + ';letter-spacing:2px;text-shadow:0 0 12px ' + node.color + '50;flex:1;';
            nameEl.textContent = node.name;
            topRow.appendChild(nameEl);
            var ipBadge = document.createElement('span');
            ipBadge.style.cssText = 'font-size:12px;color:#bbccee;background:#0a1020;border:1px solid ' + node.color + '35;padding:4px 12px;letter-spacing:1px;';
            ipBadge.textContent = node.ip;
            topRow.appendChild(ipBadge);
            card.appendChild(topRow);

            [{ l: 'TYPE', v: node.type }, { l: 'ROLE', v: node.role }, { l: 'PORT', v: node.ports }].forEach(function(d) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;gap:12px;padding:2px 0 2px 40px;font-size:11px;';
                row.innerHTML = '<span style="color:#8899bb;width:40px;flex-shrink:0;letter-spacing:1.5px;">' + d.l + '</span><span style="color:#aabbdd;letter-spacing:0.5px;">' + d.v + '</span>';
                card.appendChild(row);
            });

            if (node.vlan) {
                var vt = document.createElement('div');
                vt.style.cssText = 'position:absolute;top:8px;right:10px;font-size:11px;color:' + node.color + 'aa;letter-spacing:2px;text-shadow:0 0 8px ' + node.color + '40;';
                vt.textContent = 'V' + node.vlan;
                card.appendChild(vt);
            }

            (function(c, n) {
                c.addEventListener('mouseenter', function() {
                    c.style.borderColor = n.color + '50';
                    c.style.background = 'linear-gradient(135deg,#060c1a,' + n.color + '12)';
                    c.style.boxShadow = '0 0 20px ' + n.color + '18, inset 0 0 30px ' + n.color + '06';
                });
                c.addEventListener('mouseleave', function() {
                    c.style.borderColor = n.color + '30';
                    c.style.background = 'linear-gradient(135deg,#050a14,' + n.color + '0a)';
                    c.style.boxShadow = 'none';
                });
            })(card, node);

            nodesContainer.appendChild(card);

            if (idx < nodes.length - 1) {
                var connLine = document.createElement('div');
                connLine.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 0 2px 20px;';
                connLine.innerHTML = '<div style="width:1px;height:12px;background:linear-gradient(180deg,' + node.color + '40,' + nodes[idx+1].color + '40);"></div><div style="width:3px;height:3px;border-radius:50%;background:rgba(0,183,255,0.3);margin-left:-2px;"></div>';
                nodesContainer.appendChild(connLine);
            }
        });
        panel.appendChild(nodesContainer);

        // ── INFRASTRUCTURE LAYOUT (ASCII diagram) ──
        var diagSection = document.createElement('div');
        diagSection.style.cssText = 'padding:12px 24px;border-top:1px solid rgba(0,183,255,0.1);border-bottom:1px solid rgba(0,183,255,0.1);background:linear-gradient(180deg,#020408,#040810);position:relative;';
        var diagHdr = document.createElement('div');
        diagHdr.style.cssText = 'font-size:10px;letter-spacing:4px;color:#0088bb;text-transform:uppercase;margin-bottom:10px;text-shadow:0 0 8px rgba(0,183,255,0.3);';
        diagHdr.textContent = '// INFRASTRUCTURE LAYOUT';
        diagSection.appendChild(diagHdr);

        var diagBox = document.createElement('pre');
        diagBox.style.cssText = 'margin:0;padding:16px;background:#020408;border:1px solid rgba(0,183,255,0.15);font-size:13px;line-height:1.35;color:#0088bb;overflow-x:auto;white-space:pre;text-shadow:0 0 4px rgba(0,183,255,0.3);';
        var cy='#00d4ff', dm='#0088bb', bl='#00B7FF', mg='#FF00B2', gn='#00ff88', or='#ff6600', pu='#B986F2', gy='#8899bb';
        diagBox.innerHTML = [
            '<span style="color:'+cy+'">              ┌──────────────────────────────┐</span>',
            '<span style="color:'+cy+'">              │</span>  <span style="color:'+or+'">☁  ISP PPPoE (WAN) ether1</span>   <span style="color:'+cy+'">│</span>',
            '<span style="color:'+cy+'">              └──────────────┬───────────────┘</span>',
            '<span style="color:'+cy+'">                             │</span>',
            '<span style="color:'+cy+'">              ┌──────────────┴───────────────┐</span>',
            '<span style="color:'+cy+';text-shadow:0 0 8px rgba(0,183,255,0.5)">              │  ◆ RB3011-GW    10.10.10.1   │</span>',
            '<span style="color:'+cy+'">              │    RouterOS 7.x / Pi-hole    │</span>',
            '<span style="color:'+cy+'">              └─┬────┬─────┬─────┬─────┬───┬─┘</span>',
            '<span style="color:'+dm+'">        ┌───────┘    │     │     │     │   └────────┐</span>',
            '<span style="color:'+dm+'">        │            │     │     │     │            │</span>',
            '<span style="color:'+bl+'">  ┌─────┴──────┐ ┌───┴────┐ │ ┌───┴────┐ ┌────┴───┐ │</span>',
            '<span style="color:'+bl+'">  │</span><span style="color:'+bl+'"> PER730XD   </span><span style="color:'+bl+'">│ │</span><span style="color:'+mg+'"> PER630 </span><span style="color:'+bl+'">│ │ │</span><span style="color:'+gn+'"> RPi 4  </span><span style="color:'+bl+'">│ │</span><span style="color:'+or+'"> iDRAC  </span><span style="color:'+bl+'">│ │</span>',
            '<span style="color:'+bl+'">  │</span><span style="color:'+gy+'"> VLAN 10    </span><span style="color:'+bl+'">│ │</span><span style="color:'+gy+'"> VLAN20 </span><span style="color:'+bl+'">│ │ │</span><span style="color:'+gy+'"> VLAN40 </span><span style="color:'+bl+'">│ │</span><span style="color:'+gy+'"> VLAN30 </span><span style="color:'+bl+'">│ │</span>',
            '<span style="color:'+bl+'">  │</span><span style="color:'+gy+'"> 10.10.10.2 </span><span style="color:'+bl+'">│ │</span><span style="color:'+gy+'"> .20.20 </span><span style="color:'+bl+'">│ │ │</span><span style="color:'+gy+'"> .40.40 </span><span style="color:'+bl+'">│ │</span><span style="color:'+gy+'"> .30.1x </span><span style="color:'+bl+'">│ │</span>',
            '<span style="color:'+bl+'">  └────────────┘ └────────┘ │ └────────┘ └────────┘ │</span>',
            '<span style="color:'+dm+'">                            │                       │</span>',
            '<span style="color:'+pu+'">                    ┌───────┴──────┐       ┌────────┴──────┐</span>',
            '<span style="color:'+pu+'">                    │</span><span style="color:'+pu+'"> WiFi Mesh    </span><span style="color:'+pu+'">│       │</span><span style="color:'+cy+'"> Pi-hole DNS  </span><span style="color:'+pu+'">│</span>',
            '<span style="color:'+pu+'">                    │</span><span style="color:'+gy+'"> VLAN 60      </span><span style="color:'+pu+'">│       │</span><span style="color:'+gy+'"> 172.17.0.2   </span><span style="color:'+pu+'">│</span>',
            '<span style="color:'+pu+'">                    │</span><span style="color:'+gy+'"> 10.60.60.0/24</span><span style="color:'+pu+'">│       │</span><span style="color:'+gy+'"> Container    </span><span style="color:'+pu+'">│</span>',
            '<span style="color:'+pu+'">                    │</span><span style="color:'+gy+'"> mAP + wAP    </span><span style="color:'+pu+'">│       │</span><span style="color:'+gy+'"> DNS Sinkhole </span><span style="color:'+pu+'">│</span>',
            '<span style="color:'+pu+'">                    └──────────────┘       └───────────────┘</span>'
        ].join('\n');
        diagSection.appendChild(diagBox);
        var diagScan = document.createElement('div');
        diagScan.style.cssText = 'position:absolute;bottom:12px;left:24px;right:24px;height:1px;background:linear-gradient(90deg,transparent,rgba(0,183,255,0.3),transparent);animation:hccNetHdrScan 4s linear infinite;';
        diagSection.appendChild(diagScan);
        panel.appendChild(diagSection);

        // ── 3 STAT CARDS ──
        var statsSection = document.createElement('div');
        statsSection.style.cssText = 'padding:14px 24px;background:#030610;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;';
        var jcards = [
            { title: 'DNS FILTERING', icon: '⚠', color: '#ff6600', lines: [
                { id: 'jn-total', label: 'TOTAL QUERIES', value: '---' },
                { id: 'jn-blocked', label: 'BLOCKED', value: '---' },
                { id: 'jn-pct', label: 'BLOCK RATE', value: '---' },
                { id: 'jn-gravity', label: 'GRAVITY LIST', value: '---' }
            ]},
            { title: 'DATA FLOW', icon: '⇆', color: '#00d4ff', lines: [
                { id: 'jn-dns-status', label: 'DNS ENGINE', value: '---' },
                { id: 'jn-top-blocked', label: 'TOP BLOCKED', value: '---' },
                { id: 'jn-top-client', label: 'TOP CLIENT', value: '---' },
                { id: 'jn-unique', label: 'UNIQUE DOMAINS', value: '---' }
            ]},
            { title: 'INFRASTRUCTURE', icon: '⚙', color: '#00ff88', lines: [
                { id: 'jn-ftl', label: 'FTL ENGINE', value: '---' },
                { id: 'jn-nodes', label: 'NODES', value: '7 ONLINE' },
                { id: 'jn-vlans', label: 'VLANs', value: '6 ACTIVE' },
                { id: 'jn-container', label: 'CONTAINER', value: 'RUNNING' }
            ]}
        ];
        jcards.forEach(function(jc) {
            var jcard = document.createElement('div');
            jcard.style.cssText = 'border:1px solid ' + jc.color + '20;background:linear-gradient(180deg,#050a14,' + jc.color + '08);padding:12px;clip-path:polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px));transition:all 0.2s ease;';
            var jh = document.createElement('div');
            jh.style.cssText = 'font-size:10px;letter-spacing:3px;color:' + jc.color + ';margin-bottom:8px;display:flex;align-items:center;gap:6px;text-shadow:0 0 8px ' + jc.color + '50;';
            jh.textContent = jc.icon + ' ' + jc.title;
            jcard.appendChild(jh);
            jc.lines.forEach(function(line) {
                var jl = document.createElement('div');
                jl.style.cssText = 'font-size:10px;color:#8899bb;padding:2px 0;letter-spacing:1px;display:flex;justify-content:space-between;';
                jl.innerHTML = '<span style="color:#6688aa;">' + line.label + '</span> <span id="' + line.id + '" style="color:' + jc.color + 'cc;font-weight:700;">' + line.value + '</span>';
                jcard.appendChild(jl);
            });
            statsSection.appendChild(jcard);
        });
        panel.appendChild(statsSection);

        // ── FOOTER ──
        var footer = document.createElement('div');
        footer.style.cssText = 'padding:16px 24px 18px;border-top:2px solid rgba(0,183,255,0.15);background:#040810;';
        var fGrid = document.createElement('div');
        fGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;';
        [
            { label: 'DNS FILTER', value: 'CHECKING...', color: '#00d4ff', id: 'hcc-net-fdns' },
            { label: 'TOTAL QUERIES', value: '---', color: '#00B7FF', id: 'hcc-net-fqry' },
            { label: 'BLOCKED', value: '---', color: '#ff6600', id: 'hcc-net-fblk' },
            { label: 'NODES', value: '7 / 7', color: '#B986F2', id: '' },
            { label: 'WAN', value: 'PPPoE UP', color: '#00ff88', id: '' },
            { label: 'VLANs', value: '6 ACTIVE', color: '#B986F2', id: '' }
        ].forEach(function(st) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;padding:3px 0;';
            row.innerHTML = '<span style="color:#8899bb;letter-spacing:2px;">' + st.label + '</span><span ' + (st.id?'id="'+st.id+'"':'') + ' style="color:' + st.color + ';text-shadow:0 0 12px ' + st.color + '50;letter-spacing:2px;font-weight:700;">' + st.value + '</span>';
            fGrid.appendChild(row);
        });
        footer.appendChild(fGrid);
        var timerDiv = document.createElement('div');
        timerDiv.style.cssText = 'text-align:center;margin-top:12px;font-size:12px;letter-spacing:5px;color:#00B7FF;text-shadow:0 0 12px rgba(0,183,255,0.5);border-top:1px solid rgba(0,183,255,0.1);padding-top:10px;';
        timerDiv.id = 'hcc-net-session';
        timerDiv.textContent = 'SESSION 00:00:00';
        footer.appendChild(timerDiv);
        panel.appendChild(footer);

        // Corner accents
        ['top:6px;left:6px;border-top:2px solid rgba(0,183,255,0.5);border-left:2px solid rgba(0,183,255,0.5);',
         'top:6px;right:6px;border-top:2px solid rgba(0,183,255,0.3);border-right:2px solid rgba(0,183,255,0.3);',
         'bottom:6px;left:6px;border-bottom:2px solid rgba(255,0,178,0.3);border-left:2px solid rgba(255,0,178,0.3);',
         'bottom:6px;right:6px;border-bottom:2px solid rgba(255,0,178,0.5);border-right:2px solid rgba(255,0,178,0.5);'
        ].forEach(function(pos) {
            var c = document.createElement('div');
            c.style.cssText = 'position:absolute;width:14px;height:14px;pointer-events:none;z-index:2;' + pos;
            panel.appendChild(c);
        });

        document.body.appendChild(panel);

        // Toggle logic
        var panelOpen = false;
        window._hccToggleNetPopup = function() {
            panelOpen = !panelOpen;
            if (panelOpen) {
                panel.style.left = 'calc(50vw - 460px + 39px)';
                panel.style.boxShadow = '0 0 60px rgba(0,183,255,0.2), 0 0 120px rgba(0,183,255,0.08), 0 20px 80px rgba(0,0,0,0.8)';
            } else {
                panel.style.left = '-1200px';
                panel.style.boxShadow = 'none';
            }
        };
        document.addEventListener('click', function(e) {
            var trig = document.getElementById('hcc-net-trigger');
            if (panelOpen && !panel.contains(e.target) && trig && !trig.contains(e.target)) {
                panelOpen = false;
                panel.style.left = '-1200px';
                panel.style.boxShadow = 'none';
            }
        });

        // Session timer
        var startTime = Date.now();
        setInterval(function() {
            var el = document.getElementById('hcc-net-session');
            if (!el) return;
            var elapsed = Math.floor((Date.now() - startTime) / 1000);
            var h = Math.floor(elapsed / 3600);
            var m = Math.floor((elapsed % 3600) / 60);
            var sec = elapsed % 60;
            el.textContent = 'SESSION ' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0');
        }, 1000);
    }

    // Update network popup with live data
    window._hccUpdateNetPopup = function(pihole) {
        if (!pihole) return;
        var setText = function(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; };
        setText('jn-total', fmtNum(pihole.totalQueries));
        setText('jn-blocked', fmtNum(pihole.blockedQueries));
        setText('jn-pct', (pihole.percentBlocked||0).toFixed(1) + '%');
        setText('jn-gravity', fmtNum(pihole.gravitySize));
        setText('jn-dns-status', pihole.status === 'enabled' ? 'ACTIVE' : 'DISABLED');
        setText('jn-ftl', 'ONLINE');
        setText('jn-unique', fmtNum(pihole.uniqueDomains || 0));
        if (pihole.topBlocked && pihole.topBlocked[0]) {
            var d = pihole.topBlocked[0].domain;
            if (d.length > 22) d = d.substring(0, 20) + '..';
            setText('jn-top-blocked', d);
        }
        if (pihole.topSources && pihole.topSources[0]) {
            var c = pihole.topSources[0].client;
            if (c.length > 22) c = c.substring(0, 20) + '..';
            setText('jn-top-client', c);
        }
        // Footer
        setText('hcc-net-fdns', pihole.status === 'enabled' ? 'ACTIVE' : 'DISABLED');
        setText('hcc-net-fqry', fmtNum(pihole.totalQueries));
        setText('hcc-net-fblk', fmtNum(pihole.blockedQueries));
    };

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

        // ── NETWORK MAP TRIGGER (opens popup) ──
        var netTrigger = document.createElement('div');
        netTrigger.id = 'hcc-net-trigger';
        netTrigger.className = 'hcc-sb-widget';
        netTrigger.style.cssText = 'position:relative;margin:14px 6px 6px;padding:10px 8px;border:1px solid rgba(0,183,255,0.2);background:linear-gradient(180deg,rgba(0,183,255,0.04),rgba(0,0,0,0.4));font-family:var(--font-mono);z-index:9999;cursor:pointer;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));transition:all 0.2s ease;';
        netTrigger.innerHTML = '<div style="font-size:9px;letter-spacing:3px;color:#00B7FF;text-transform:uppercase;text-shadow:0 0 10px rgba(0,183,255,0.5);display:flex;align-items:center;gap:6px;"><span style="font-size:12px;">◎</span> NETWORK MAP</div>';

        // Mini status dots row
        var miniDots = document.createElement('div');
        miniDots.style.cssText = 'display:flex;gap:4px;margin-top:6px;padding-left:18px;';
        ['#00d4ff','#00B7FF','#FF00B2','#ff6600','#00ff88','#B986F2','#00d4ff'].forEach(function(c, di) {
            var d = document.createElement('span');
            d.style.cssText = 'width:4px;height:4px;border-radius:50%;background:' + c + ';box-shadow:0 0 4px ' + c + ';animation:hccNetNodePulse ' + (2 + di * 0.4) + 's ease-in-out infinite;';
            miniDots.appendChild(d);
        });
        netTrigger.appendChild(miniDots);

        // Corner marks
        var ntc1 = document.createElement('div');
        ntc1.style.cssText = 'position:absolute;top:3px;left:3px;width:5px;height:5px;border-top:1px solid rgba(0,183,255,0.4);border-left:1px solid rgba(0,183,255,0.4);';
        netTrigger.appendChild(ntc1);
        var ntc2 = document.createElement('div');
        ntc2.style.cssText = 'position:absolute;bottom:3px;right:3px;width:5px;height:5px;border-bottom:1px solid rgba(255,0,178,0.3);border-right:1px solid rgba(255,0,178,0.3);';
        netTrigger.appendChild(ntc2);

        sidebar.appendChild(netTrigger);

        // Trigger click toggles popup
        netTrigger.addEventListener('click', function(e) {
            e.stopPropagation();
            if (typeof window._hccToggleNetPopup === 'function') window._hccToggleNetPopup();
        });

        // ── BUILD NETWORK TOPOLOGY POPUP PANEL ──
        buildNetworkPopup();

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

    // ── KIOSK MODE ──
    function initKioskMode() {
        var btn = document.getElementById('hcc-kiosk-btn');
        if (!btn) return;
        var kioskActive = false;
        var cursorTimeout = null;

        function enterKiosk() {
            var de = document.documentElement;
            // Try all browser variants (Firefox + Chromium)
            if (de.requestFullscreen) de.requestFullscreen();
            else if (de.webkitRequestFullscreen) de.webkitRequestFullscreen();
            else if (de.mozRequestFullScreen) de.mozRequestFullScreen();
            else if (de.msRequestFullscreen) de.msRequestFullscreen();
            document.body.classList.add('hcc-kiosk');
            kioskActive = true;
            btn.textContent = 'EXIT';
            btn.classList.add('active');
        }
        function exitKiosk() {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
            else if (document.msExitFullscreen) document.msExitFullscreen();
            document.body.classList.remove('hcc-kiosk', 'hcc-cursor-hidden');
            kioskActive = false;
            btn.textContent = 'KIOSK';
            btn.classList.remove('active');
        }
        btn.addEventListener('click', function() {
            if (kioskActive) exitKiosk(); else enterKiosk();
        });

        // Auto-hide cursor after 3s of inactivity in kiosk mode
        function resetCursor() {
            if (!kioskActive) return;
            document.body.classList.remove('hcc-cursor-hidden');
            if (cursorTimeout) clearTimeout(cursorTimeout);
            cursorTimeout = setTimeout(function() {
                if (kioskActive) document.body.classList.add('hcc-cursor-hidden');
            }, 3000);
        }
        document.addEventListener('mousemove', resetCursor);

        // Detect fullscreen exit (Esc key) — all browser variants
        function onFsChange() {
            var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
            if (!fsEl && kioskActive) {
                document.body.classList.remove('hcc-kiosk', 'hcc-cursor-hidden');
                kioskActive = false;
                btn.textContent = 'KIOSK';
                btn.classList.remove('active');
            }
        }
        document.addEventListener('fullscreenchange', onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
        document.addEventListener('mozfullscreenchange', onFsChange);
        document.addEventListener('MSFullscreenChange', onFsChange);
    }

    // ── MOBILE SIDEBAR TAP TOGGLE ──
    function initMobileSidebar() {
        var sb = document.getElementById('hcc-sidebar');
        if (!sb) return;
        // Detect touch device
        var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        if (!isTouch) return;
        // Tap on collapsed sidebar opens it; tap outside closes it
        sb.addEventListener('click', function(e) {
            if (window.innerWidth > 900) return;
            // Don't toggle if a nav item or trigger was clicked (those have their own handlers)
            if (e.target.closest('.hcc-sb-panel') || e.target.closest('#hcc-net-trigger')) return;
            sb.classList.toggle('hcc-sb-open');
        });
        document.addEventListener('click', function(e) {
            if (window.innerWidth > 900) return;
            if (!sb.contains(e.target) && sb.classList.contains('hcc-sb-open')) {
                sb.classList.remove('hcc-sb-open');
            }
        });
    }

    function startDashboard() {
        initClock();
        initGrid();
        buildSidebar();
        initKioskMode();
        initMobileSidebar();
        renderControl();
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
