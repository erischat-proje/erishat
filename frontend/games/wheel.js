(() => {
    'use strict';

    const WHEEL_COLORS = [
        '#ef4444', // 1. Kırmızı
        '#f97316', // 2. Turuncu
        '#eab308', // 3. Sarı
        '#22c55e', // 4. Yeşil
        '#06b6d4', // 5. Masmavi
        '#3b82f6', // 6. Mavi
        '#8b5cf6', // 7. Mor
        '#ec4899', // 8. Pembe
        '#10b981'  // 9. Mint Yeşili
    ];

    const WHEEL_LABELS = [
        'Kırmızı', 'Turuncu', 'Sarı', 'Yeşil', 'Masmavi', 'Mavi', 'Mor', 'Pembe', 'Mint'
    ];

    let currentRotation = 0;

    const WheelGame = {
        options: WHEEL_LABELS.map((name, index) => [String(index), name]),

        render(container) {
            container.innerHTML = `
                <div style="position:relative; width:220px; height:220px; display:flex; align-items:center; justify-content:center; margin:auto;">
                    <!-- Üst İşaretçi (Ok) -->
                    <div style="position:absolute; top:-6px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:18px solid #facc15; z-index:20; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));"></div>
                    
                    <!-- Çark Kanvası -->
                    <canvas id="proWheelCanvas" width="220" height="220" style="width:100%; height:100%; border-radius:50%; box-shadow: 0 0 25px rgba(138,92,255,0.4), inset 0 0 15px rgba(0,0,0,0.6); border:4px solid #3b2a5b;"></canvas>
                </div>
                <div style="font-size:11px; color:#c4b5fd; margin-top:10px; text-align:center; font-weight:600;">9 Renkli Profesyonel Şans Çarkı • Şansını Dene</div>
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

                // Dilim üstü yazı veya numara
                ctx.save();
                ctx.translate(center, center);
                ctx.rotate(i * sliceAngle + sliceAngle / 2);
                ctx.textAlign = 'right';
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px sans-serif';
                ctx.fillText(i + 1, radius - 16, 4);
                ctx.restore();
            }
            ctx.restore();

            // Merkez Göbeği (Logo veya karmaşık nesne yok, şık profesyonel metalik kapak)
            ctx.beginPath();
            ctx.arc(center, center, 22, 0, 2 * Math.PI);
            ctx.fillStyle = '#181028';
            ctx.fill();
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#a77aff';
            ctx.stroke();
        },

        async animate(container, data) {
            const canvas = document.getElementById('proWheelCanvas');
            if (!canvas) return;

            // Sunucudan gelen sonuca göre hedef dilimi hesapla (varsayılan rastgele veya data.winning_index)
            const winningIndex = typeof data?.winning_index === 'number' ? data.winning_index : Math.floor(Math.random() * WHEEL_COLORS.length);
            const sliceDeg = 360 / WHEEL_COLORS.length;
            
            // Her zaman saat yönünde dönmesi için ek turlar (en az 5 tam tur = 1800 derece + hedef açı)
            const targetSliceAngle = winningIndex * sliceDeg + (sliceDeg / 2);
            const extraSpins = 360 * 6; // 6 tam tur
            const finalAngle = currentRotation + extraSpins + (360 - (currentRotation % 360)) + (360 - targetSliceAngle);

            const startTime = performance.now();
            const duration = 4000; // Kesinlikle en az 4 saniye akıcı dönüş

            return new Promise(resolve => {
                const step = (currentTime) => {
                    const elapsed = currentTime - startTime;
                    const progress = Math.min(elapsed / duration, 1);
                    
                    // Ease-out cubic easing (başlangıç hızlı, sonlara doğru akıcı ve yavaş duruş)
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
