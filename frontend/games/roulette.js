(() => {
    'use strict';

    const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
    const ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
    const ROULETTE_OPTIONS = [['red','🔴 Kırmızı'],['black','⚫ Siyah'],['even','Çift'],['odd','Tek'], ...Array.from({length:37},(_,n)=>[String(n),`Cep ${n}`])];

    let wheelAngle = 0;

    const RouletteGame = {
        options: ROULETTE_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="position:relative;width:min(300px,72vw);aspect-ratio:1;margin:auto;filter:drop-shadow(0 12px 22px #0009)">
                    <div style="position:absolute;z-index:4;top:-2px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:17px solid #f5d27a"></div>
                    <canvas id="proRouletteCanvas" width="360" height="360" style="width:100%;height:100%;border-radius:50%;border:8px solid #a7793e;background:#07341f"></canvas>
                    <div id="rouletteBall" style="position:absolute;left:50%;top:50%;width:11px;height:11px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#dedbd0 55%,#766d61);box-shadow:0 1px 7px #000;transform:translate(-50%,-50%)"></div>
                    <div style="position:absolute;inset:39%;border-radius:50%;border:5px solid #bd9253;background:radial-gradient(circle,#14583a,#07351f 72%);box-shadow:inset 0 0 14px #0009"></div>
                </div>
                <div id="rouletteReadout" style="font-size:13px;color:#f5d27a;margin-top:9px;text-align:center;font-weight:800">AVRUPA RULETİ · 0–36</div>
            `;
            this.drawRoulette(wheelAngle);
        },

        drawRoulette(angleDeg) {
            const canvas = document.getElementById('proRouletteCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const center = canvas.width / 2;
            const outerRadius = center - 12;
            const innerRadius = 75;
            const pockets = ORDER.length;
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

                const n = ORDER[i];
                ctx.fillStyle = n === 0 ? '#13864d' : RED.has(n) ? '#b51f2d' : '#11141c';

                ctx.fill();
                ctx.strokeStyle = '#3a3052';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.save();
                ctx.translate(center, center); ctx.rotate((i + .5) * sliceAngle);
                ctx.fillStyle = '#f3dfb1'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
                ctx.fillText(String(n), center - 22, 4); ctx.restore();
            }
            ctx.restore();
        },

        async animate(container, data) {
            const canvas = document.getElementById('proRouletteCanvas');
            if (!canvas) return;
            const number = Number(data?.winning_number ?? data?.result_key);
            const pocket = Math.max(0, ORDER.indexOf(number));
            const targetAngle = (270 - ((pocket + .5) * (360 / ORDER.length)) + 360) % 360;
            const finalAngle = wheelAngle + 360 * 6 + ((targetAngle - wheelAngle % 360 + 360) % 360);
            const ball = container.querySelector('#rouletteBall');
            const startTime = performance.now();
            const duration = 5200;

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    const ease = 1 - Math.pow(1 - progress, 3);
                    const current = wheelAngle + (finalAngle - wheelAngle) * ease;
                    this.drawRoulette(current);
                    const ballAngle = -Math.PI / 2 - progress * Math.PI * 2 * 8 + (1 - ease) * (pocket + .5) * (Math.PI * 2 / ORDER.length);
                    const ballRadius = 135 - 34 * ease;
                    if (ball) { ball.style.left = `${50 + Math.cos(ballAngle) * ballRadius / 3.6}%`; ball.style.top = `${50 + Math.sin(ballAngle) * ballRadius / 3.6}%`; }

                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        wheelAngle = finalAngle % 360;
                        this.drawRoulette(wheelAngle);
                        if (ball) { ball.style.left = '50%'; ball.style.top = '19%'; }
                        const readout = container.querySelector('#rouletteReadout');
                        if (readout) { readout.textContent = `${number} · ${data.winning_color === 'red' ? 'KIRMIZI' : data.winning_color === 'black' ? 'SİYAH' : 'YEŞİL'}`; readout.style.color = data.winning_color === 'red' ? '#fb7185' : data.winning_color === 'black' ? '#f1f5f9' : '#4ade80'; }
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            });
        }
    };

    window.ErisGameRoulette = RouletteGame;
})();
