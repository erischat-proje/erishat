(() => {
  'use strict';
  const mounted=new Map();
  window.addEventListener('lidyachat:screen-awake',()=>{for(const [root,entry] of mounted){if(!root.isConnected||!entry.valid()){mounted.delete(root);continue}entry.syncAwake?.()}});
  window.addEventListener('erischat:auth',()=>{for(const [root,entry] of mounted){if(!root.isConnected||!entry.valid()){mounted.delete(root);continue}if(entry.account!==token()){root.textContent='Hesap değişti. Ayarlar menüsünü yeniden aç.';mounted.delete(root)}}});
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const api=(p,o)=>window.ErisPlatform.api(p,o);
  const style=document.createElement('style');style.textContent=`.eps{min-width:0;color:var(--ui-ink)}.eps .eps-intro{color:var(--ui-gold);font-size:14px;line-height:1.6;margin:0 0 20px}.eps .eps-card{padding:18px;margin:14px 0;border:1px solid var(--ui-line);border-radius:20px;background:linear-gradient(140deg,var(--ui-raised),var(--ui-raised))}.eps h3{margin:0 0 8px;font-size:16px}.eps small,.eps p{color:var(--ui-gold);font-size:13px;line-height:1.6;overflow-wrap:anywhere}.eps .eps-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.eps button.eps-button{width:auto!important;height:auto!important;min-height:44px;max-width:100%;border:1px solid var(--ui-line)!important;border-radius:13px!important;padding:11px 16px!important;background:var(--ui-button);color:var(--ui-ink);font:inherit;font-size:14px!important;white-space:normal!important;cursor:pointer}.eps button:disabled{opacity:.5;cursor:wait}.eps button:focus-visible,.eps select:focus-visible{outline:2px solid var(--ui-line);outline-offset:3px}.eps select{width:100%;box-sizing:border-box;min-height:48px;padding:12px;border:1px solid var(--ui-line);border-radius:14px;background:var(--ui-panel);color:var(--ui-ink);font:inherit;font-size:14px}.eps .eps-row{display:flex;align-items:center;justify-content:space-between;gap:12px}.eps .eps-row>div{min-width:0;flex:1}.eps .eps-danger{border-color:var(--ui-danger);color:#ffbdc8;background:var(--ui-danger-bg)}.eps .eps-status{min-height:24px;color:var(--ui-gold);font-size:13px;line-height:1.6}.eps .eps-visitor{padding:15px;margin:10px 0;border:1px solid var(--ui-line);border-radius:17px;background:var(--ui-panel)}.eph-overlay .eph-dialog-content [data-erischat-profile-controls]{display:none!important}.eps-confirm-overlay{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(16,11,8,.70);box-sizing:border-box}.eps-confirm-dialog{box-sizing:border-box;width:min(100%,420px);max-height:calc(100dvh - 40px);overflow:auto;padding:28px 22px 22px;border:2px solid var(--ui-line,#bb9652);border-radius:24px;background:var(--ui-raised,#f5edda);color:var(--ui-ink,#39281b);box-shadow:0 24px 70px rgba(0,0,0,.4),inset 0 0 0 2px rgba(194,153,78,.15);text-align:center}.eps-confirm-dialog h2{font:700 26px/1.2 Georgia,serif;margin:0 0 18px;color:var(--ui-ink,#39281b)}.eps-confirm-dialog p{font-size:16px;line-height:1.65;margin:0 0 26px;color:var(--ui-ink,#39281b)}.eps-confirm-actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}.eps-confirm-actions button{min-height:48px;flex:1 1 130px;padding:10px 15px;border-radius:15px;border:1px solid var(--ui-line,#b58b49);font:600 15px/1.25 inherit;cursor:pointer;color:var(--ui-ink,#39281b);background:var(--ui-button,#ead9b6);box-shadow:inset 0 1px rgba(255,255,255,.25)}.eps-confirm-actions .eps-confirm-accept{background:linear-gradient(140deg,#e9c983,#b68a3d);color:#30200f;border-color:#9b732e}.eps-confirm-actions button:focus-visible{outline:3px solid #d3aa5b;outline-offset:3px}`;document.head.append(style);
  // Lidya theme-aware confirmation, avoids native WebView origin header.
  function lidyaConfirm(message){
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='eps-confirm-overlay';
      overlay.setAttribute('role','presentation');
      const dialog=document.createElement('section');dialog.className='eps-confirm-dialog';
      dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
      const title=document.createElement('h2');title.textContent='Hesap Silme Onayı';
      const desc=document.createElement('p');desc.textContent=message;dialog.setAttribute('aria-label','Hesap Silme Onayı');
      const actions=document.createElement('div');actions.className='eps-confirm-actions';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='İptal';cancel.className='eps-confirm-cancel';
      const accept=document.createElement('button');accept.type='button';accept.textContent='Hesabımı Sil';accept.className='eps-confirm-accept';
      let finished=false;const previous=document.activeElement;
      function close(value){if(finished)return;finished=true;document.removeEventListener('keydown',onKey,true);overlay.remove();if(previous?.isConnected)previous.focus();resolve(value)}
      function onKey(event){if(event.key==='Escape'){event.preventDefault();close(false)}else if(event.key==='Tab'){const focus= document.activeElement;if(event.shiftKey&&focus===cancel){event.preventDefault();accept.focus()}else if(!event.shiftKey&&focus===accept){event.preventDefault();cancel.focus()}}}
      cancel.addEventListener('click',()=>close(false));accept.addEventListener('click',()=>close(true));
      overlay.addEventListener('click',event=>{if(event.target===overlay)close(false)});
      actions.append(cancel,accept);dialog.append(title,desc,actions);overlay.append(dialog);document.body.append(overlay);
      document.addEventListener('keydown',onKey,true);cancel.focus();
    });
  }
  function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
  function button(text,fn){const b=el('button','eps-button',text);b.type='button';b.onclick=fn;return b}
  async function render(root,valid=()=>true){
    const account=token();const active=()=>root.isConnected&&valid()&&account===token();let busy=false,privacy=null,restriction=null;
    for(const [r,e] of mounted)if(!r.isConnected||!e.valid())mounted.delete(r);
    mounted.set(root,{account,valid});
    root.classList.add('eps');root.replaceChildren();root.append(el('p','eps-intro','Bildirimlerini, mesaj tercihlerini ve hesabını tek yerden yönet.'));
    const status=el('p','eps-status');status.setAttribute('role','status');
    function card(title,description){const c=el('section','eps-card');c.append(el('h3','',title),el('p','',description));root.append(c);return c}
    const notification=card('Uygulama bildirimleri','Uygulama içindeki bildirim listesini ve yeni bildirim kartlarını açıp kapat.');
    const noticeState=el('small','', 'Yükleniyor…'),toggle=button('Yükleniyor…',async()=>{if(!privacy)return;await save(async()=>{const next=!privacy.hide_notifications;const result=await api('/me/privacy',{method:'PATCH',body:JSON.stringify({hide_notifications:next})});if(!active())return;privacy=result;window.ErisNotifications?.apply?.(privacy);privacy=await api('/me/privacy');if(active()){if(privacy.hide_notifications!==next)throw Error('Bildirim ayarı doğrulanamadı.');window.ErisNotifications?.apply?.(privacy);window.dispatchEvent(new CustomEvent('erischat:privacy',{detail:privacy}))}})});toggle.setAttribute('role','switch');toggle.setAttribute('aria-label','Uygulama bildirimleri');toggle.setAttribute('aria-checked','false');toggle.disabled=true;const noticeRow=el('div','eps-row');noticeRow.append(noticeState,toggle);notification.append(noticeRow);
    const message=card('Mesajları kısıtla','Açıkken sana ilk kez yazacak kişi seçtiğin hediyeyi göndermeden mesaj gönderemez.');const lockState=el('p'),label=el('label','', 'Gerekli hediye');label.htmlFor='epsGiftChoice';const choice=el('select');choice.id='epsGiftChoice';choice.setAttribute('aria-label','Gerekli hediye');choice.disabled=true;const lockToggle=button('Yükleniyor…',()=>{if(restriction)save(async()=>{await writeRestriction(!restriction.enabled,choice.value)})});const lockSave=button('Hediye seçimini kaydet',()=>{if(restriction)save(async()=>{await writeRestriction(restriction.enabled,choice.value)})});lockToggle.disabled=lockSave.disabled=true;const actions=el('div','eps-actions');actions.append(lockToggle,lockSave);message.append(lockState,label,choice,actions);
    const shortcuts=card('Profil ve görünürlük','Kullanıcı adı değişikliği Bilgilerim bölümünde 150 Lidya ile yapılır. Diğer profil tercihlerini ilgili bölümden yönetebilirsin.');const links=el('div','eps-actions');for(const [key,name] of [['info','Bilgilerim'],['privacy','Gizlilik'],['rooms','Odalarım']])links.append(button(name,()=>{if(active())window.ErisProfileHub?.show(key)}));links.append(button('Profilime bakanlar',()=>visitors(root,active)));shortcuts.append(links);
    const screen=card('Ekranı açık tut','Site veya uygulama açıkken ekranın otomatik kapanmasını önle. Arka planda normal ekran süresi kullanılır.');
    const awakeStatus=el('small');const awakeButton=button('',async()=>{if(!active())return;const wake=window.LidyaScreenAwake;if(wake)await wake.setEnabled(!wake.state().enabled);syncAwake()});awakeButton.setAttribute('role','switch');awakeButton.setAttribute('aria-label','Ekranı açık tut');
    function syncAwake(){if(!active())return;const state=window.LidyaScreenAwake?.state();awakeButton.disabled=!state?.supported;awakeButton.setAttribute('aria-checked',String(!!state?.enabled));awakeButton.textContent=state?.enabled?'Açık · Kapat':'Kapalı · Aç';awakeStatus.textContent=state?.supported?(state.enabled?'Ekranın açık tutulması etkin.':'Cihazın normal ekran süresi kullanılır.'):'Bu cihaz bu özelliği desteklemiyor.'}
    screen.append(awakeStatus,awakeButton);mounted.get(root).syncAwake=syncAwake;syncAwake();
    const security=card('Hesap güvenliği','Açık oturumlarını kontrol et. Tanımadığın oturumları veya bu cihaz dışındaki tüm oturumları kapat.');security.append(button('Açık oturumları yönet',()=>sessions(root,active)));
    const deletion=card('Hesabımı Sil','Geri alınamaz. Doğrulanmış e-postana gelen kodla onaylanır.');
    const deletionActions=el('div','eps-actions');
    // ERISCHAT_ACCOUNT_OTP_FIX_V1
    const deleteButton=button('Hesabımı Sil',()=>{
      if(!active())return;
      status.textContent='';
      deletionActions.replaceChildren();
      const info=el('p','','Hesap silme için doğrulanmış e-posta adresine 6 haneli kod gönderilir.');
      const code=el('input');code.type='text';code.inputMode='numeric';code.maxLength=6;
      code.autocomplete='one-time-code';code.placeholder='6 haneli doğrulama kodu';
      code.setAttribute('aria-label','Hesap silme doğrulama kodu');
      code.style.cssText='min-height:48px;width:100%;max-width:100%;padding:12px;border-radius:12px;border:1px solid var(--ui-line);background:var(--ui-panel);color:var(--ui-ink)';
      const feedback=el('p','eps-status','Kod göndermek için butona bas.');feedback.setAttribute('role','status');
      const send=button('E-postama kod gönder',async()=>{
        if(!active())return;
        send.disabled=true;feedback.textContent='Kod gönderiliyor…';status.textContent='';
        try{
          const result=await api('/me/account-deletion/request',{method:'POST'});
          if(!active())return;
          if(result?.accepted!==true)throw Error('E-posta servisi gönderimi doğrulamadı.');
          feedback.textContent='Kod gönderme isteği kabul edildi. Gelen kutunu ve spam klasörünü kontrol et.';
          confirm.disabled=false;code.focus();
        }catch(e){
          if(!active())return;
          feedback.textContent='Kod gönderilemedi: '+(e?.message||'Bilinmeyen hata')+'. E-posta doğrulamanı ve gönderim servisini kontrol et.';
          confirm.disabled=true;
        }finally{if(active())send.disabled=false}
      });
      const confirm=button('Kodu doğrula ve hesabımı kalıcı sil',async()=>{
        if(!active())return;
        if(!/^[0-9]{6}$/.test(code.value.trim())){feedback.textContent='6 haneli kod gir.';return}
        if(!await lidyaConfirm('Hesabın kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?'))return;
        if(!active())return;
        confirm.disabled=true;feedback.textContent='Kod doğrulanıyor…';
        try{
          const result=await api('/me/account-deletion/confirm',{method:'POST',body:JSON.stringify({code:code.value.trim()})});
          if(result?.deleted!==true)throw Error('Sunucu silme işlemini doğrulamadı.');
          await window.ErisAuth.logout();window.location.reload();
        }catch(e){if(active()){feedback.textContent=e?.message||'Kod doğrulanamadı veya silme işlemi başarısız.';confirm.disabled=false}}
      });confirm.disabled=true;confirm.classList.add('eps-danger');
      deletionActions.append(info,code,feedback,send,confirm,button('İptal',()=>{if(active()){status.textContent='';deletionActions.replaceChildren(deleteButton)}}));
    });deleteButton.classList.add('eps-danger');deletionActions.append(deleteButton);deletion.append(deletionActions);
    const session=card('Oturum','Bu cihazdaki hesabından çıkış yap.');const sessionActions=el('div','eps-actions');const logout=button('Oturumu kapat',()=>{if(!active())return;sessionActions.replaceChildren();const cancel=button('Vazgeç',()=>sessionActions.replaceChildren(logout));const yes=button('Evet, çıkış yap',async()=>{if(!active()||busy)return;yes.disabled=cancel.disabled=true;try{await window.ErisAuth.logout();if(active())status.textContent='Oturum kapatıldı.'}catch(e){if(active()){status.textContent=e.message||'Çıkış yapılamadı.';yes.disabled=cancel.disabled=false}}});yes.classList.add('eps-danger');sessionActions.append(yes,cancel)});logout.classList.add('eps-danger');deletion,sessionActions.append(logout);session.append(sessionActions);const reload=button('Ayarları yenile',load);root.append(status,reload);
    function sync(){if(!active())return;toggle.disabled=busy||!privacy;toggle.textContent=privacy?(privacy.hide_notifications?'Bildirimleri Aç':'Bildirimleri Kapat'):'Yükleniyor…';toggle.setAttribute('aria-checked',String(!!privacy&&!privacy.hide_notifications));noticeState.textContent=privacy?(privacy.hide_notifications?'Bildirimler kapalı.':'Bildirimler açık.'):'Ayar yüklenemedi.';choice.disabled=busy||!restriction;lockToggle.disabled=lockSave.disabled=busy||!restriction;reload.disabled=busy;lockToggle.textContent=restriction?.enabled?'Kısıtlamayı kapat':'Kısıtlamayı aç';lockState.textContent=restriction?(restriction.enabled?'Açık · İlk mesaj için hediye gerekli.':'Kapalı · İlk mesaj için hediye gerekli değil.'):'Mesaj ayarı yüklenemedi.';if(restriction&&!busy)choice.value=restriction.gift_key}
    async function writeRestriction(enabled,gift_key){await window.ErisPlatform.setMessageRestriction({enabled,gift_key});if(!active())return;restriction=await window.ErisPlatform.getMessageRestriction();if(active()&&(restriction.enabled!==enabled||restriction.gift_key!==gift_key))throw Error('Mesaj ayarı doğrulanamadı.')}
    async function save(fn){if(busy||!active())return;busy=true;sync();status.textContent='Kaydediliyor…';try{await fn();if(active())status.textContent='Ayar kaydedildi.'}catch(e){if(active())status.textContent=e.message||'Ayar kaydedilemedi. Yenile ve tekrar dene.'}finally{busy=false;sync()}}
    async function load(){if(busy||!active())return;busy=true;sync();status.textContent='Ayarlar yükleniyor…';try{const results=await Promise.allSettled([api('/me/privacy'),window.ErisPlatform.getMessageRestriction(),window.ErisPlatform.messageGifts()]);if(!active())return;privacy=results[0].status==='fulfilled'?results[0].value:null;restriction=results[1].status==='fulfilled'?results[1].value:null;choice.replaceChildren();if(results[2].status==='fulfilled'){for(const gift of results[2].value){const option=el('option','',gift.gift_key+' · '+Number(gift.unit_price||0).toLocaleString('tr-TR')+' Lidya');option.value=gift.gift_key;choice.append(option)}}else restriction=null;if(restriction&&!Array.from(choice.options).some(x=>x.value===restriction.gift_key))restriction=null;if(privacy)window.ErisNotifications?.apply?.(privacy);status.textContent=results.every(r=>r.status==='fulfilled')?'Ayarların hesabına kaydedilir.':'Bazı ayarlar yüklenemedi. Yenile ve tekrar dene.'}finally{busy=false;sync()}}
    await load();
  }
  async function sessions(root,active){
    if(!active())return;root.replaceChildren();root.append(button('← Ayarlar',()=>window.ErisProfileHub?.show('settings')),el('h3','','Hesap güvenliği'),el('p','','Kapatılan oturumlar yeniden giriş yapmadan kullanılamaz. Canlı bağlantıların kapanması en fazla 30 saniye sürebilir.'));
    const list=el('div'),status=el('p','eps-status');status.setAttribute('role','status');root.append(list,status);let working=false;
    function confirmAction(label,run){const box=el('div','eps-actions');const ask=button(label,()=>{if(!active()||working)return;const cancel=button('Vazgeç',()=>box.replaceChildren(ask));const yes=button('Evet, kapat',async()=>{if(!active()||working)return;working=true;yes.disabled=cancel.disabled=true;try{await run();if(active())await load()}catch(error){if(active())status.textContent=error.message||'Oturum kapatılamadı.'}finally{working=false;if(active())box.replaceChildren(ask)}});box.replaceChildren(yes,cancel)});box.append(ask);return box}
    async function load(){if(!active())return;status.textContent='Oturumlar yükleniyor…';try{const result=await api('/me/security/sessions');if(!active())return;list.replaceChildren();let index=0;for(const row of result.items){const card=el('article','eps-card');card.append(el('b','',row.current?'Bu oturum':'Diğer oturum '+(++index)),el('p','','Geçerlilik sonu: '+new Date(row.expires_at).toLocaleString('tr-TR')));if(!row.current)card.append(confirmAction('Bu oturumu kapat',()=>api('/me/security/sessions/'+encodeURIComponent(row.id),{method:'DELETE'})));list.append(card)}if(result.has_more)list.append(el('p','','Daha fazla oturum var. Diğer tüm oturumları kapat seçeneği hepsini kapsar.'));list.append(confirmAction('Diğer tüm oturumları kapat',()=>api('/me/security/sessions/others',{method:'DELETE'})));status.textContent='Bu cihazdaki mevcut oturumun korunur.'}catch(error){if(active())status.textContent=error.message||'Oturumlar yüklenemedi.'}}
    await load();
  }
  async function visitors(root,active){if(!active())return;root.replaceChildren();root.append(button('← Ayarlar',()=>window.ErisProfileHub?.show('settings')),el('h3','','Profilime bakanlar'));const list=el('div');list.setAttribute('aria-live','polite');root.append(list);async function load(){list.textContent='Yükleniyor…';try{const rows=await api('/me/profile-visitors');if(!active())return;list.replaceChildren();if(!rows.length)list.textContent='Henüz profilini ziyaret eden yok.';for(const row of rows){const card=el('article','eps-visitor');const name=el('b','',row.nickname||'Kullanıcı');window.ErisRoleBadges?.bind?.(name,row);const date=new Date(row.visited_at);card.append(name,el('p','',Number.isNaN(date.getTime())?'':date.toLocaleString('tr-TR')),button('Profili aç',()=>{if(active())window.openUserProfile?.(row.user_id)}));list.append(card)}}catch(e){if(active()){list.textContent=e.message||'Ziyaretçiler yüklenemedi.';list.append(button('Tekrar dene',load))}}}await load()}
  window.ErisSettings={render};
})();
