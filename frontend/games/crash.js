(() => {
    'use strict';

    const CRASH_MULTIPLIERS = [
        ['1.2', '1.2x (Düşük Risk)'],
        ['1.5', '1.5x (Temkinli)'],
        ['2.0', '2.0x (Orta Risk)'],
        ['3.0', '3.0x (Yüksek Risk)'],
        ['5.0', '5.0x (Kritik Risk)']
    ];

    const CrashGame = {
        options: CRASH_MULTIPLIERS,

        render(container) {
            container.innerHTML = `
                <div style="position:relative; width:100%; height:200px; display:flex; flex-direction:column; align-items:center; justify-content:center; background:radial-gradient(circle, #1a1226 0%, #080510 100%); border-radius:14px; overflow:hidden; border:1px solid rgba(239,68,68,0.3);">
                    <canvas id="proCrashCanvas" width="280" height="150" style="width:100%; height:100%;"></canvas>
                    <div id="crashMultiplierText" style="position:absolute; font-size:30px; font-weight:900; color:#ef4444; text-shadow:0 0 20px rgba(239,68,68,0.6);">1.00x</div>
                </div>
                <div style="font-size:11px; color:#fca5a5; margin-top:8px; text-align:center; font-weight:600;">🚀 Hardcore Crash • Yüksek Risk, Zorlu Çarpanlar</div>
            `;
            this.drawScene(1.00, 0);
        },

        drawScene(multiplier, progress) {
            const canvas = document.getElementById('proCrashCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Arka plan risk grid çizgileri
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i < canvas.width; i += 30) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
            }
            for (let j = 0; j < canvas.height; j += 30) {
                ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(canvas.width, j); ctx.stroke();
            }

            // Sert yükselen logaritmik risk eğrisi
            ctx.beginPath();
            ctx.moveTo(20, canvas.height - 20);
            ctx.bezierCurveTo(canvas.width * 0.7, canvas.height - 20, canvas.width * 0.85, canvas.height - (progress * 50), canvas.width - 30, canvas.height - 20 - (progress * 130));
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.stroke();

            // Roket Noktası
            const rx = canvas.width - 30;
            const ry = canvas.height - 20 - (progress * 130);
            ctx.beginPath();
            ctx.arc(rx, Math.max(20, ry), 5, 0, 2 * Math.PI);
            ctx.fillStyle = '#facc15';
            ctx.fill();
            ctx.shadowBlur = 12;
            ctx.shadowColor = '#facc15';
        },

        async animate(container, data) {
            const finalMultiplier = Number(data?.multiplier || data?.payout || 1.80);
            const textEl = document.getElementById('crashMultiplierText');
            
            const startTime = performance.now();
            const duration = 4000; // 4 saniye yoğun gerilim

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Üstel ve sert zorlaştırılmış artış formülü (kolay para kazandırmaz)
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
