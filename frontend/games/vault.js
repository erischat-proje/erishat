(() => {
    'use strict';

    const VAULT_OPTIONS = [
        ['1', '1 Numaralı Kilit'],
        ['2', '2 Numaralı Kilit'],
        ['3', '3 Numaralı Kilit']
    ];

    const VaultGame = {
        options: VAULT_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #241b12 0%, #0d0905 100%); border-radius:14px; border:1px solid rgba(245,158,11,0.3); padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box;">
                    <div style="font-size:12px; color:#fde68a; font-weight:700; margin-bottom:14px;">🔐 PRO KASA SOYGUNU</div>
                    <div id="vaultBox" style="position:relative; width:90px; height:90px; background:linear-gradient(135deg, #372818, #1c140c); border:4px solid #f59e0b; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 25px rgba(245,158,11,0.4);">
                        <div id="vaultDial" style="font-size:32px;">🔒</div>
                    </div>
                    <div id="vaultStatusText" style="font-size:11px; color:#fcd34d; margin-top:16px; font-weight:600; text-align:center;">Şifreyi seç ve kasayı aç!</div>
                </div>
            `;
        },

        async animate(container, data) {
            const vaultBox = document.getElementById('vaultBox');
            const vaultDial = document.getElementById('vaultDial');
            const statusText = document.getElementById('vaultStatusText');
            const isWin = data?.result === 'win';

            if (statusText) statusText.textContent = '⚙️ Şifre test ediliyor...';
            if (vaultDial) vaultDial.style.transform = 'rotate(1080deg)';

            return new Promise(resolve => {
                setTimeout(() => {
                    if (vaultBox && vaultDial) {
                        vaultBox.style.borderColor = isWin ? '#22c55e' : '#ef4444';
                        vaultDial.textContent = isWin ? '💰' : '❌';
                    }
                    if (statusText) {
                        statusText.textContent = isWin ? '🎉 Kasa açıldı!' : '❌ Kasa kilitli kaldı!';
                    }
                    setTimeout(resolve, 2000);
                }, 3000);
            });
        }
    };

    window.ErisGameVault = VaultGame;
})();
