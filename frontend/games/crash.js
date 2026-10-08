(() => {
    'use strict';

    const CRASH_MULTIPLIERS = [
        ['1.5', '1.5x'],
        ['2.0', '2.0x'],
        ['3.0', '3.0x'],
        ['5.0', '5.0x']
    ];

    const CrashGame = {
        options: CRASH_MULTIPLIERS,

        render(container) {
            container.innerHTML = `
              <div class="crash-flight" style="position:relative;height:265px;overflow:hidden;border-radius:20px;background:radial-gradient(ellipse at 65% 15%,#243653,#101528 48%,#080b17);border:1px solid #52658b55;box-shadow:inset 0 0 50px #080d20,0 12px 35px #0005">
                <canvas id="proCrashCanvas" width="600" height="400" style="width:100%;height:100%;display:block"></canvas>
                <div style="position:absolute;top:15px;left:16px;font-size:10px;letter-spacing:2px;color:#92b5d9;font-weight:900">ERIS CRASH · LIVE</div>
                <div id="crashMultiplierText" style="position:absolute;top:43px;left:0;width:100%;text-align:center;font-size:clamp(36px,9vw,58px);font-weight:950;color:#45f6ad;text-shadow:0 0 28px #22c55e88;pointer-events:none">1.00x</div>
                <div style="position:absolute;bottom:12px;left:16px;color:#8193b5;font-size:10px;letter-spacing:1px">🚀 CANLI UÇUŞ GRAFİĞİ</div>
              </div>`;
            this.drawScene(1, 0);
        },

        drawScene(multiplier, progress) {
            const canvas = document.getElementById('proCrashCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const w = canvas.width, h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            ctx.strokeStyle = 'rgba(132,173,231,.09)';
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
            gradient.addColorStop(0, '#2563eb');
            gradient.addColorStop(.5, '#20c9f3');
            gradient.addColorStop(1, '#54ffad');

            ctx.beginPath();
            ctx.moveTo(sx, sy);
            for (let i = 1; i <= 80; i++) {
                const t = p * i / 80;
                ctx.lineTo(sx + t * (w - 100), sy - Math.pow(t, 1.6) * (h - 155));
            }
            ctx.strokeStyle = '#28eeb966';
            ctx.lineWidth = 15;
            ctx.shadowBlur = 22;
            ctx.shadowColor = '#34e9bd';
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 5;
            ctx.stroke();

            ctx.save();
            ctx.translate(ex, ey);
            ctx.rotate(-Math.atan2(1.6 * Math.pow(Math.max(p,.01),.6) * (h - 155), w - 100));
            ctx.font = '46px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = '#64ffe0';
            ctx.shadowBlur = 20;
            ctx.fillText('🚀', 0, 0);
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

                if (status === 'open') {
                    text.textContent = '⏳ ' + Number(state.betting_remaining || 0) + ' sn';
                    text.style.color = '#facc15';
                } else if (status === 'finished') {
                    text.textContent = '💥 ' + multiplier.toFixed(2) + 'x';
                    text.style.color = '#fb7185';
                } else {
                    text.textContent = shown.toFixed(2) + 'x';
                    text.style.color = '#45f6ad';
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
                            textEl.style.color = data?.result === 'win' ? '#22c55e' : '#ef4444';
                        }
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            });
        }
    };

    window.ErisGameCrash = CrashGame;
})();
