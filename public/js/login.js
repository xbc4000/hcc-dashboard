(function() {
    'use strict';

    var bootLines = [
        { text: '╔══════════════════════════════════════════════════════════════╗', color: '#00B7FF', delay: 0 },
        { text: '║         HOMELAB COMMAND CENTER  //  HCC v1.0               ║', color: '#00d4ff', delay: 100 },
        { text: '║         (c) 2026 XBC SYSTEMS  —  AUTHORIZED ONLY           ║', color: '#556688', delay: 200 },
        { text: '╚══════════════════════════════════════════════════════════════╝', color: '#00B7FF', delay: 300 },
        { text: '', delay: 500 },
        { text: '> BIOS POST ................ OK', color: '#00ff88', delay: 600 },
        { text: '> MEMORY CHECK ............. 128 GB ECC REGISTERED', color: '#00ff88', delay: 800 },
        { text: '> STORAGE ARRAY ............ 8x 2TB SAS  RAID-6', color: '#00ff88', delay: 1000 },
        { text: '> NETWORK INTERFACES ....... 4x 1GbE  BONDED', color: '#00ff88', delay: 1200 },
        { text: '', delay: 1400 },
        { text: '  SCANNING NETWORK INFRASTRUCTURE...', color: '#ff6600', delay: 1500 },
        { text: '', delay: 1700 },
        { text: '  [VLAN10]  SERVER1    PER730XD       10.10.10.2     DETECTED', color: '#00B7FF', delay: 1800 },
        { text: '  [VLAN20]  SERVER2    PER630         10.20.20.2     DETECTED', color: '#00B7FF', delay: 2000 },
        { text: '  [VLAN30]  iDRAC1     PER730XD       10.30.30.10    DETECTED', color: '#E08A00', delay: 2200 },
        { text: '  [VLAN30]  iDRAC2     PER630         10.30.30.11    DETECTED', color: '#E08A00', delay: 2400 },
        { text: '  [VLAN40]  RPi4       MONITORING     10.40.40.2     DETECTED', color: '#00ff88', delay: 2600 },
        { text: '  [VLAN60]  WiFi       CAPSMAN MESH   2x APs         DETECTED', color: '#B986F2', delay: 2800 },
        { text: '  [BRIDGE]  PI-HOLE    DNS SINKHOLE   172.17.0.2     DETECTED', color: '#ff2244', delay: 3000 },
        { text: '', delay: 3200 },
        { text: '  CONNECTING SERVICES...', color: '#ff6600', delay: 3300 },
        { text: '', delay: 3500 },
        { text: '  ROUTEROS API ............ 10.10.10.1:8728    CONNECTED', color: '#00ff88', delay: 3600 },
        { text: '  PROMETHEUS .............. 10.40.40.2:9090    CONNECTED', color: '#00ff88', delay: 3800 },
        { text: '  GRAFANA ................. 10.40.40.2:3000    CONNECTED', color: '#00ff88', delay: 4000 },
        { text: '  PI-HOLE API ............. 172.17.0.2:80      CONNECTED', color: '#00ff88', delay: 4200 },
        { text: '  LOKI LOG AGGREGATOR ..... 10.40.40.2:3100    CONNECTED', color: '#00ff88', delay: 4400 },
        { text: '', delay: 4600 },
        { text: '  NETWATCH: 12/12 HOSTS RESPONDING', color: '#00d4ff', delay: 4800 },
        { text: '  BLOCKLIST: 9,922,996 DOMAINS LOADED', color: '#00d4ff', delay: 5000 },
        { text: '  FIREWALL: RAW + FILTER + NAT  ARMED', color: '#00d4ff', delay: 5200 },
        { text: '', delay: 5400 },
        { text: '     ██╗  ██╗ ██████╗ ██████╗', color: '#00d4ff', delay: 5500 },
        { text: '     ██║  ██║██╔════╝██╔════╝', color: '#00d4ff', delay: 5600 },
        { text: '     ███████║██║     ██║     ', color: '#00B7FF', delay: 5700 },
        { text: '     ██╔══██║██║     ██║     ', color: '#00B7FF', delay: 5800 },
        { text: '     ██║  ██║╚██████╗╚██████╗', color: '#0099dd', delay: 5900 },
        { text: '     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝', color: '#0099dd', delay: 6000 },
        { text: '', delay: 6200 },
        { text: '     HOMELAB COMMAND CENTER', color: '#00d4ff', delay: 6300 },
        { text: '     XBC SYSTEMS', color: '#556688', delay: 6400 },
        { text: '', delay: 6600 },
        { text: '> ALL SYSTEMS NOMINAL — AWAITING AUTHENTICATION', color: '#00ff88', delay: 6800 }
    ];

    function bootSequence() {
        var overlay = document.getElementById('boot-overlay');
        var terminal = document.getElementById('boot-terminal');
        var progressBar = document.getElementById('boot-progress-bar');
        var percentEl = document.getElementById('boot-percent');
        var totalDuration = 7500;

        // Progress bar
        var startTime = Date.now();
        var progressTimer = setInterval(function() {
            var elapsed = Date.now() - startTime;
            var pct = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
            progressBar.style.width = pct + '%';
            percentEl.textContent = pct + '%';
            if (pct >= 100) clearInterval(progressTimer);
        }, 50);

        // Boot lines
        bootLines.forEach(function(line) {
            setTimeout(function() {
                var div = document.createElement('div');
                div.className = 'boot-line';
                if (line.text === '') {
                    div.innerHTML = '&nbsp;';
                } else {
                    div.textContent = line.text;
                    // Color keywords
                    var html = div.textContent
                        .replace(/(DETECTED|CONNECTED|OK|NOMINAL|ARMED|LOADED|RESPONDING)/g,
                            '<span style="color:#00ff88;text-shadow:0 0 8px rgba(0,255,136,0.5);">$1</span>')
                        .replace(/(SCANNING|CONNECTING)/g,
                            '<span style="color:#ff6600;text-shadow:0 0 8px rgba(255,102,0,0.5);">$1</span>');
                    div.innerHTML = html;
                }
                div.style.color = line.color || '#8899bb';
                terminal.appendChild(div);
                terminal.scrollTop = terminal.scrollHeight;
            }, line.delay);
        });

        // Finish boot
        setTimeout(function() {
            overlay.style.transition = 'opacity 0.5s';
            overlay.style.opacity = '0';
            setTimeout(function() {
                overlay.style.display = 'none';
                document.getElementById('login-container').style.display = 'flex';
                document.getElementById('login-password').focus();
            }, 500);
        }, totalDuration);
    }

    // Login form
    function initLogin() {
        var form = document.getElementById('login-form');
        var errorEl = document.getElementById('login-error');

        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var password = document.getElementById('login-password').value;
            if (!password) return;

            var btn = document.getElementById('login-btn');
            btn.textContent = 'AUTHENTICATING...';
            btn.disabled = true;

            fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password })
            })
            .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
            .then(function(result) {
                if (result.ok) {
                    // Success flash
                    document.body.style.transition = 'background 0.2s';
                    document.body.style.background = 'rgba(0,183,255,0.15)';
                    setTimeout(function() {
                        window.location.href = '/';
                    }, 300);
                } else {
                    errorEl.textContent = 'ACCESS DENIED';
                    errorEl.style.display = 'block';
                    document.getElementById('login-password').value = '';
                    document.getElementById('login-password').focus();
                    btn.textContent = 'ACCESS';
                    btn.disabled = false;
                    // Glitch effect
                    var card = document.querySelector('.login-card');
                    card.classList.add('glitch');
                    setTimeout(function() { card.classList.remove('glitch'); }, 500);
                }
            })
            .catch(function() {
                errorEl.textContent = 'CONNECTION FAILED';
                errorEl.style.display = 'block';
                btn.textContent = 'ACCESS';
                btn.disabled = false;
            });
        });
    }

    // Check if already authenticated
    fetch('/auth/status')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.authenticated) {
                window.location.href = '/';
            } else {
                bootSequence();
                initLogin();
            }
        })
        .catch(function() {
            bootSequence();
            initLogin();
        });
})();
