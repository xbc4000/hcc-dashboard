(function() {
    'use strict';

    // ── PARTICLE FIELD ──
    window.addParticleField = function(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.5;';
        container.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        var particles = [];
        var colors = ['#00B7FF', '#FF00B2', '#00ff88', '#00d4ff'];

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        for (var i = 0; i < 90; i++) {
            particles.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 3 + 0.5, color: colors[Math.floor(Math.random() * colors.length)],
                pulse: Math.random() * Math.PI * 2
            });
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                p.x += p.vx; p.y += p.vy; p.pulse += 0.02;
                if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
                var glow = 0.6 + Math.sin(p.pulse) * 0.4;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.globalAlpha = glow; ctx.fill();
                for (var j = i + 1; j < particles.length; j++) {
                    var dx = particles[j].x - p.x, dy = particles[j].y - p.y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 160) {
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = p.color; ctx.globalAlpha = (1 - dist / 160) * 0.2;
                        ctx.lineWidth = 0.7; ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(draw);
        }
        draw();
    };

    // ── DATA RAIN (Matrix-style hex) ──
    window.addDataRain = function() {
        var container = document.getElementById('data-rain');
        if (!container || container.children.length > 0) return;
        var chars = '0123456789ABCDEF';
        for (var i = 0; i < 40; i++) {
            var col = document.createElement('div');
            col.className = 'rain-column';
            col.style.left = (Math.random() * 100) + '%';
            col.style.animationDuration = (6 + Math.random() * 10) + 's';
            col.style.animationDelay = (Math.random() * 8) + 's';
            col.style.opacity = 0.05 + Math.random() * 0.1;
            col.style.fontSize = (9 + Math.random() * 4) + 'px';
            var text = '';
            for (var j = 0; j < 40; j++) {
                text += chars[Math.floor(Math.random() * chars.length)] + '\n';
            }
            col.textContent = text;
            container.appendChild(col);
        }
    };

    // ── SCAN LINE ──
    window.addScanLine = function() {
        if (document.getElementById('hcc-scanline')) return;
        var line = document.createElement('div');
        line.id = 'hcc-scanline';
        document.body.appendChild(line);
    };

    // ── CORNER BRACKETS ──
    window.addCornerBrackets = function(el) {
        if (!el || el.querySelector('.hcc-bracket')) return;
        var positions = [
            { cls: 'tl', css: 'top:-1px;left:-1px;border-top:2px solid #00B7FF;border-left:2px solid #00B7FF;' },
            { cls: 'tr', css: 'top:-1px;right:-1px;border-top:2px solid #00B7FF;border-right:2px solid #00B7FF;' },
            { cls: 'bl', css: 'bottom:-1px;left:-1px;border-bottom:2px solid #FF00B2;border-left:2px solid #FF00B2;' },
            { cls: 'br', css: 'bottom:-1px;right:-1px;border-bottom:2px solid #FF00B2;border-right:2px solid #FF00B2;' }
        ];
        positions.forEach(function(p) {
            var b = document.createElement('div');
            b.className = 'hcc-bracket ' + p.cls;
            b.style.cssText = 'position:absolute;width:18px;height:18px;pointer-events:none;' + p.css;
            el.appendChild(b);
        });
        el.style.position = el.style.position || 'relative';
    };

    // ── SPARKLINE RENDERER ──
    window.renderSparkline = function(data, color, width, height) {
        if (!data || data.length < 2) return '';
        var w = width || 120, h = height || 30;
        var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
        var range = max - min || 1;
        var points = data.map(function(v, i) {
            var x = (i / (data.length - 1)) * w;
            var y = h - ((v - min) / range) * (h - 4) - 2;
            return x.toFixed(1) + ',' + y.toFixed(1);
        }).join(' ');
        return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="display:block;width:100%;height:' + h + 'px;">' +
            '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="2" opacity="0.9"/>' +
            '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="5" opacity="0.2" filter="blur(3px)"/>' +
            '</svg>';
    };

    // ── DONUT CHART RENDERER ──
    window.renderDonut = function(data, size) {
        if (!data || !data.length) return '';
        var total = 0;
        for (var i = 0; i < data.length; i++) total += data[i].value;
        if (total === 0) return '';
        var s = size || 120;
        var cx = s / 2, cy = s / 2;
        var r = s * 0.35;
        var sw = s * 0.16;
        var circ = 2 * Math.PI * r;
        var offset = 0;
        var svg = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '">';
        // Background ring
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="rgba(22,34,66,0.5)" stroke-width="' + sw + '"/>';
        for (var j = 0; j < data.length; j++) {
            var d = data[j];
            var pct = d.value / total;
            if (pct < 0.005) continue;
            var dashLen = pct * circ;
            var dashGap = circ - dashLen;
            svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + d.color + '" stroke-width="' + sw + '"';
            svg += ' stroke-dasharray="' + dashLen.toFixed(2) + ' ' + dashGap.toFixed(2) + '"';
            svg += ' stroke-dashoffset="' + (-offset).toFixed(2) + '"';
            svg += ' transform="rotate(-90 ' + cx + ' ' + cy + ')"';
            svg += ' opacity="0.85"/>';
            offset += dashLen;
        }
        // Center text
        svg += '<text x="' + cx + '" y="' + (cy + 1) + '" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-family="var(--font-mono)" font-size="' + (s * 0.09) + '">' + total.toLocaleString() + '</text>';
        svg += '</svg>';
        return svg;
    };

    // ── DONUT LEGEND ──
    window.renderDonutLegend = function(data) {
        if (!data || !data.length) return '';
        var total = 0;
        for (var i = 0; i < data.length; i++) total += data[i].value;
        var html = '';
        for (var j = 0; j < data.length; j++) {
            var d = data[j];
            var pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0';
            html += '<div class="donut-legend-item">';
            html += '<span class="donut-legend-dot" style="background:' + d.color + ';"></span>';
            html += '<span class="donut-legend-label">' + d.label + '</span>';
            html += '<span class="donut-legend-pct">' + pct + '%</span>';
            html += '</div>';
        }
        return html;
    };

    // ── NEON GLOW PULSE ON STAT VALUES ──
    window.addNeonPulse = function() {
        if (document.getElementById('hcc-neon-style')) return;
        var s = document.createElement('style');
        s.id = 'hcc-neon-style';
        s.textContent = [
            '@keyframes neonCyan{0%,100%{text-shadow:0 0 15px #00B7FF,0 0 40px rgba(0,183,255,0.4)}50%{text-shadow:0 0 30px #00d4ff,0 0 60px rgba(0,183,255,0.6),0 0 100px rgba(0,183,255,0.3)}}',
            '@keyframes neonRed{0%,100%{text-shadow:0 0 15px #ff2244,0 0 40px rgba(255,34,68,0.4)}50%{text-shadow:0 0 30px #ff4466,0 0 60px rgba(255,34,68,0.6),0 0 100px rgba(255,34,68,0.3)}}',
            '@keyframes neonOrange{0%,100%{text-shadow:0 0 15px #ff6600,0 0 40px rgba(255,102,0,0.4)}50%{text-shadow:0 0 30px #ff8833,0 0 60px rgba(255,102,0,0.6),0 0 100px rgba(255,102,0,0.3)}}',
            '@keyframes neonGreen{0%,100%{text-shadow:0 0 15px #00ff88,0 0 40px rgba(0,255,136,0.4)}50%{text-shadow:0 0 30px #33ff99,0 0 60px rgba(0,255,136,0.6),0 0 100px rgba(0,255,136,0.3)}}',
            '@keyframes neonPurple{0%,100%{text-shadow:0 0 15px #B986F2,0 0 40px rgba(185,134,242,0.4)}50%{text-shadow:0 0 30px #c9a4ff,0 0 60px rgba(185,134,242,0.6),0 0 100px rgba(185,134,242,0.3)}}',
            '.stat-box-value.cyan{animation:neonCyan 3s ease-in-out infinite}',
            '.stat-box-value.red{animation:neonRed 3s ease-in-out infinite}',
            '.stat-box-value.orange{animation:neonOrange 3s ease-in-out infinite}',
            '.stat-box-value.green{animation:neonGreen 3s ease-in-out infinite}',
            '.stat-box-value.purple{animation:neonPurple 3s ease-in-out infinite}'
        ].join('\n');
        document.head.appendChild(s);
    };

    // ── PULSE RINGS ON STAT BOXES ──
    window.addPulseRings = function() {
        if (document.getElementById('hcc-pulse-ring-style')) return;
        var s = document.createElement('style');
        s.id = 'hcc-pulse-ring-style';
        s.textContent = [
            '@keyframes hccPulseRing{0%{width:20px;height:20px;opacity:0.5}100%{width:100px;height:100px;opacity:0}}',
            '.hcc-pulse-ring{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;z-index:0;}'
        ].join('\n');
        document.head.appendChild(s);

        function applyRings() {
            document.querySelectorAll('.stat-box').forEach(function(box) {
                if (box.querySelector('.hcc-pulse-ring')) return;
                var val = box.querySelector('.stat-box-value');
                var color = '0,183,255';
                if (val) {
                    if (val.classList.contains('red')) color = '255,34,68';
                    else if (val.classList.contains('orange')) color = '255,102,0';
                    else if (val.classList.contains('green')) color = '0,255,136';
                    else if (val.classList.contains('purple')) color = '185,134,242';
                }
                for (var i = 0; i < 2; i++) {
                    var ring = document.createElement('div');
                    ring.className = 'hcc-pulse-ring';
                    ring.style.cssText = 'border:1px solid rgba(' + color + ',0.3);animation:hccPulseRing 3s ease-out infinite;animation-delay:' + (i * 1.5) + 's;';
                    box.appendChild(ring);
                }
            });
        }
        applyRings();
        window._hccApplyRings = applyRings;
    };

    // ── ROTATING ARCS ON DONUT CHARTS ──
    window.addRotatingArcs = function() {
        if (document.getElementById('hcc-arc-style')) return;
        var s = document.createElement('style');
        s.id = 'hcc-arc-style';
        s.textContent = '@keyframes hccArcSpin{0%{transform:translate(-50%,-50%) rotate(0deg)}100%{transform:translate(-50%,-50%) rotate(360deg)}}';
        document.head.appendChild(s);

        function applyArcs() {
            document.querySelectorAll('.ph-donut-wrap svg').forEach(function(svg) {
                var wrap = svg.parentElement;
                if (!wrap || wrap.querySelector('.hcc-arc')) return;
                var size = svg.getAttribute('width') || 130;
                var s1 = parseInt(size) + 10;
                var s2 = parseInt(size) + 24;
                // Inner arc
                var arc1 = document.createElement('div');
                arc1.className = 'hcc-arc';
                arc1.style.cssText = 'position:absolute;top:50%;left:' + (parseInt(size)/2) + 'px;width:' + s1 + 'px;height:' + s1 + 'px;border:1px solid transparent;border-top:2px solid rgba(0,183,255,0.6);border-right:2px solid rgba(255,0,178,0.5);border-radius:50%;animation:hccArcSpin 10s linear infinite;pointer-events:none;transform:translate(-50%,-50%);';
                // Outer arc (counter-rotating)
                var arc2 = document.createElement('div');
                arc2.className = 'hcc-arc';
                arc2.style.cssText = 'position:absolute;top:50%;left:' + (parseInt(size)/2) + 'px;width:' + s2 + 'px;height:' + s2 + 'px;border:1px solid transparent;border-bottom:2px solid rgba(0,183,255,0.4);border-left:2px solid rgba(255,0,178,0.35);border-radius:50%;animation:hccArcSpin 18s linear infinite reverse;pointer-events:none;transform:translate(-50%,-50%);';
                wrap.style.position = 'relative';
                wrap.appendChild(arc1);
                wrap.appendChild(arc2);
            });
        }
        applyArcs();
        // Expose for re-apply after poll re-renders donut SVGs
        window._hccApplyArcs = applyArcs;
    };

    // ── BINARY DATA STREAMS ON SCREEN EDGES ──
    window.addDataStreams = function() {
        if (document.getElementById('hcc-datastream-r')) return;
        var chars = '01101001 10110100 01011010 01101010 10010110 01101001 01010110 10101001';

        // Right edge
        var streamR = document.createElement('div');
        streamR.id = 'hcc-datastream-r';
        streamR.style.cssText = 'position:fixed;top:50px;right:0;width:24px;height:calc(100vh - 78px);overflow:hidden;pointer-events:none;z-index:99;';
        var col1 = document.createElement('div');
        col1.style.cssText = 'position:absolute;top:-100%;left:2px;font-family:var(--font-mono);font-size:11px;color:rgba(0,183,255,0.6);writing-mode:vertical-lr;letter-spacing:2px;line-height:1;animation:hccDataFall 12s linear infinite;white-space:nowrap;';
        col1.textContent = chars;
        var col2 = col1.cloneNode(true);
        col2.style.left = '12px';
        col2.style.color = 'rgba(255,0,178,0.4)';
        col2.style.animationDuration = '18s';
        col2.style.animationDelay = '-6s';
        streamR.appendChild(col1);
        streamR.appendChild(col2);
        document.body.appendChild(streamR);

        // Left edge
        var streamL = document.createElement('div');
        streamL.id = 'hcc-datastream-l';
        streamL.style.cssText = 'position:fixed;top:50px;left:0;width:24px;height:calc(100vh - 78px);overflow:hidden;pointer-events:none;z-index:99;';
        var col3 = document.createElement('div');
        col3.style.cssText = 'position:absolute;top:100%;left:2px;font-family:var(--font-mono);font-size:11px;color:rgba(0,183,255,0.4);writing-mode:vertical-lr;letter-spacing:2px;line-height:1;animation:hccDataFallUp 14s linear infinite;white-space:nowrap;';
        col3.textContent = '10110100 01011010 01101001 10010110';
        var col4 = col3.cloneNode(true);
        col4.style.left = '12px';
        col4.style.color = 'rgba(255,0,178,0.3)';
        col4.style.animationDuration = '20s';
        col4.style.animationDelay = '-5s';
        streamL.appendChild(col3);
        streamL.appendChild(col4);
        document.body.appendChild(streamL);

        var style = document.createElement('style');
        style.textContent = '@keyframes hccDataFall{0%{top:-100%}100%{top:100%}} @keyframes hccDataFallUp{0%{top:100%}100%{top:-100%}}';
        document.head.appendChild(style);
    };

    // ── VIEWPORT CORNER HUD BRACKETS ──
    window.addCornerHUD = function() {
        if (document.getElementById('hcc-hud-tr')) return;
        var corners = [
            { id: 'hcc-hud-tr', css: 'top:56px;right:6px;border-top:2px solid rgba(255,0,178,0.5);border-right:2px solid rgba(255,0,178,0.5);' },
            { id: 'hcc-hud-bl', css: 'bottom:34px;left:6px;border-bottom:2px solid rgba(0,183,255,0.5);border-left:2px solid rgba(0,183,255,0.5);' },
            { id: 'hcc-hud-tl', css: 'top:56px;left:6px;border-top:2px solid rgba(0,183,255,0.4);border-left:2px solid rgba(0,183,255,0.4);' },
            { id: 'hcc-hud-br', css: 'bottom:34px;right:6px;border-bottom:2px solid rgba(255,0,178,0.4);border-right:2px solid rgba(255,0,178,0.4);' }
        ];
        corners.forEach(function(c) {
            var el = document.createElement('div');
            el.id = c.id;
            el.style.cssText = 'position:fixed;width:30px;height:30px;pointer-events:none;z-index:100;' + c.css;
            document.body.appendChild(el);
        });
    };

    // ── EQUALIZER BARS ON PANEL HEADERS ──
    window.addEqualizerBars = function() {
        if (document.getElementById('hcc-eq-style')) return;
        var s = document.createElement('style');
        s.id = 'hcc-eq-style';
        s.textContent = [
            '@keyframes hccEq1{0%,100%{height:4px}50%{height:16px}}',
            '@keyframes hccEq2{0%,100%{height:8px}50%{height:12px}}',
            '@keyframes hccEq3{0%,100%{height:6px}50%{height:18px}}',
            '@keyframes hccEq4{0%,100%{height:10px}50%{height:6px}}',
            '@keyframes hccEq5{0%,100%{height:5px}50%{height:14px}}'
        ].join('\n');
        document.head.appendChild(s);

        document.querySelectorAll('.hcc-panel-header').forEach(function(header) {
            if (header.querySelector('.hcc-eq')) return;
            var eq = document.createElement('div');
            eq.className = 'hcc-eq';
            eq.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;align-items:flex-end;gap:2px;height:20px;';
            var colors = ['#00B7FF', '#FF00B2', '#00B7FF', '#FF00B2', '#00B7FF'];
            for (var i = 0; i < 5; i++) {
                var bar = document.createElement('div');
                bar.style.cssText = 'width:3px;background:' + colors[i] + ';animation:hccEq' + (i + 1) + ' ' + (0.6 + Math.random() * 0.8).toFixed(2) + 's ease-in-out infinite;animation-delay:' + (i * 0.15) + 's;opacity:0.5;border-radius:1px 1px 0 0;';
                eq.appendChild(bar);
            }
            header.style.position = 'relative';
            header.appendChild(eq);
        });
    };

    // ── GLITCH FLASH ON STAT VALUE CHANGE ──
    window.addGlitchOnUpdate = function() {
        if (document.getElementById('hcc-glitch-style')) return;
        var s = document.createElement('style');
        s.id = 'hcc-glitch-style';
        s.textContent = '@keyframes hccGlitch{0%{opacity:1;transform:translate(0)}20%{opacity:0.8;transform:translate(-2px,1px)}40%{opacity:1;transform:translate(2px,-1px)}60%{opacity:0.9;transform:translate(-1px,0)}80%{opacity:1;transform:translate(1px,1px)}100%{opacity:1;transform:translate(0)}}';
        document.head.appendChild(s);

        var prevValues = {};
        setInterval(function() {
            document.querySelectorAll('.stat-box-value').forEach(function(el) {
                var key = el.parentElement ? el.parentElement.querySelector('.stat-box-label') : null;
                var id = key ? key.textContent : Math.random();
                var val = el.textContent;
                if (prevValues[id] && prevValues[id] !== val) {
                    el.style.animation = 'hccGlitch 0.3s ease-out';
                    setTimeout(function() {
                        el.style.animation = '';
                        // Re-apply neon if it had one
                        var cls = el.className;
                        if (cls.indexOf('cyan') !== -1) el.style.animation = 'neonCyan 3s ease-in-out infinite';
                        else if (cls.indexOf('red') !== -1) el.style.animation = 'neonRed 3s ease-in-out infinite';
                        else if (cls.indexOf('orange') !== -1) el.style.animation = 'neonOrange 3s ease-in-out infinite';
                        else if (cls.indexOf('green') !== -1) el.style.animation = 'neonGreen 3s ease-in-out infinite';
                    }, 300);
                }
                prevValues[id] = val;
            });
        }, 2000);
    };

    // ── AUDIO SYSTEM ──
    window.HCCAudio = {
        ctx: null,
        init: function() {
            document.addEventListener('click', function() {
                if (!window.HCCAudio.ctx) {
                    try { window.HCCAudio.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
                    catch(e) {}
                }
                if (window.HCCAudio.ctx && window.HCCAudio.ctx.state === 'suspended') {
                    window.HCCAudio.ctx.resume();
                }
            }, { once: true });
        },
        tone: function(freq, dur, vol, type) {
            var ctx = this.ctx;
            if (!ctx || ctx.state === 'suspended') return;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = freq; osc.type = type || 'sine';
            gain.gain.setValueAtTime(vol || 0.015, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
        },
        chirp: function() { this.tone(1200, 0.04, 0.012, 'sine'); },
        alert: function() {
            this.tone(440, 0.08, 0.02, 'square');
            var self = this;
            setTimeout(function() { self.tone(330, 0.06, 0.015, 'square'); }, 80);
        },
        down: function() {
            this.tone(200, 0.15, 0.025, 'sawtooth');
            var self = this;
            setTimeout(function() { self.tone(150, 0.2, 0.02, 'sawtooth'); }, 150);
        }
    };
})();
