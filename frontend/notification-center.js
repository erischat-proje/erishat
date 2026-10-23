(() => {
  'use strict';
  if(window.ErisNotificationCenter)return;
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const groups=[['all','Tüm türler'],['messages','Mesajlar'],['social','Sosyal'],['gifts','Hediyeler'],['family','Aile'],['rooms','Odalar'],['system','Sistem ve hesap']];
  let current=null;
  function clear(){if(current){current.dispose();current=null;}}
  async function render(body,isCurrent=()=>true) {
    clear();const session=token(),root=document.createElement('section');root.className='lnc';body.replaceChildren(root);let alive=true;
    const valid=()=>alive&&root.isConnected&&session===token()&&isCurrent();
    root.innerHTML='<header class="lnc-header"><div><small>BİLDİRİM MERKEZİ</small><h3>Gelişmeler burada</h3><p data-counts></p></div><button type="button" data-settings>Bildirim ayarları</button></header><p data-disabled hidden>Bildirimlerin kapalı. Geçmişini görmek ve uygulama içi bildirimleri almak için Ayarlar’dan açabilirsin.</p><div data-enabled><form data-search class="lnc-search"><label>Bildirimlerde ara<input type="search" maxlength="100" data-query placeholder="Başlık veya içerik"></label><label>Bildirim türü<select data-category></select></label><button type="submit">Ara / yenile</button></form><div class="lnc-tabs" role="group" aria-label="Okunma durumu"><button type="button" data-state="all">Tümü</button><button type="button" data-state="unread">Okunmamış</button><button type="button" data-state="read">Okunmuş</button></div><p data-new hidden>Yeni bildirimler var. Görmek için yenile.</p><div class="lnc-tools"><span data-selected>0 / 50 seçili</span><button type="button" data-select-loaded>Yüklenenlerden seç</button><button type="button" data-clear>Seçimi temizle</button><button type="button" data-read>Seçilenleri okundu yap</button><button type="button" data-unread>Seçilenleri okunmamış yap</button><button type="button" data-read-all>Filtredekileri okundu yap</button></div><div data-confirm></div><div data-list class="lnc-list"></div><button type="button" data-more hidden>Daha fazla bildirim</button></div><p role="status" aria-live="polite" data-status></p>';
    const q=s=>root.querySelector(s),status=q('[data-status]'),list=q('[data-list]'),selection=new Set(),seen=new Set();let revision=0,loading=false,writing=false,confirming=false,enabled=true,cursor=null,hasMore=false,snapshot=null,matchedUnread=0,anchor=0,filters={category:'all',state:'all',q:''};
    for(const [value,label] of groups){const option=document.createElement('option');option.value=value;option.textContent=label;q('[data-category]').append(option);}
    const api=async(path,options={})=>{if(!valid())throw Error('Oturum değişti.');const result=await window.ErisPlatform.api(path,options);if(!valid())throw Error('Oturum değişti.');return result;};
    const counts=data=>q('[data-counts]').textContent=data.total+' bildirim · '+data.unread+' okunmamış';
    const sync=()=>{
      for(const control of root.querySelectorAll('button,input,select')){if(control.closest('[data-confirm]'))continue;control.disabled=loading||writing||confirming;}
      q('[data-settings]').disabled=writing;
      for(const b of root.querySelectorAll('[data-state]'))b.setAttribute('aria-pressed',String(b.dataset.state===filters.state));
      q('[data-selected]').textContent=selection.size+' / 50 seçili';
      for(const attr of ['read','unread','clear'])q('[data-'+attr+']').disabled=loading||writing||confirming||!selection.size;
      q('[data-read-all]').disabled=loading||writing||confirming||!matchedUnread||!snapshot;
      q('[data-select-loaded]').disabled=loading||writing||confirming||!seen.size||selection.size>=50;
      for(const box of list.querySelectorAll('[data-select]')){box.checked=selection.has(Number(box.dataset.select));box.disabled=loading||writing||confirming||selection.size>=50&&!box.checked;}
      q('[data-more]').hidden=!hasMore;q('[data-more]').disabled=loading||writing||confirming;
    };
    function card(row){
      const item=document.createElement('article');item.className='lnc-card'+(row.read?'':' unread');item.dataset.notificationId=row.id;
      const label=document.createElement('label');label.className='lnc-select';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.select=row.id;checkbox.setAttribute('aria-label','Bildirim #'+row.id+' seç');label.append(checkbox,document.createTextNode('Seç'));
      checkbox.onchange=()=>{if(checkbox.checked&&selection.size<50)selection.add(row.id);else selection.delete(row.id);sync();};
      const title=document.createElement('h4');title.textContent=row.title||'Bildirim';const text=document.createElement('p');text.textContent=row.body||'';
      const date=document.createElement('time'),at=new Date(row.created_at);if(!Number.isNaN(at.getTime())){date.dateTime=at.toISOString();date.textContent=at.toLocaleString('tr-TR');}
      const footer=document.createElement('div');footer.className='lnc-card-footer';const badge=document.createElement('span');badge.textContent=row.read?'Okundu':'Okunmamış';badge.className='lnc-read-status';const button=document.createElement('button');button.type='button';button.textContent=row.read?'Okunmamış olarak işaretle':'Okundu olarak işaretle';button.onclick=()=>mark([row.id],!row.read);footer.append(badge,button);
      item.append(label,title,text,date,footer);return item;
    }
    async function load(reset=true){
      if(!valid()||writing||confirming||loading&&!reset)return;const r=reset?++revision:revision;loading=true;status.textContent='Bildirimler yükleniyor…';
      if(reset){selection.clear();seen.clear();cursor=null;hasMore=false;snapshot=null;matchedUnread=0;anchor=0;list.replaceChildren();q('[data-new]').hidden=true;}
      sync();list.setAttribute('aria-busy','true');const params=new URLSearchParams({...filters,limit:'20'});if(cursor)params.set('cursor',cursor);
      try{const page=await api('/notification-center?'+params);if(r!==revision)return;enabled=page.enabled;counts(page.counts);q('[data-disabled]').hidden=enabled;q('[data-enabled]').hidden=!enabled;
        if(!enabled){list.replaceChildren();selection.clear();seen.clear();hasMore=false;status.textContent='';return;}
        for(const row of page.items){if(seen.has(row.id))continue;seen.add(row.id);anchor=Math.max(anchor,Number(row.id));list.append(card(row));}
        if(!seen.size){const empty=document.createElement('p');empty.className='lnc-empty';empty.textContent=filters.q||filters.category!=='all'?'Bu filtrelerde bildirim yok.':filters.state==='unread'?'Okunmamış bildirimin yok.':filters.state==='read'?'Henüz okunmuş bildirim yok.':'Henüz bildirim yok.';list.append(empty);}
        anchor=Number(page.anchor)||anchor;cursor=page.next_cursor;hasMore=page.has_more;snapshot=page.snapshot;matchedUnread=page.matched_unread;status.textContent=page.matched+' eşleşme · '+seen.size+' bildirim yüklendi.';
      }catch(e){if(valid()&&r===revision){status.textContent=e.message||'Bildirimler yüklenemedi.';const retry=document.createElement('button');retry.type='button';retry.textContent='Yeniden dene';retry.onclick=()=>load(reset);status.append(retry);}}
      finally{if(valid()&&r===revision){loading=false;list.setAttribute('aria-busy','false');sync();}}
    }
    async function mark(ids,read){
      if(!valid()||writing||loading||confirming||!ids.length)return;writing=true;sync();status.textContent='Bildirimler güncelleniyor…';
      try{const result=await api('/notification-center/read',{method:'POST',body:JSON.stringify({ids,read})});counts(result.counts);writing=false;await load(true);if(valid())status.textContent=result.count+' bildirim '+(read?'okundu':'okunmamış')+' olarak işaretlendi.';}
      catch(e){if(valid())status.textContent=e.message||'İşlem tamamlanamadı. Seçimin korunuyor.';}finally{writing=false;if(valid())sync();}
    }
    q('[data-search]').onsubmit=e=>{e.preventDefault();if(writing||confirming)return;filters={...filters,q:q('[data-query]').value.trim(),category:q('[data-category]').value};load(true);};
    for(const button of root.querySelectorAll('[data-state]'))button.onclick=()=>{if(writing||confirming)return;filters={...filters,state:button.dataset.state};load(true);};
    q('[data-settings]').onclick=()=>window.ErisProfileHub?.show?.('settings');
    q('[data-more]').onclick=()=>load(false);q('[data-clear]').onclick=()=>{selection.clear();sync();};
    q('[data-select-loaded]').onclick=()=>{for(const id of seen){if(selection.size>=50)break;selection.add(id);}sync();};
    q('[data-read]').onclick=()=>mark([...selection],true);q('[data-unread]').onclick=()=>mark([...selection],false);
    q('[data-read-all]').onclick=()=>{
      if(!valid()||writing||loading||confirming||!snapshot||!matchedUnread)return;const captured=snapshot,amount=matchedUnread;confirming=true;const box=q('[data-confirm]');box.innerHTML='<section class="lnc-confirm"><h4>Filtredeki bildirimleri okundu yap</h4><p></p><button type="button" data-accept>Onayla</button><button type="button" data-cancel>Vazgeç</button></section>';box.querySelector('p').textContent=amount+' okunmamış bildirim bu işleme uygun. Sonradan gelen bildirimler okunmamış kalır. Bildirimler silinmez.';
      box.querySelector('[data-cancel]').onclick=()=>{if(writing)return;confirming=false;box.replaceChildren();sync();};
      box.querySelector('[data-accept]').onclick=async()=>{if(writing||!valid())return;writing=true;for(const b of box.querySelectorAll('button'))b.disabled=true;sync();status.textContent='Bildirimler güncelleniyor…';
        try{const result=await api('/notification-center/read-matching',{method:'POST',body:JSON.stringify({snapshot:captured})});counts(result.counts);box.replaceChildren();confirming=false;writing=false;await load(true);if(valid())status.textContent=result.count+' bildirim okundu olarak işaretlendi.';}
        catch(e){if(valid()){status.textContent=e.message;for(const b of box.querySelectorAll('button'))b.disabled=false;}}finally{writing=false;if(valid())sync();}
      };sync();box.querySelector('[data-cancel]').focus();
    };
    current={session,valid,dispose:()=>{alive=false;root.replaceChildren();},reload:()=>render(body,isCurrent),newRows:rows=>{if(valid()&&enabled&&rows.some(row=>Number(row.id)>anchor))q('[data-new]').hidden=false;}};
    await load(true);
  }
  for(const name of ['erischat:auth','erischat:auth-state','erischat:auth-ready','erischat:auth-state-changed'])window.addEventListener(name,()=>{if(current&&current.session!==token())clear();});
  window.addEventListener('erischat:notifications',e=>{if(Array.isArray(e.detail))current?.newRows(e.detail);});
  window.addEventListener('erischat:notification-preference',()=>{if(current?.valid())current.reload();});
  window.ErisNotificationCenter={render,clear};
})();
