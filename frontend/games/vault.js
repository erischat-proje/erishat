(() => {
  'use strict';
  const OPTIONS = [
    ['ruby','💎 Yakut Kasası'], ['gold','👑 Altın Kasası'],
    ['crystal','🔮 Kristal Kasası'], ['mystery','🎁 Gizemli Kasa']
  ];
  const ICONS = {ruby:'💎',gold:'👑',crystal:'🔮',mystery:'🎁'};
  const NAMES = {ruby:'Yakut',gold:'Altın',crystal:'Kristal',mystery:'Gizemli'};
  const STYLE_ID = 'eris-treasure-vault-v2';
  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el=document.createElement('style'); el.id=STYLE_ID;
    el.textContent=`
      #erisGamesModal.eg-vault-mode .eg-stage{min-height:0!important;padding:0!important}
      #erisGamesModal.eg-vault-mode .ev-scene{box-sizing:border-box;width:100%;padding:16px 12px 18px;border-radius:22px;border:1px solid #aa8349;background:radial-gradient(ellipse at 50% 0%,#7850224d,transparent 70%),linear-gradient(155deg,#252137,#0b0c17);color:#ffe9ba;text-align:center;overflow:hidden}
      #erisGamesModal.eg-vault-mode .ev-title{font-weight:950;letter-spacing:2px;color:#f6d58d;font-size:15px}
      #erisGamesModal.eg-vault-mode .ev-sub{font-size:12px;color:#c9b8a2;margin:7px 0 14px;line-height:1.5}
      #erisGamesModal.eg-vault-mode .ev-vault-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}
      #erisGamesModal.eg-vault-mode .ev-chest{position:relative;min-width:0;min-height:150px;padding:12px 7px 10px;border-radius:17px;border:2px solid #8b704a;background:radial-gradient(circle at 50% 20%,#5b453d,#1a1829 80%);box-shadow:inset 0 0 16px #0008,0 6px 16px #0006;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:transform .25s,border-color .25s,box-shadow .25s}
      #erisGamesModal.eg-vault-mode .ev-chest.ev-selected{border-color:#ffe098;box-shadow:0 0 0 2px #e5b75d55,0 0 20px #f2bb4466}
      #erisGamesModal.eg-vault-mode .ev-door{position:relative;width:75px;height:78px;border:4px ridge #e3bc6e;border-radius:12px;background:linear-gradient(135deg,#626c7a,#1b2737 58%,#3a414b);display:grid;place-items:center;box-shadow:inset 0 0 13px #000c,5px 7px 12px #0007;transform-origin:left;transition:transform 1.1s cubic-bezier(.2,.7,.1,1)}
      #erisGamesModal.eg-vault-mode .ev-dial{width:43px;height:43px;border-radius:50%;border:5px double #f7d993;background:#202330;display:grid;place-items:center;font-size:22px;box-shadow:0 0 0 3px #141724}
      #erisGamesModal.eg-vault-mode .ev-chest-name{font-size:12px;font-weight:900;color:#ffe3a7}
      #erisGamesModal.eg-vault-mode .ev-chest-icon{position:absolute;top:30px;font-size:39px;opacity:0;transform:scale(.4);transition:opacity .6s,transform .7s;pointer-events:none}
      #erisGamesModal.eg-vault-mode .ev-opening .ev-dial{animation:ev-twist .6s linear infinite}
      #erisGamesModal.eg-vault-mode .ev-revealed .ev-door{transform:perspective(400px) rotateY(-112deg);opacity:.65}
      #erisGamesModal.eg-vault-mode .ev-revealed .ev-chest-icon{opacity:1;transform:scale(1)}
      #erisGamesModal.eg-vault-mode .ev-winner{border-color:#f6cc68;box-shadow:0 0 26px #f7c84d77,inset 0 0 20px #efb84833}
      #erisGamesModal.eg-vault-mode .ev-status{margin-top:13px;font-weight:850;font-size:13px;color:#f7d898;min-height:20px}
      #erisGamesModal.eg-vault-mode .ev-rules{margin-top:8px;font-size:11px;color:#c2b5a4}
      #erisGamesModal.eg-vault-mode .eg-form{gap:9px!important;padding:11px!important}
      #erisGamesModal.eg-vault-mode .ev-prize-picks{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
      #erisGamesModal.eg-vault-mode .ev-prize-picks button{padding:11px 5px!important;font-weight:900!important;white-space:normal!important}
      #erisGamesModal.eg-vault-mode .eg-stake-presets{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important}
      #erisGamesModal.eg-vault-mode [data-stake-value]{min-width:0;padding:9px 2px!important;font-size:12px!important}
      #erisGamesModal.eg-vault-mode [data-play]{width:100%;min-height:52px;border-radius:14px;background:linear-gradient(100deg,#f8d27c,#c89039)!important;color:#291b19!important;font-size:16px;font-weight:950}

      /* HAZINE KASASI FINAL COMPACT */
      #erisGamesModal.eg-vault-mode{
        padding:0!important;
        align-items:stretch!important;
      }
      #erisGamesModal.eg-vault-mode .eg-panel{
        box-sizing:border-box!important;
        width:100%!important;
        max-width:none!important;
        height:100dvh!important;
        max-height:100dvh!important;
        overflow-y:auto!important;
        overscroll-behavior:contain;
        padding:8px 12px 14px!important;
        border-radius:0!important;
      }
      #erisGamesModal.eg-vault-mode .eg-head{
        margin:0 0 4px!important;
        min-height:40px!important;
      }
      #erisGamesModal.eg-vault-mode .eg-head h2{
        font-size:19px!important;
      }
      #erisGamesModal.eg-vault-mode .eg-wallet{
        margin:3px 0!important;
        padding:6px 9px!important;
      }
      #erisGamesModal.eg-vault-mode [data-scope],
      #erisGamesModal.eg-vault-mode [data-name]{
        display:none!important;
      }
      #erisGamesModal.eg-vault-mode [data-vault-clock]{
        margin:4px 0!important;
        padding:6px!important;
        font-size:13px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-scene{
        padding:9px!important;
        border-radius:16px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-title{
        font-size:13px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-sub{
        font-size:10px!important;
        margin:3px 0 7px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-vault-grid{
        gap:7px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-chest{
        min-height:clamp(91px,14dvh,123px)!important;
        padding:6px!important;
        gap:4px!important;
        border-radius:13px!important;
        cursor:pointer;
      }
      #erisGamesModal.eg-vault-mode .ev-door{
        width:clamp(52px,9dvh,72px)!important;
        height:clamp(49px,8dvh,68px)!important;
      }
      #erisGamesModal.eg-vault-mode .ev-dial{
        width:34px!important;
        height:34px!important;
        font-size:17px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-chest-name{
        font-size:11px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-chest-icon{
        top:19px!important;
        font-size:38px!important;
        filter:drop-shadow(0 0 12px #ffd34a);
      }
      #erisGamesModal.eg-vault-mode .ev-status{
        margin-top:7px!important;
        min-height:0!important;
        font-size:11px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-rules{
        margin-top:4px!important;
        font-size:10px!important;
      }
      #erisGamesModal.eg-vault-mode [data-vault-bets]{
        padding:4px!important;
        font-size:10px!important;
      }
      #erisGamesModal.eg-vault-mode .eg-form{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:5px!important;
        margin-top:5px!important;
        padding:8px!important;
        border:1px solid #bd9457!important;
        border-radius:14px!important;
        background:linear-gradient(140deg,#31243d,#171222)!important;
      }
      #erisGamesModal.eg-vault-mode .eg-form>[data-choice-label]{
        display:none!important;
      }
      #erisGamesModal.eg-vault-mode .eg-form>.ev-prize-picks{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
      }
      #erisGamesModal.eg-vault-mode .eg-form>label{
        width:100%!important;
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:8px!important;
        font-size:11px!important;
      }
      #erisGamesModal.eg-vault-mode [data-stake]{
        width:48%!important;
        min-width:0!important;
        max-width:none!important;
        min-height:34px!important;
        padding:5px 8px!important;
        font-size:16px!important;
        color:#ffe2a2!important;
      }
      #erisGamesModal.eg-vault-mode .eg-stake-presets{
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:4px!important;
      }
      #erisGamesModal.eg-vault-mode [data-stake-value]{
        padding:7px 1px!important;
        min-height:31px!important;
        font-size:11px!important;
        border-radius:9px!important;
      }
      #erisGamesModal.eg-vault-mode [data-play]{
        min-height:42px!important;
        font-size:14px!important;
        border-radius:11px!important;
      }
      #erisGamesModal.eg-vault-mode .eg-result{
        min-height:0!important;
        margin-top:5px!important;
        padding:7px!important;
        font-size:11px!important;
      }
      #erisGamesModal.eg-vault-mode .ev-winner{
        animation:ev-treasure-glow 1.4s ease-in-out infinite alternate;
      }
      @keyframes ev-treasure-glow{
        from{box-shadow:0 0 12px #ffd15c66}
        to{box-shadow:0 0 32px #ffda72,inset 0 0 22px #ffd15c44}
      }
      @media(max-height:700px){
        #erisGamesModal.eg-vault-mode .ev-chest{
          min-height:85px!important;
        }
        #erisGamesModal.eg-vault-mode .ev-sub{
          display:none!important;
        }
      }
      @keyframes ev-twist{to{transform:rotate(360deg)}}
      @media(max-width:380px){#erisGamesModal.eg-vault-mode .ev-chest{min-height:132px}#erisGamesModal.eg-vault-mode .ev-door{width:65px;height:68px}}
    `;document.head.appendChild(el);
  }
  window.ErisGameVault = {
    options: OPTIONS,
    render(container) {
      installStyle();
      container.innerHTML=`<section class="ev-scene" data-vault-scene>
        <div class="ev-title">✦ HAZİNE KASASI ✦</div>
        <div class="ev-sub">Dört kilitli kasa, tek büyük ödül. Kazanan kasayı seç!</div>
        <div class="ev-vault-grid">${OPTIONS.map(([key,name])=>`<div class="ev-chest" data-vault-chest="${key}"><div class="ev-door"><div class="ev-dial">🔒</div></div><div class="ev-chest-icon">💰</div><div class="ev-chest-name">${name}</div></div>`).join('')}</div>
        <div class="ev-status" data-vault-status>Bir kasa seç ve bahsini yatır.</div>
        <div class="ev-rules">🎯 Kazanma şansı %25 · Doğru kasaya 3× toplam ödeme</div>
      </section>`;
      container.querySelectorAll('[data-vault-chest]').forEach(chest=>{
        chest.setAttribute('role','button');
        chest.setAttribute('tabindex','0');
        chest.setAttribute('aria-label','Kasa seç: '+chest.querySelector('.ev-chest-name').textContent);
        const choose=()=>{
          const modal=container.closest('#erisGamesModal');
          modal?.querySelector('[data-vault-pick="'+chest.dataset.vaultChest+'"]')?.click();
        };
        chest.addEventListener('click',choose);
        chest.addEventListener('keydown',e=>{
          if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}
        });
      });
    },
    setPhase(container,phase,result,selection) {
      const scene=container?.querySelector('[data-vault-scene]');if(!scene)return;
      const legacy=result && !Object.hasOwn(ICONS,result);
      const showResult=phase==='result' && !legacy;
      scene.classList.toggle('ev-opening',phase==='opening');
      scene.querySelectorAll('[data-vault-chest]').forEach(chest=>{
        const key=chest.dataset.vaultChest;
        chest.classList.toggle('ev-selected',key===selection);
        chest.classList.toggle('ev-revealed',showResult);
        chest.classList.toggle('ev-winner',showResult&&key===result);
        const dial=chest.querySelector('.ev-dial');
        const treasure=chest.querySelector('.ev-chest-icon');
        if(treasure)treasure.textContent=showResult&&key===result?'💰':'';
        if(dial)dial.textContent=showResult?(key===result?'✨':'✖'):'🔒';
      });
      const status=scene.querySelector('[data-vault-status]');
      if(status)status.textContent=phase==='opening'?'⚙️ Kilitler çözülüyor…':phase==='result'?(legacy?'Önceki tur tamamlandı. Yeni hazine turunu bekle.':`🏆 Kazanan: ${NAMES[result]||'Kasa'} Kasası!`):'🔐 Kasanı seç ve Lidya bahsini yatır.';
    },
    async animate(container,data){this.setPhase(container,'result',data?.winner||data?.result)}
  };
})();
