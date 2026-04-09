(function() {
    'use strict';

    // Particle field background
    window.addParticleField = function(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.4;';
        container.appendChild(canvas);

        var ctx = canvas.getContext('2d');
        var particles = [];
        var colors = ['#00B7FF', '#FF00B2', '#00ff88', '#00d4ff'];

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        for (var i = 0; i < 40; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 2 + 1,
                color: colors[Math.floor(Math.random() * colors.length)],
                pulse: Math.random() * Math.PI * 2
            });
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (var i = 0; i < particles.length; i++) {
                var p = particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.pulse += 0.02;

                if (p.x < 0) p.x = canvas.width;
                if (p.x > canvas.width) p.x = 0;
                if (p.y < 0) p.y = canvas.height;
                if (p.y > canvas.height) p.y = 0;

                var glow = 0.5 + Math.sin(p.pulse) * 0.3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = glow;
                ctx.fill();

                // Connection lines
                for (var j = i + 1; j < particles.length; j++) {
                    var dx = particles[j].x - p.x;
                    var dy = particles[j].y - p.y;
                    var dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 150) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.strokeStyle = p.color;
                        ctx.globalAlpha = (1 - dist / 150) * 0.15;
                        ctx.lineWidth = 0.5;
                        ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1;
            requestAnimationFrame(draw);
        }
        draw();
    };

    // Scan line effect
    window.addScanLine = function() {
        if (document.getElementById('hcc-scanline')) return;
        var line = document.createElement('div');
        line.id = 'hcc-scanline';
        line.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:2px',
            'background:linear-gradient(90deg,transparent 5%,rgba(0,183,255,0.4) 20%,rgba(0,212,255,0.8) 50%,rgba(0,183,255,0.4) 80%,transparent 95%)',
            'pointer-events:none', 'z-index:9999',
            'box-shadow:0 0 12px rgba(0,183,255,0.4),0 0 30px rgba(0,183,255,0.15)',
            'animation:hccScanSweep 6s linear infinite'
        ].join(';');
        document.body.appendChild(line);

        if (!document.getElementById('hcc-scan-style')) {
            var s = document.createElement('style');
            s.id = 'hcc-scan-style';
            s.textContent = '@keyframes hccScanSweep{0%{top:-2px}100%{top:100%}}';
            document.head.appendChild(s);
        }
    };

    // Corner brackets on an element
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
            b.style.cssText = 'position:absolute;width:16px;height:16px;pointer-events:none;' + p.css;
            el.appendChild(b);
        });
        el.style.position = el.style.position || 'relative';
    };
})();
