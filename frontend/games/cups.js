(() => {
    'use strict';

    const CUPS_OPTIONS = [
        ['1', 'Kupa 1'],
        ['2', 'Kupa 2'],
        ['3', 'Kupa 3'],
        ['4', 'Kupa 4']
    ];

    const CupsGame = {
        options: CUPS_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #20132b 0%, #0c0714 100%); border-radius:14px; border:1px solid rgba(168,85,247,0.3); padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box;">
                    <div style="font-size:12px; color:#e9d5ff; font-weight:700; margin-bottom:16px;">🥤 DÖRT KUPA</div>
                    <div style="display:flex; gap:12px; justify-content:center; align-items:center;" id="proCupsContainer">
                        ${[1, 2, 3, 4].map(n => `
                            <div class="pro-cup" data-cup="${n}" style="width:50px; height:65px; background:linear-gradient(135deg, #4c1d95, #2e1065); border:2px solid #a855f7; border-radius:10px 10px 6px 6px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;">
                                <span style="font-size:22px;">🥤</span>
                                <span style="font-size:10px; color:#f3e8ff; font-weight:bold; margin-top:2px;">${n}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div id="cupsStatusText" style="font-size:11px; color:#c084fc; margin-top:16px; font-weight:600; min-height:16px;">Kupalardan birini seç!</div>
                </div>
            `;

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
            const statusText = container.querySelector('#cupsStatusText');
            const winningCup = String(data?.winning_cup || data?.winningIndex || '1');

            if (statusText) statusText.textContent = '🔄 Kupalar karıştırılıyor...';
            const cups = [...container.querySelectorAll('.pro-cup')];
            cups.forEach(cup => { cup.style.transition = 'transform .22s ease, opacity .2s ease, border-color .2s ease'; cup.style.transform = ''; cup.style.opacity = '1'; cup.style.borderColor = '#a855f7'; cup.querySelector('span').textContent = '🥤'; });
            for (let step = 0; step < 8; step++) {
                cups.forEach((cup, i) => { cup.style.transform = `translate(${((step + i) % 2 ? 1 : -1) * (10 + step)}px,${step % 2 ? -5 : 5}px) rotate(${step % 2 ? 7 : -7}deg)`; });
                await new Promise(resolve => setTimeout(resolve, 150));
            }
            cups.forEach(cup => cup.style.transform = '');
            await new Promise(resolve => setTimeout(resolve, 220));
            cups.forEach(cup => {
                const win = cup.dataset.cup === winningCup;
                cup.style.transform = win ? 'translateY(-12px) scale(1.08)' : '';
                cup.style.borderColor = win ? '#22c55e' : '#a855f7';
                cup.style.opacity = win ? '1' : '.55';
                if (win) cup.querySelector('span').textContent = '🪙';
            });
            if (statusText) statusText.textContent = data?.result === 'win' ? '🎉 Doğru kupa!' : `Sonuç: Kupa ${winningCup}`;
            await new Promise(resolve => setTimeout(resolve, 900));
        }
    };

    window.ErisGameCups = CupsGame;
})();
