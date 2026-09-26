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
                <div style="width:100%;min-height:230px;background:radial-gradient(ellipse at 50% 105%,#b7791f25,transparent 55%),linear-gradient(145deg,#18140f,#08090b);border-radius:18px;border:1px solid #d6a75055;padding:18px;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;overflow:hidden">
                    <div style="font-size:10px;color:#f4d58a;font-weight:900;letter-spacing:2px;margin-bottom:15px">SECURITY VAULT · 03 LOCKS</div>
                    <div id="vaultBox" style="position:relative;width:150px;height:112px;background:linear-gradient(135deg,#59616a,#242a31 35%,#11151a 72%,#343a40);border:3px solid #bd914e;border-radius:13px;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 18px #000b,0 16px 30px #0009;transform-style:preserve-3d">
                        <div style="position:absolute;inset:7px;border:1px solid #ffffff25;border-radius:7px;pointer-events:none"></div>
                        <div style="position:absolute;left:8px;top:8px;width:7px;height:7px;border-radius:50%;background:#e6c274;box-shadow:126px 0 #e6c274,0 86px #e6c274,126px 86px #e6c274"></div>
                        <div style="position:absolute;left:0;right:0;top:19px;height:2px;background:#ffffff12"></div>
                        <div id="vaultDial" style="width:64px;height:64px;border-radius:50%;border:6px solid #d4ad64;background:radial-gradient(circle,#424b51,#1a1e22 65%);display:grid;place-items:center;color:#f5d78c;font-size:22px;font-weight:900;box-shadow:0 0 0 4px #101317,inset 0 0 14px #000b;transition:transform 1.2s cubic-bezier(.2,.7,.2,1);">🔒</div>
                    </div>
                    <div id="vaultStatusText" style="font-size:11px;color:#d9c79c;margin-top:15px;font-weight:700;text-align:center;letter-spacing:.3px">Kilidi seç ve kasayı aç.</div>
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
