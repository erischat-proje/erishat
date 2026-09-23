/* ErisChat  controls: fills the remaining visible product flows without replacing the core shell. */
(() => {
  'use strict';
  if (window.__ERIS_DEMO_CONTROLS__) return;
  window.__ERIS_DEMO_CONTROLS__ = true;
  const api = (path, options = {}) => window.ErisPlatform?.api(path, options) ?? Promise.reject(new Error('Platform hazır değil'));
  const esc = v => String(v ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const panel = () => document.querySelector('#ed-games')?.parentElement;
  const addCss = () => { if (document.getElementById('edExtraCss')) return; const s=document.createElement('style'); s.id='edExtraCss'; s.textContent='.ed-extra{margin-top:9px;padding:11px;border:1px solid #ffffff10;border-radius:14px;background:#0e0b14}.ed-extra h3{font-size:11px;margin:0 0 8px}.ed-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.ed-mini button{border:1px solid #ffffff12;background:#ffffff06;color:#fff;border-radius:9px;padding:8px 4px;font-size:8px}.ed-extra input,.ed-extra select{width:100%;box-sizing:border-box;background:#ffffff08;border:1px solid #ffffff12;color:#fff;border-radius:9px;padding:8px;margin:3px 0;font-size:9px}.ed-extra .out{margin-top:7px;color:#bdb5c4;font-size:9px;line-height:1.5}.ed-game{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.ed-game button{min-height:55px;border:1px solid #ffffff12;background:#15111d;color:#fff;border-radius:12px;font-size:10px}.ed-game button:hover{border-color:#8a5cff66}.ed-green{color:#78e0a2}.ed-red{color:#ff829b}'; document.head.appendChild(s); };
  const mkBtn=(text,fn)=>{const b=document.createElement('button');b.textContent=text;b.onclick=fn;return b;};
  async function games(){
    const p=document.querySelector('#ed-games'); if(!p) return;
    const existing=p.querySelector('.ed-real-games'); if(existing) return;
    const box=document.createElement('div');box.className='ed-extra ed-real-games';box.innerHTML='<h3>🎮 Oynanabilir </h3><div class="ed-game" id="edRoulette"></div><div class="ed-extra" style="margin-top:7px"><h3>🥤 4 Kupa</h3><input id="edCupAmount" type="number" min="1" value="100"><div class="ed-mini" id="edCups"></div><div class="out" id="edCupOut"></div></div><div class="out" id="edRouletteOut"></div>';
    p.appendChild(box);
    const amount=document.createElement('input');amount.id='edRouletteAmount';amount.type='number';amount.min='1';amount.value='100';amount.style.cssText='width:100%;box-sizing:border-box;background:#ffffff08;border:1px solid #ffffff12;color:#fff;border-radius:9px;padding:8px;margin:3px 0;font-size:9px';box.insertBefore(amount,box.querySelector('#edRoulette'));
    const roulette=box.querySelector('#edRoulette');['rose','heart','star','diamond','crown','gift','fire','gem','jackpot'].forEach(k=>roulette.append(mkBtn(k,async()=>{const out=box.querySelector('#edRouletteOut');try{const r=await api('/game/bet',{method:'POST',body:JSON.stringify({choice:k,amount:Number(amount.value)||1})});out.innerHTML=`Sonuç: <b>${esc(r.result)}</b> • ödeme: <b>${r.payout}</b> Lidya`;}catch(e){out.textContent=e.message}})));
    const cups=box.querySelector('#edCups');['cup_1','cup_2','cup_3','cup_4'].forEach(k=>cups.append(mkBtn(k.replace('_',' ').toUpperCase(),async()=>{try{const r=await api('/game/cups',{method:'POST',body:JSON.stringify({choice:k,amount:Number(box.querySelector('#edCupAmount').value)||1})});box.querySelector('#edCupOut').innerHTML=`Seçim: <b>${r.choice}</b> • gelen: <b>${r.result}</b> • ödeme: <b>${r.payout}</b> Lidya`;}catch(e){box.querySelector('#edCupOut').textContent=e.message}})));
  }
  async function discover(){
    const p=document.querySelector('#ed-discover');if(!p||p.querySelector('.ed-discovery-extra'))return;
    const box=document.createElement('div');box.className='ed-extra ed-discovery-extra';box.innerHTML='<h3>⚙️ Keşif tercihleri</h3><select id="edGender"><option value="any">Herkes</option><option value="female">Kadın</option><option value="male">Erkek</option></select><label style="display:flex;gap:6px;align-items:center;font-size:9px"><input id="edRandomEnabled" type="checkbox" checked> Rastgele eşleşmeye izin ver</label><button id="edSaveDiscovery" class="ed-btn">Kaydet</button><div class="out" id="edDiscOut"></div>';
    p.appendChild(box);try{const x=await api('/me/discovery');box.querySelector('#edGender').value=x.gender_filter;box.querySelector('#edRandomEnabled').checked=x.random_enabled}catch(e){}box.querySelector('#edSaveDiscovery').onclick=async()=>{try{await api('/me/discovery',{method:'PATCH',body:JSON.stringify({gender_filter:box.querySelector('#edGender').value,random_enabled:box.querySelector('#edRandomEnabled').checked})});box.querySelector('#edDiscOut').textContent='Keşif tercihleri kaydedildi.'}catch(e){box.querySelector('#edDiscOut').textContent=e.message}};
  }
  async function profile(){
    const p=document.querySelector('#ed-profile');if(!p||p.querySelector('.ed-profile-extra'))return;const box=document.createElement('div');box.className='ed-extra ed-profile-extra';box.innerHTML='<h3>✏️ Profil düzenleme</h3><input id="edNick" placeholder="Yeni kullanıcı adı"><input id="edAvatar" placeholder="Avatar emoji"><button id="edProfileSave" class="ed-btn">Profili kaydet</button><div class="out" id="edProfileOut"></div>';p.appendChild(box);box.querySelector('#edProfileSave').onclick=async()=>{try{const r=await api('/me',{method:'PATCH',body:JSON.stringify({nickname:box.querySelector('#edNick').value.trim()||undefined,avatar:box.querySelector('#edAvatar').value.trim()||undefined})});box.querySelector('#edProfileOut').textContent=`Profil güncellendi: ${r.nickname}`;}catch(e){box.querySelector('#edProfileOut').textContent=e.message}};
  }
  function hook(){addCss();const observer=new MutationObserver(()=>{games();discover();profile();});observer.observe(document.body,{childList:true,subtree:true});}
  hook();
  window.ErisChatDemoControls={games,discover,profile};
})();

(() => {
  const load = () => {
    if (document.querySelector('script[data-eris--complete]')) return;
    const s=document.createElement('script');s.src='./-complete-live.js';s.async=false;s.setAttribute('data-eris--complete','1');s.onerror=()=>console.warn('[ErisChat] complete  layer unavailable');document.body.appendChild(s);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
