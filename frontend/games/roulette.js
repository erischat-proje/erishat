(() => {
    'use strict';

    const ROULETTE_OPTIONS = [
        ['red', '🔴 Kırmızı (2x)'],
        ['black', '⚫ Siyah (2x)'],
        ['green', '🟢 Yeşil / Sıfır (14x)'],
        ['even', 'Çift Sayılar (2x)'],
        ['odd', 'Tek Sayılar (2x)']
    ];

    let wheelAngle = 0;

    const RouletteGame = {
        options: ROULETTE_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="position:relative; width:220px; height:220px; display:flex; align-items:center; justify-content:center; margin:auto;">
                    <!-- Sabit İşaretçi (Topun Düşeceği Üst Nokta) -->
                    <div style="position:absolute; top:-4px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:8px solid transparent; border-right:8px solid transparent; border-top:14px solid #facc15; z-index:30; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.6));"></div>
                    
                    <!-- Profesyonel Rulet Çarkı Canvas -->
                    <canvas id="proRouletteCanvas" width="220" height="220" style="width:100%; height:100%; border-radius:50%; box-shadow: 0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.8); border:5px solid #1a1528;"></canvas>
                    
                    <!-- Merkez Şık Kapak -->
                    <div style="position:absolute; width:45px; height:45px; background:radial-gradient(circle, #2d2442 0%, #120d1c 100%); border-radius:50%; border:3px solid #facc15; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 4px 10px rgba(0,0,0,0.5);">🎰</div>
                </div>
                <div style="font-size:11px; color:#c4b5fd; margin-top:10px; text-align:center; font-weight:600;">Avrupa Ruleti • Gerçekçi Yörünge ve Çark Hissiyatı</div>
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
            const pockets = 18; // Şık ve dengeli cep sayısı
            const sliceAngle = (2 * Math.PI) / pockets;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate((angleDeg * Math.PI) / 180);
            ctx.translate(-center, -center);

            for (let i = 0; i < pockets; i++) {
                ctx.beginPath();
                // Dış çember dilimleri
                const startAngle = i * sliceAngle;
                const endAngle = (i + 1) * sliceAngle;
                
                ctx.arc(center, center, outerRadius, startAngle, endAngle);
                ctx.arc(center, center, innerRadius, endAngle, startAngle, true);
                ctx.closePath();

                // Kırmızı, Siyah, Yeşil (Sıfır) renk dağılımı
                if (i === 0) ctx.fillStyle = '#22c55e'; // Yeşil
                else if (i % 2 === 0) ctx.fillStyle = '#dc2626'; // Kırmızı
                else ctx.fillStyle = '#171717'; // Siyah

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

            // Rastgele veya sunucudan gelen sonuca göre akıcı dönüş açıları
            const extraSpins = 360 * 5; // 5 tam tur
            const randomOffset = Math.random() * 360;
            const finalAngle = wheelAngle + extraSpins + randomOffset;

            const startTime = performance.now();
            const duration = 4000; // Kesinlikle 4 saniye süren akıcı animasyon

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Ease-out cubic yavaşlama efekti
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
