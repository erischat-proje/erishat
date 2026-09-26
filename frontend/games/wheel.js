(() => {
    'use strict';

    const WHEEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
    const WHEEL_OPTIONS = [
        ['red','Kırmızı'], ['orange','Turuncu'], ['yellow','Sarı'], ['lime','Lime'], ['green','Yeşil'],
        ['cyan','Camgöbeği'], ['blue','Mavi'], ['violet','Mor'], ['pink','Pembe']
    ];

    let currentRotation = 0;

    const WheelGame = {
        options: WHEEL_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="position:relative; width:220px; height:220px; display:flex; align-items:center; justify-content:center; margin:auto;">
                    <div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:18px solid #facc15; z-index:20; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
                    <canvas id="proWheelCanvas" width="220" height="220" style="width:100%; height:100%; border-radius:50%; box-shadow: 0 0 25px rgba(138,92,255,0.4), inset 0 0 15px rgba(0,0,0,0.6); border:4px solid #3b2a5b;"></canvas>
                </div>
                <div style="font-size:11px; color:#c4b5fd; margin-top:10px; text-align:center; font-weight:600;">9 renkten birini seç, rengin üzerine bahis yap.</div>
            `;
            this.drawWheel(currentRotation);
        },

        drawWheel(angleDeg) {
            const canvas = document.getElementById('proWheelCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const center = canvas.width / 2;
            const radius = center - 6;
            const sliceAngle = (2 * Math.PI) / WHEEL_COLORS.length;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate((angleDeg * Math.PI) / 180);
            ctx.translate(-center, -center);

            for (let i = 0; i < WHEEL_COLORS.length; i++) {
                ctx.beginPath();
                ctx.moveTo(center, center);
                ctx.arc(center, center, radius, i * sliceAngle, (i + 1) * sliceAngle);
                ctx.closePath();
                ctx.fillStyle = WHEEL_COLORS[i];
                ctx.fill();
                ctx.strokeStyle = '#1e1b2e';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.save();
                ctx.translate(center, center);
                ctx.rotate(i * sliceAngle + sliceAngle / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillStyle = '#fff';
                ctx.fillText(WHEEL_OPTIONS[i][1], radius - 13, 4);
                ctx.restore();
            }
            ctx.restore();

            ctx.beginPath();
            ctx.arc(center, center, 22, 0, 2 * Math.PI);
            ctx.fillStyle = '#181028';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#a77aff';
            ctx.stroke();
        },

        async animate(container, data) {
            const fromResult = WHEEL_OPTIONS.findIndex(([key]) => key === data?.result_key || key === data?.result);
            const winningIndex = fromResult >= 0 ? fromResult : (typeof data?.winning_index === 'number' && data.winning_index >= 0 ? data.winning_index : 0);
            const sliceDeg = 360 / WHEEL_COLORS.length;
            const targetSliceAngle = winningIndex * sliceDeg + (sliceDeg / 2);
            const targetRotation = (270 - targetSliceAngle + 360) % 360;
            const finalAngle = currentRotation + 360 * 6 + ((targetRotation - currentRotation % 360 + 360) % 360);

            const startTime = performance.now();
            const duration = 4000;

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const easeProgress = 1 - Math.pow(1 - progress, 3);
                    const currentDeg = currentRotation + (finalAngle - currentRotation) * easeProgress;
                    this.drawWheel(currentDeg);

                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        currentRotation = finalAngle % 360;
                        this.drawWheel(currentRotation);
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            });
        }
    };

    window.ErisGameWheel = WheelGame;
})();
