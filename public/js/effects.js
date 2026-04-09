(function() {
    'use strict';

    // ── PARTICLE FIELD ──
    window.addParticleField = function(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.3;';
        container.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        var particles = [];
        var colors = ['#00B7FF', '#FF00B2', '#00ff88', '#00d4ff'];

        function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
        resize();
        window.addEventListener('resize', resize);

        for (var i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * canvas.width, y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
                size: Math.random() * 2 + 0.5, color: colors[Math.floor(Math.random() * colors.length)],
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
                var glow = 0.5 + Math.sin(p.pulse) * 0.3;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color; ctx.globalAlpha = glow; ctx.fill();
                for (var j = i + 1; j < particles.length; j++) {
                    var dx = particles[j].x - p.x, dy = particles[j].y - p.y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = p.color; ctx.globalAlpha = (1 - dist / 120) * 0.12;
                        ctx.lineWidth = 0.5; ctx.stroke();
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
        for (var i = 0; i < 25; i++) {
            var col = document.createElement('div');
            col.className = 'rain-column';
            col.style.left = (Math.random() * 100) + '%';
            col.style.animationDuration = (8 + Math.random() * 12) + 's';
            col.style.animationDelay = (Math.random() * 10) + 's';
            col.style.opacity = 0.03 + Math.random() * 0.06;
            var text = '';
            for (var j = 0; j < 30; j++) {
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
            b.style.cssText = 'position:absolute;width:14px;height:14px;pointer-events:none;' + p.css;
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
            '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="1.5" opacity="0.8"/>' +
            '<polyline points="' + points + '" fill="none" stroke="' + color + '" stroke-width="3" opacity="0.15" filter="blur(2px)"/>' +
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
