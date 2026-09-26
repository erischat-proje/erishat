(() => {
    'use strict';

    const ROULETTE_OPTIONS = [
        ['rose','Gül'], ['heart','Kalp'], ['star','Yıldız'],
        ['diamond','Elmas'], ['crown','Taç'], ['gift','Hediye'],
        ['fire','Ateş'], ['gem','Mücevher'], ['jackpot','Jackpot']
    ];

    let wheelAngle = 0;

    const RouletteGame = {
        options: ROULETTE_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="position:relative; width:220px; height:220px; display:flex; align-items:center; justify-content:center; margin:auto;">
                    <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-top:14px solid #facc15; z-index:30;"></div>
                    <canvas id="proRouletteCanvas" width="220" height="220" style="width:100%; height:100%; border-radius:50%; border:5px solid #1a1528;"></canvas>
                    <div style="position:absolute; width:45px; height:45px; background:#120d1c; border-radius:50%; border:3px solid #facc15; display:flex; align-items:center; justify-content:center;">🎰</div>
                </div>
                <div style="font-size:11px; color:#c4b5fd; margin-top:10px; text-align:center; font-weight:600;">Avrupa Ruleti</div>
            `;
            this.drawRoulette(wheelAngle);
        },

        drawRoulette(angleDeg) {
            const canvas = document.getElementById('proRouletteCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const center = canvas.width / 2;
            const outerRadius = center - 4;
            const innerRadius = 55;
            const pockets = ROULETTE_OPTIONS.length;
            const sliceAngle = (2 * Math.PI) / pockets;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate((angleDeg * Math.PI) / 180);
            ctx.translate(-center, -center);

            for (let i = 0; i < pockets; i++) {
                ctx.beginPath();
                const startAngle = i * sliceAngle;
                const endAngle = (i + 1) * sliceAngle;
                ctx.arc(center, center, outerRadius, startAngle, endAngle);
                ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
                ctx.closePath();

                ctx.fillStyle = ['#dc2626','#e11d48','#a855f7','#2563eb','#eab308','#ec4899','#f97316','#14b8a6','#16a34a'][i];

                ctx.fill();
                ctx.strokeStyle = '#3a3052';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
            ctx.restore();
        },

        async animate(container, data) {
            const canvas = document.getElementById('proRouletteCanvas');
            if (!canvas) return;

            const extraSpins = 360 * 5;
            const segment = Math.max(0, ROULETTE_OPTIONS.findIndex(([key]) => key === data?.result_key));
            const randomOffset = (360 - ((segment + 0.5) * (360 / ROULETTE_OPTIONS.length))) % 360;
            const finalAngle = wheelAngle + extraSpins + randomOffset;
            const startTime = performance.now();
            const duration = 4000;

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const current = wheelAngle + (finalAngle - wheelAngle) * ease;
                    this.drawRoulette(current);

                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        wheelAngle = finalAngle % 360;
                        this.drawRoulette(wheelAngle);
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            });
        }
    };

    window.ErisGameRoulette = RouletteGame;
})();
