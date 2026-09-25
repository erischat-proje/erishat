(() => {
    'use strict';

    const CUPS_OPTIONS = [
        ['1', '1 Numaralı Kupa'],
        ['2', '2 Numaralı Kupa'],
        ['3', '3 Numaralı Kupa'],
        ['4', '4 Numaralı Kupa']
    ];

    const CupsGame = {
        options: CUPS_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #20132b 0%, #0c0714 100%); border-radius:14px; border:1px solid rgba(168,85,247,0.3); padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box;">
                    <div style="font-size:12px; color:#e9d5ff; font-weight:700; margin-bottom:16px; text-shadow:0 0 10px rgba(168,85,247,0.5);">
                        🥤 DÖRT KUPA • Altını Saklayan Kupayı Seç
                    </div>
                    
                    <!-- Tam 4 Adet Profesyonel Kupa -->
                    <div style="display:flex; gap:12px; justify-content:center; align-items:center;" id="proCupsContainer">
                        <div class="pro-cup" data-cup="1" style="width:50px; height:65px; background:linear-gradient(135deg, #4c1d95, #2e1065); border:2px solid #a855f7; border-radius:10px 10px 6px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 15px rgba(168,85,247,0.3); transition:all 0.3s;">
                            <span style="font-size:22px;">🥤</span>
                            <span style="font-size:10px; color:#f3e8ff; font-weight:bold; margin-top:2px;">1</span>
                        </div>
                        <div class="pro-cup" data-cup="2" style="width:50px; height:65px; background:linear-gradient(135deg, #4c1d95, #2e1065); border:2px solid #a855f7; border-radius:10px 10px 6px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 15px rgba(168,85,247,0.3); transition:all 0.3s;">
                            <span style="font-size:22px;">🥤</span>
                            <span style="font-size:10px; color:#f3e8ff; font-weight:bold; margin-top:2px;">2</span>
                        </div>
                        <div class="pro-cup" data-cup="3" style="width:50px; height:65px; background:linear-gradient(135deg, #4c1d95, #2e1065); border:2px solid #a855f7; border-radius:10px 10px 6px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 15px rgba(168,85,247,0.3); transition:all 0.3s;">
                            <span style="font-size:22px;">🥤</span>
                            <span style="font-size:10px; color:#f3e8ff; font-weight:bold; margin-top:2px;">3</span>
                        </div>
                        <div class="pro-cup" data-cup="4" style="width:50px; height:65px; background:linear-gradient(135deg, #4c1d95, #2e1065); border:2px solid #a855f7; border-radius:10px 10px 6px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 15px rgba(168,85,247,0.3); transition:all 0.3s;">
                            <span style="font-size:22px;">🥤</span>
                            <span style="font-size:10px; color:#f3e8ff; font-weight:bold; margin-top:2px;">4</span>
                        </div>
                    </div>
                    
                    <div id="cupsStatusText" style="font-size:11px; color:#c084fc; margin-top:16px; font-weight:600; min-height:16px;">Bahsini yap ve kupalardan birini seç!</div>
                </div>
            `;

            // Kullanıcı arayüzdeki kupalara doğrudan tıklayarak da seçim yapabilsin
            const cupElements = container.querySelectorAll('.pro-cup');
            cupElements.forEach(cup => {
                cup.onclick = () => {
                    cupElements.forEach(c => c.style.borderColor = '#a855f7');
                    cup.style.borderColor = '#facc15';
                    const selectEl = document.querySelector('[data-choice]');
                    if (selectEl) selectEl.value = cup.dataset.cup;
                };
            });
        },

        async animate(container, data) {
            const statusText = document.getElementById('cupsStatusText');
            const winningCup = String(data?.winning_cup || data?.winningIndex || Math.floor(Math.random() * 4) + 1);

            if (statusText) statusText.textContent = '🔄 Kupalar karıştırılıyor ve heyecan zirvede...';

            return new Promise(resolve => {
                setTimeout(() => {
                    const cups = container.querySelectorAll('.pro-cup');
                    cups.forEach(cup => {
                        if (cup.dataset.cup === winningCup) {
                            cup.style.transform = 'translateY(-12px) scale(1.08)';
                            cup.style.borderColor = '#22c55e';
                            cup.style.background = 'linear-gradient(135deg, #166534, #14532d)';
                            cup.querySelector('span').textContent = '🪙';
                        } else {
                            cup.style.opacity = '0.5';
                        }
                    });

                    if (statusText) {
                        statusText.textContent = data?.result === 'win' ? '🎉 Tebrikler! Altını buldun!' : '❌ Maalesef boş kupa! Kazanan: Kupa ' + winningCup;
                    }
                    setTimeout(resolve, 1500);
                }, 2000);
            });
        }
    };

    window.ErisGameCups = CupsGame;
})();
