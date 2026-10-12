(() => {
    'use strict';

    const CRASH_MULTIPLIERS = [
        ['1.5', '1.5x'],
        ['2.0', '2.0x'],
        ['3.0', '3.0x'],
        ['5.0', '5.0x']
    ];

    const MATERIALS = {
        light: {grid:'#94744224', trail:'#876529', glow:'#b18b4d40', coin:'#dfbd80', rim:'#785728', ink:'#573b1c'},
        dark: {grid:'#b2955d20', trail:'#dfbd80', glow:'#b2955d30', coin:'#715631', rim:'#dfbd80', ink:'#f0e4cb'}
    };
    const WING = 'M-12-7C-27-31-50-26-59-40c1 22 21 34 46 33 M-16-4c-19-7-30-12-38-22 M-16 1c-17-2-29-9-36-18 M-12 8c-14 7-30 2-40-7';
    const LION = 'M-8-7-3-12 3-10 8-5 6 0 11 3 9 7 4 7 2 12-6 10-10 5-12-2Z M-5-5l4 1 M4 3H0 M-4 3l2 4';
    let lastScene = [1,0];

    const CrashGame = {
        options: CRASH_MULTIPLIERS,

        render(container) {
            container.innerHTML = `
              <div class="crash-flight" data-crash-phase="open">
                <canvas id="proCrashCanvas" width="600" height="400" role="img" aria-label="Kanatlı Lidya sikkesi ve yükselen çarpan çizgisi"></canvas>
                <div class="crash-flight-caption">LİDYA CRASH · <span data-crash-phase-label>BAHİS AÇIK</span></div>
                <div id="crashMultiplierText">1.00x</div>
                <div class="crash-flight-note">KANATLI SİKKE · CANLI TUR</div>
              </div>`;
            this.drawScene(1, 0);
        },

        drawScene(multiplier, progress) {
            const canvas = document.getElementById('proCrashCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            lastScene=[multiplier,progress];
            const material=MATERIALS[document.documentElement.dataset.erisTheme==='dark'?'dark':'light'];
            const w = canvas.width, h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            ctx.strokeStyle = material.grid;
            ctx.lineWidth = 1;
            for (let x = 0; x < w; x += 50) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            }
            for (let y = 0; y < h; y += 50) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }

            const p = Math.max(0, Math.min(1, progress));
            const sx = 35, sy = h - 45;
            const ex = sx + p * (w - 100);
            const ey = sy - Math.pow(p, 1.6) * (h - 155);

            const gradient = ctx.createLinearGradient(0, h, w, 0);
            gradient.addColorStop(0, material.trail);
            gradient.addColorStop(.5, material.rim);
            gradient.addColorStop(1, material.trail);

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            for (let i = 1; i <= 80; i++) {
                const t = p * i / 80;
                ctx.lineTo(sx + t * (w - 100), sy - Math.pow(t, 1.6) * (h - 155));
            }
            ctx.strokeStyle = material.glow;
            ctx.lineWidth = 15;
            ctx.shadowBlur = 8;
            ctx.shadowColor = material.trail;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(-Math.atan2(1.6 * Math.pow(Math.max(p,.01),.6) * (h - 155), w - 100));
            // A winged coin replaces the emoji rocket; the trajectory is unchanged.
            ctx.strokeStyle=material.rim;ctx.lineWidth=2.2;
            ctx.fillStyle=material.coin;
            ctx.stroke(new Path2D(WING));
            ctx.beginPath();ctx.ellipse(0,0,23,23,0,0,Math.PI*2);ctx.fill();ctx.stroke();
            ctx.beginPath();ctx.ellipse(0,0,18,18,0,0,Math.PI*2);ctx.stroke();
            ctx.strokeStyle=material.ink;ctx.lineWidth=1.7;ctx.stroke(new Path2D(LION));
            for(let i=0;i<16;i++){
                const a=i*Math.PI/8;ctx.beginPath();
                ctx.moveTo(Math.cos(a)*20,Math.sin(a)*20);
                ctx.lineTo(Math.cos(a)*22,Math.sin(a)*22);ctx.stroke();
            }
            ctx.restore();
        },

        updateLive(container, state) {
            if (!container?.isConnected) return;
            const status = state?.status || 'open';
            const multiplier = Math.max(1, Number(state?.multiplier || 1));
            const text = container.querySelector('#crashMultiplierText');
            if (!text) return;

            if (this._frame) cancelAnimationFrame(this._frame);
            const previous = this._shownMultiplier ?? multiplier;
            const start = performance.now();
            const duration = status === 'running' ? 400 : 0;

            const paint = now => {
                if (!container.isConnected) return;
                const t = duration ? Math.min(1, (now - start) / duration) : 1;
                const shown = previous + (multiplier - previous) * t;
                this._shownMultiplier = shown;

                const flight=container.querySelector('.crash-flight');
                if(flight)flight.dataset.crashPhase=status;
                const label=container.querySelector('[data-crash-phase-label]');
                if(label)label.textContent=({open:'BAHİS AÇIK',running:'YÜKSELİYOR',finished:'TUR BİTTİ'})[status]||'CANLI TUR';
                if (status === 'open') {
                    text.textContent = '' + Number(state.betting_remaining || 0) + ' sn';
                    text.style.color = 'var(--crash-open)';
                } else if (status === 'finished') {
                    text.textContent = '' + multiplier.toFixed(2) + 'x';
                    text.style.color = 'var(--crash-finished)';
                } else {
                    text.textContent = shown.toFixed(2) + 'x';
                    text.style.color = 'var(--crash-running)';
                }

                const progress = status === 'open' ? 0 :
                    Math.min(1, Math.max(0, Math.log2(Math.max(1, shown)) / 5));
                this.drawScene(shown, progress);

                if (t < 1) this._frame = requestAnimationFrame(paint);
            };

            if (status === 'open') this._shownMultiplier = 1;
            if (status === 'finished') this._shownMultiplier = multiplier;
            this._frame = requestAnimationFrame(paint);
        },

        async animate(container, data) {
            const finalMultiplier = Number(data?.multiplier || data?.payout || 1.80);
            const textEl = document.getElementById('crashMultiplierText');
            const startTime = performance.now();
            const duration = 4000;

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const ease = Math.pow(progress, 2.5);
                    const current = 1.00 + (finalMultiplier - 1.00) * ease;
                    
                    if (textEl) textEl.textContent = current.toFixed(2) + 'x';
                    this.drawScene(current, progress);

                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        if (textEl) {
                            textEl.textContent = finalMultiplier.toFixed(2) + 'x';
                            textEl.style.color = data?.result === 'win' ? 'var(--crash-running)' : 'var(--crash-finished)';
                        }
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            });
        }
    };

    window.addEventListener('erischat:theme',()=>CrashGame.drawScene(...lastScene));
    window.ErisGameCrash = CrashGame;
})();
