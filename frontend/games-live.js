(() => {
  'use strict';
  const labels = {roulette:'🎰 Rulet',cups:'🥤 4 Kupa',horse_race:'🐎 At Yarışı',blackjack:'🃏 Blackjack',crash:'🚀 Crash',vault:'🎁 Kasa Açma',wheel:'🎡 Şans Çarkı'};
  const choices = {
    cups:[['cup_1','1. kupa'],['cup_2','2. kupa'],['cup_3','3. kupa'],['cup_4','4. kupa']],
    horse_race:Array.from({length:7},(_,i)=>[`horse_${i+1}`,`${i+1}. at`]),
    roulette:[['rose','Gül'],['heart','Kalp'],['star','Yıldız'],['diamond','Elmas'],['crown','Taç'],['gift','Hediye'],['fire','Ateş'],['gem','Mücevher'],['jackpot','Jackpot']],
    wheel:[['small','Küçük'],['medium','Orta'],['large','Büyük'],['special','Özel'],['grand','Büyük ödül']]
  };
  const api = (path,options) => window.ErisPlatform.api(path,options);
  let modal;
  function open(scope='main',roomId=null,selected=null){
    modal?.remove();
    modal=document.createElement('div');
    modal.id='erisGamesModal';
    modal.style.cssText='position:fixed;inset:0;z-index:1100;background:#020107e8;display:grid;place-items:center;padding:12px;color:#fff';
    modal.innerHTML='<div style="width:min(480px,100%);max-height:90vh;overflow:auto;background:#100d16;border:1px solid #ffffff25;border-radius:20px;padding:17px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="font-size:19px;margin:0">Oyun merkezi</h2><button type="button" data-close aria-label="Kapat">×</button></div><p style="color:#a9a0b3;font-size:12px">Ücretsiz oyunlar. Sonuçlar gerçek oyun API’sinden gelir; para ödülü yoktur.</p><div data-games></div><div data-result role="status" style="margin-top:12px;white-space:pre-wrap"></div></div>';
    document.body.append(modal);
    modal.querySelector('[data-close]').onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove()};
    const actualRoom=roomId||window.ErisCurrentRoomId||window.currentRoomId||null;
    const roomMode=scope==='room';
    if(roomMode&&!actualRoom){modal.querySelector('[data-result]').textContent='Önce bir odaya gir.';return}
    const keys=roomMode?['roulette','cups','horse_race','wheel']:['blackjack','crash','vault'];
    const container=modal.querySelector('[data-games]');
    keys.forEach(key=>{
      const row=document.createElement('div');row.style.cssText='border:1px solid #ffffff18;border-radius:14px;padding:11px;margin:7px 0';
      const title=document.createElement('b');title.textContent=labels[key];row.append(title);
      const selection=choices[key];let select;
      if(selection){select=document.createElement('select');select.setAttribute('aria-label',labels[key]+' seçimi');select.style.cssText='display:block;width:100%;margin:8px 0;padding:9px;background:#211b2b;color:#fff;border:1px solid #ffffff25;border-radius:9px';selection.forEach(([value,label])=>{const opt=document.createElement('option');opt.value=value;opt.textContent=label;select.append(opt)});row.append(select)}
      const button=document.createElement('button');button.type='button';button.textContent='Oyna';button.style.cssText='display:block;margin-top:8px;padding:9px 15px;border:0;border-radius:10px;background:#8a5cff;color:#fff';
      button.onclick=async()=>{
        const result=modal.querySelector('[data-result]');button.disabled=true;result.textContent='Oyun başlıyor…';
        try{
          const payload={};if(roomMode)payload.room_id=actualRoom;if(select)payload.choice=select.value;
          const data=await api(`/games/${key}/play`,{method:'POST',body:JSON.stringify(payload)});
          result.textContent=`${labels[key]} • sonuç: ${String(data.result||'devam ediyor')}\nTur: ${data.data?.round_id||data.id||'—'}`;
          result.querySelectorAll('button').forEach(x=>x.remove());
          if(key==='blackjack'&&data.result==='pending')addBlackjackControls(result,data.data?.round_id);
        }catch(e){result.textContent=e.message||'Oyun başlatılamadı.'}finally{button.disabled=false}
      };
      row.append(button);container.append(row);
    });
    if(selected&&keys.includes(selected))container.querySelectorAll('button')[keys.indexOf(selected)]?.focus();
  }
  function addBlackjackControls(result,round){
    for(const [action,label] of [['hit','Kart çek'],['stand','Dur']]){
      const control=document.createElement('button');control.textContent=label;control.style.cssText='margin:8px 7px 0 0;padding:9px;border:0;border-radius:9px;background:#754cff;color:#fff';
      control.onclick=async()=>{try{const next=await api(`/games/blackjack/${encodeURIComponent(round)}/action`,{method:'POST',body:JSON.stringify({action})});result.textContent=`🃏 Blackjack • sonuç: ${next.result}\nDurum: ${next.status}`;if(next.status==='open')addBlackjackControls(result,round)}catch(e){result.textContent=e.message||'Oyun sürdürülemedi.'}};
      result.append(control);
    }
  }
  window.ErisChatGames={open};
})();
