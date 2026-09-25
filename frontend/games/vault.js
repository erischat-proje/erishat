(() => {
    'use strict';

    const VAULT_OPTIONS = [
        ['bronze', '🟤 Bronz Kasa (Düşük Risk)'],
        ['silver', '⚪ Gümüş Kasa (Orta Risk)'],
        ['gold', '🟡 Altın Kasa (Yüksek Risk)'],
        ['diamond', '💎 Elmas Kasa (Kritik Risk)']
    ];

    const VaultGame = {
        options: VAULT_OPTIONS,

        render(container) {
            container.innerHTML = `
                <div style="width:100%; min-height:210px; background:radial-gradient(circle, #241b12 0%, #0d0905 100%); border-radius:14px; border:1px solid rgba(245,158,11,0.3); padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-sizing:border-box;">
                    <div style="font-size:12px; color:#fde68a; font-weight:700; margin-bottom:14px; text-shadow:0 0 10px rgba(245,158,11,0.5);">
                        🔐 PRO KASA SOYGUNU • Şifreyi Kır ve Büyük Ödülü Al
                    </div>

                    <!-- Kasa Görseli ve Kadranı -->
                    <div id="vaultBox" style="position:relative; width:90px; height:90px; background:linear-gradient(135deg, #372818, #1c140c); border:4px solid #f59e0b; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 0 25px rgba(245,158,11,0.4); transition:all 0.5s;">
                        <div id="vaultDial" style="font-size:32px; transition:transform 3s cubic-bezier(0.15, 0.85, 0.35, 1);">🔒</div>
                    </div>

                    <div id="vaultStatusText" style="font-size:11px; color:#fcd34d; margin-top:16px; font-weight:600; text-align:center;">Kasanın kilidini açmak için bahsini yap!</div>
                </div>
            `;
        },

        async animate(container, data) {
            const vaultBox = document.getElementById('vaultBox');
            const vaultDial = document.getElementById('vaultDial');
            const statusText = document.getElementById('vaultStatusText');
            
            const isWin = data?.result === 'win';

            if (statusText) statusText.textContent = '⚙️ Kadran dönüyor, şifreler test ediliyor...';
            if (vaultDial) vaultDial.style.transform = 'rotate(1080deg)';

            return new Promise(resolve => {
                setTimeout(() => {
                    if (vaultBox && vaultDial) {
                        if (isWin) {
                            vaultBox.style.borderColor = '#22c55e';
                            vaultBox.style.boxShadow = '0 0 35px rgba(34,197,94,0.6)';
                            vaultDial.textContent = '💰';
                            vaultDial.style.transform = 'rotate(1080deg) scale(1.15)';
                        } else {
                            vaultBox.style.borderColor = '#ef4444';
                            vaultBox.style.boxShadow = '0 0 35px rgba(239,68,68,0.6)';
                            vaultDial.textContent = '❌';
                        }
                    }

                    if (statusText) {
                        statusText.textContent = isWin ? '🎉 Tebrikler! Kasa açıldı ve büyük ödül senin!' : '❌ Kasa kilitli kaldı, şifre yanlış!';
                    }
                    setTimeout(resolve, 2000);
                }, 3000);
            });
        }
    };

    window.ErisGameVault = VaultGame;
})();
