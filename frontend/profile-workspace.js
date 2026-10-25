(() => {
  'use strict';
  if(window.ErisProfileWorkspace)return;
  const token=()=>window.ErisPlatform?.getAccessToken?.()||'';
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const contexts=new WeakMap();let active=null;
  const labels={first_name:'Ad',last_name:'Soyad',bio:'Hakkımda'};
  function reset(){active=null;}
  function canLeave(){return !active?.dirty?.()||window.confirm('Kaydedilmemiş profil değişikliklerin var. Kaydetmeden çıkılsın mı?');}
  window.addEventListener('beforeunload',event=>{if(active?.dirty?.()){event.preventDefault();event.returnValue='';}});
  function state(root,isCurrent) {
    const session=token();const valid=()=>root.isConnected&&isCurrent()&&session===token();
    const api=async(path,options={})=>{if(!valid())throw Error('Oturum değişti.');const data=await window.ErisPlatform.api(path,options);if(!valid())throw Error('Oturum değişti.');return data;};
    return {valid,api};
  }
  function publish(me,updated,valid) {
    if(!valid())return;const current=window.ErisAuth?.user;
    if(current?.id&&String(current.id)!==String(updated.id))return;
    const full={...me,...current,...updated};if(window.ErisAuth)window.ErisAuth.user=full;
    if(window.ErisChatCosmetics?.state&&(!window.ErisChatCosmetics.state.user?.id||String(window.ErisChatCosmetics.state.user.id)===String(updated.id)))window.ErisChatCosmetics.state.user=full;
    window.ErisProfile?.render?.(full);window.dispatchEvent(new CustomEvent('erischat:profile',{detail:full}));
  }
  async function info(body,me,isCurrent) {
    reset();const root=document.createElement('section');root.className='lpw lpw-info';root.innerHTML='<p role="status">Profil bilgileri yükleniyor…</p>';body.replaceChildren(root);
    const {valid,api}=state(root,isCurrent);let profile;
    try{profile=(await api('/profile-workspace')).profile;}catch(e){if(valid()){root.textContent=e.message;const retry=document.createElement('button');retry.type='button';retry.textContent='Yeniden dene';retry.onclick=()=>info(body,me,isCurrent);root.append(retry);}return;}
    if(!valid())return;
    root.innerHTML=`<header class="lpw-summary"><div><span class="lpw-kicker">PROFİL BİLGİLERİN</span><h3 data-profile-name></h3><span data-profile-id></span><small data-profile-age style="display:block;margin-top:6px"></small></div><button type="button" data-copy-id>ID’yi kopyala</button></header><form data-info-form><div class="lpw-names"><label>Ad <small>İsteğe bağlı</small><input data-field="first_name" maxlength="64" autocomplete="given-name"></label><label>Soyad <small>İsteğe bağlı</small><input data-field="last_name" maxlength="64" autocomplete="family-name"></label></div><label>Hakkımda<textarea data-field="bio" maxlength="300" rows="4" placeholder="Kendinden bahset…"></textarea></label><div class="lpw-count" data-bio-count></div><div class="lpw-preview"><strong>Biyografi önizlemesi</strong><p data-bio-preview></p></div><p data-info-status role="status" aria-live="polite"></p><div data-conflict></div><div class="lpw-actions"><button type="submit" data-save-info>Değişiklikleri kaydet</button><button type="button" data-reset-info>Değişiklikleri geri al</button></div></form>`;
    const q=s=>root.querySelector(s),inputs={};for(const key of Object.keys(labels))inputs[key]=q('[data-field="'+key+'"]');
    let base={first_name:profile.first_name,last_name:profile.last_name,bio:profile.bio},saving=false,renaming=false,currentName=profile.nickname;
    const values=()=>Object.fromEntries(Object.entries(inputs).map(([k,e])=>[k,e.value.replace(/\r\n?/g,'\n').trim()]));
    const dirty=()=>valid()&&Object.entries(values()).some(([k,v])=>v!==(base[k]||'').trim());
    active={dirty};
    const refresh=()=>{q('[data-bio-count]').textContent=inputs.bio.value.length+' / 300';q('[data-bio-preview]').textContent=inputs.bio.value.trim()||'Biyografin burada görünecek.';q('[data-save-info]').disabled=saving||!dirty()||profile.management_locked;q('[data-reset-info]').disabled=saving||!dirty();};
    function applyHeader(next){profile={...profile,...next};q('[data-profile-name]').textContent=profile.nickname||'Profilim';q('[data-profile-id]').textContent='Kullanıcı ID · '+(profile.public_id||'—');q('[data-copy-id]').disabled=!profile.public_id;q('[data-profile-age]').textContent=Number.isInteger(profile.age)?profile.age+' yaş':'Yaş bilgisi eklenmemiş';}
    applyHeader(profile);for(const key of Object.keys(inputs))inputs[key].value=base[key]||'';
    q('[data-copy-id]').onclick=async()=>{try{if(!navigator.clipboard?.writeText)throw Error('ID’yi seçerek kopyalayabilirsin: '+profile.public_id);await navigator.clipboard.writeText(String(profile.public_id));if(valid())q('[data-info-status]').textContent='Kullanıcı ID kopyalandı.';}catch(e){if(valid())q('[data-info-status]').textContent=e.message;}};
    q('[data-info-form]').oninput=()=>{q('[data-info-status]').textContent='';refresh();};q('[data-reset-info]').onclick=()=>{for(const key of Object.keys(inputs))inputs[key].value=base[key]||'';q('[data-conflict]').replaceChildren();q('[data-info-status]').textContent='Değişiklikler geri alındı.';refresh();};
    async function compare() {
      const button=q('[data-compare]');button.disabled=true;
      try{const latest=(await api('/profile-workspace')).profile,draft=values(),box=q('[data-conflict]');
        box.innerHTML='<section class="lpw-conflict"><h4>Güncel bilgilerle karşılaştır</h4><p>Her alan için hangi değeri kullanacağını seç. Bu adım kaydetmez.</p><div data-comparison></div><button type="button" data-apply-comparison>Seçimleri forma aktar</button></section>';
        for(const key of Object.keys(labels)){const line=document.createElement('label');line.innerHTML='<strong>'+labels[key]+'</strong><small data-server></small><small data-draft></small><select data-choice="'+key+'"><option value="server">Sunucudakini kullan</option><option value="draft">Yazdığımı koru</option></select>';line.querySelector('[data-server]').textContent='Sunucu: '+(latest[key]||'Boş');line.querySelector('[data-draft]').textContent='Taslak: '+(draft[key]||'Boş');if(latest[key]===base[key])line.querySelector('select').value='draft';box.querySelector('[data-comparison]').append(line);}
        box.querySelector('[data-apply-comparison]').onclick=()=>{if(!valid())return;for(const key of Object.keys(inputs))inputs[key].value=box.querySelector('[data-choice="'+key+'"]').value==='draft'?draft[key]:latest[key]||'';base={first_name:latest.first_name,last_name:latest.last_name,bio:latest.bio};applyHeader(latest);box.replaceChildren();q('[data-info-status]').textContent='Seçimler forma aktarıldı. Kaydetmeden önce kontrol et.';refresh();};
      }catch(e){if(valid()){q('[data-info-status]').textContent=e.message;button.disabled=false;}}
    }
    q('[data-info-form]').onsubmit=async event=>{
      event.preventDefault();if(saving||!valid()||!dirty()||profile.management_locked)return;const sent=values(),changes={},expected={};for(const key of Object.keys(sent))if(sent[key]!==(base[key]||'').trim()){changes[key]=sent[key];expected[key]=base[key]||'';}
      saving=true;refresh();q('[data-info-status]').textContent='Kaydediliyor…';
      try{const updated=await api('/profile-workspace/info',{method:'PATCH',body:JSON.stringify({changes,expected})});
        for(const key of Object.keys(changes)){if(inputs[key].value.replace(/\r\n?/g,'\n').trim()===sent[key])inputs[key].value=updated[key]||'';base[key]=updated[key]||'';}
        applyHeader(updated);publish(me,updated,valid);q('[data-conflict]').replaceChildren();q('[data-info-status]').textContent='Profil bilgilerin kaydedildi.';
      }catch(e){if(valid()){q('[data-info-status]').textContent=e.message;if(e.status===409){q('[data-conflict]').innerHTML='<button type="button" data-compare>Güncel bilgilerle karşılaştır</button>';q('[data-compare]').onclick=compare;}}}
      finally{saving=false;if(valid())refresh();}
    };
    if(profile.management_locked){for(const el of q('[data-info-form]').querySelectorAll('input,textarea,button'))el.disabled=true;q('[data-info-status]').textContent='Yönetim profili bu ekrandan düzenlenemez.';refresh();return;}
    const rename=document.createElement('form');rename.className='lpw-rename';rename.innerHTML='<h3>Kullanıcı adını değiştir</h3><p>Kullanıcı adı değişikliği <strong>150 Lidya</strong>. Ad, soyad ve biyografi kaydı ücretsizdir.</p><label>Yeni kullanıcı adı<input data-nickname maxlength="32" required autocomplete="nickname"></label><label class="lpw-check"><input type="checkbox" data-consent><span>Değişiklik için 150 Lidya ödemeyi onaylıyorum.</span></label><button type="submit" data-rename>Kullanıcı adını değiştir · 150 Lidya</button><p data-rename-status role="status" aria-live="polite"></p>';root.append(rename);
    const name=rename.querySelector('[data-nickname]'),consent=rename.querySelector('[data-consent]'),renameButton=rename.querySelector('[data-rename]'),status=rename.querySelector('[data-rename-status]');name.value=currentName;
    const renameReady=()=>renameButton.disabled=renaming||!consent.checked||!name.value.trim()||name.value.trim()===currentName;rename.oninput=()=>{status.textContent='';renameReady();};renameReady();
    rename.onsubmit=async event=>{event.preventDefault();if(renaming||renameButton.disabled||!valid()||!rename.reportValidity())return;const requested=name.value.trim();renaming=true;renameReady();status.textContent='Kullanıcı adı değiştiriliyor…';
      try{const updated=await api('/me/nickname',{method:'POST',body:JSON.stringify({nickname:requested})});currentName=updated.nickname;applyHeader(updated);if(name.value.trim()===requested)name.value=currentName;consent.checked=false;publish(me,updated,valid);status.textContent='Kullanıcı adın güncellendi. Güncel bakiyen: '+String(updated.lidya??'—')+' Lidya.';}
      catch(e){if(valid())status.textContent=e.message;}finally{renaming=false;if(valid())renameReady();}
    };
    refresh();
  }
  async function posts(body,me,isCurrent) {
    reset();const root=document.createElement('section');root.className='lpw lpw-posts eph-my-posts';root.innerHTML='<header class="lpw-summary"><div><span class="lpw-kicker">PAYLAŞIM YÖNETİMİ</span><h3>Gönderilerim</h3><p data-post-counts></p></div><button type="button" data-create>＋ Yeni gönderi</button></header><form class="lpw-filters" data-post-search><input type="search" data-post-query maxlength="100" placeholder="Gönderilerimde ara" aria-label="Gönderilerimde ara"><select data-post-scope aria-label="Görünürlük"><option value="all">Tüm gönderilerim</option><option value="public">Herkese açık</option><option value="followers">Takipçilere açık</option><option value="hidden">Profilden gizli</option></select><select data-post-media aria-label="Medya türü"><option value="all">Tüm türler</option><option value="text">Yazı</option><option value="image">Fotoğraf</option><option value="video">Video</option></select><select data-post-order aria-label="Gönderi sırası"><option value="newest">En yeni</option><option value="oldest">En eski</option></select><button type="submit">Ara / yenile</button></form><div class="lpw-bulk"><span data-selected-count>0 / 20 seçili</span><button type="button" data-select-visible>Yüklenenlerden seç</button><button type="button" data-clear-selected>Seçimi temizle</button><select data-bulk-action aria-label="Toplu işlem"><option value="hide">Profilden gizle</option><option value="show">Gizlemeyi kaldır</option><option value="public">Herkese açık yap</option><option value="followers">Takipçilere açık yap</option><option value="delete">Kalıcı sil</option></select><button type="button" data-bulk-preview>İşlemi gözden geçir</button></div><p data-post-status role="status" aria-live="polite"></p><div data-bulk-confirm></div><div data-posts-list class="eph-posts-list"></div><button type="button" data-post-more hidden>Daha fazla gönderi</button>';
    body.replaceChildren(root);const {valid,api}=state(root,isCurrent),q=s=>root.querySelector(s),list=q('[data-posts-list]');let revision=0,loading=false,busy=false,confirming=false,cursor=null,more=false,filters={scope:'all',media:'all',q:'',order:'newest'};const seen=new Set(),selected=new Map(),rows=new Map();
    const status=q('[data-post-status]'),names={hide:'Profilden gizle',show:'Gizlemeyi kaldır',public:'Herkese açık yap',followers:'Takipçilere açık yap',delete:'Kalıcı sil'};
    const sync=()=>{q('[data-selected-count]').textContent=selected.size+' / 20 seçili';for(const el of root.querySelectorAll('button,input,select')){if(el.closest('[data-bulk-confirm]'))continue;if(el.closest('[data-posts-list]')&&!el.matches('[data-select-post]'))continue;el.disabled=busy||confirming||loading;}
      q('[data-bulk-preview]').disabled=busy||confirming||loading||!selected.size;q('[data-clear-selected]').disabled=busy||confirming||!selected.size;q('[data-post-more]').hidden=!more;q('[data-post-more]').disabled=loading||busy||confirming;
      for(const box of list.querySelectorAll('[data-select-post]')){box.checked=selected.has(Number(box.dataset.selectPost));box.disabled=busy||confirming||loading||selected.size>=20&&!box.checked;}};
    const showCounts=data=>{q('[data-post-counts]').textContent=data.total+' gönderi · '+data.visible+' görünür · '+data.hidden+' gizli';};
    const summary=async()=>{try{const data=await api('/profile-workspace');showCounts(data.posts);}catch(e){if(valid())status.textContent=e.message;}};
    function decorate() {
      for(const card of list.querySelectorAll(':scope>.ec-social-post')){
        const row=rows.get(Number(card.dataset.postId));if(!row||card.querySelector('[data-select-post]'))continue;
        const label=document.createElement('label');label.className='lpw-select';const box=document.createElement('input');box.type='checkbox';box.dataset.selectPost=row.id;box.setAttribute('aria-label','Gönderi #'+row.id+' seç');label.append(box,document.createTextNode('Seç · #'+row.id));card.prepend(label);
        box.onchange=()=>{if(box.checked){if(selected.size>=20){box.checked=false;status.textContent='Bir işlemde en fazla 20 gönderi seçebilirsin.';}else selected.set(row.id,{id:row.id,updated_at:row.updated_at});}else selected.delete(row.id);sync();};
      }sync();
    }
    async function load(resetList=true) {
      if(!valid()||busy||confirming||loading&&!resetList)return;const r=resetList?++revision:revision;loading=true;status.textContent='Gönderiler yükleniyor…';
      if(resetList){cursor=null;more=false;seen.clear();selected.clear();rows.clear();window.ErisSocialFeed?.release?.(list);list.replaceChildren();}
      sync();list.setAttribute('aria-busy','true');const params=new URLSearchParams({...filters,limit:'20'});if(cursor)params.set('cursor',cursor);
      try{const page=await api('/profile-workspace/posts?'+params);if(r!==revision)return;const fresh=page.items.filter(row=>!seen.has(row.id));fresh.forEach(row=>{seen.add(row.id);rows.set(row.id,row);});
        await window.ErisSocialFeed.renderMineRows(list,fresh,!resetList);if(!valid()||r!==revision)return;cursor=page.next_cursor;more=page.has_more;decorate();status.textContent=rows.size?'Yüklenen gönderi: '+rows.size:'Bu filtrelerde gönderi yok.';
      }catch(e){if(valid()&&r===revision){status.textContent=e.message;const retry=document.createElement('button');retry.type='button';retry.textContent='Yeniden dene';retry.onclick=()=>load(resetList);status.append(retry);}}
      finally{if(valid()&&r===revision){loading=false;list.setAttribute('aria-busy','false');sync();}}
    }
    contexts.set(list,()=>{if(valid())return Promise.all([load(true),summary()]);});
    q('[data-create]').onclick=()=>{window.ErisProfileHub.close();window.ErisSocialFeed?.compose?.();};
    q('[data-post-search]').onsubmit=e=>{e.preventDefault();if(busy||confirming)return;filters={q:q('[data-post-query]').value.trim(),scope:q('[data-post-scope]').value,media:q('[data-post-media]').value,order:q('[data-post-order]').value};load(true);};
    q('[data-post-more]').onclick=()=>load(false);q('[data-clear-selected]').onclick=()=>{selected.clear();sync();};
    q('[data-select-visible]').onclick=()=>{for(const row of rows.values()){if(selected.size>=20)break;selected.set(row.id,{id:row.id,updated_at:row.updated_at});}sync();};
    q('[data-bulk-preview]').onclick=()=>{
      if(!selected.size||busy||confirming||loading||!valid())return;const action=q('[data-bulk-action]').value,items=[...selected.values()];confirming=true;
      const box=q('[data-bulk-confirm]');box.innerHTML='<section class="lpw-confirm" role="region" aria-label="Toplu işlem onayı"><h4></h4><p data-bulk-explanation></p><ul></ul><label class="lpw-check" data-delete-consent hidden><input type="checkbox" data-confirm-delete><span>Seçtiğim gönderilerin ve yorumlarının kalıcı olarak silinmesini onaylıyorum.</span></label><div class="lpw-actions"><button type="button" data-confirm-action>Onayla ve uygula</button><button type="button" data-cancel-action>Vazgeç</button></div></section>';
      box.querySelector('h4').textContent=items.length+' gönderi · '+names[action];box.querySelector('[data-bulk-explanation]').textContent=action==='delete'?'Bu işlem geri alınamaz. Gönderilerin yorumları ve beğenileri de silinir.':'İşlem yalnızca seçtiğin gönderilere uygulanır. Gizlemeyi kaldırmak mevcut hedef kitleyi değiştirmez.';
      for(const item of items){const li=document.createElement('li');li.textContent='#'+item.id+' · '+String(rows.get(item.id)?.caption||'Medya gönderisi').slice(0,80);box.querySelector('ul').append(li);}
      const confirm=box.querySelector('[data-confirm-action]'),check=box.querySelector('[data-confirm-delete]');box.querySelector('[data-delete-consent]').hidden=action!=='delete';confirm.disabled=action==='delete';check.onchange=()=>confirm.disabled=!check.checked;
      box.querySelector('[data-cancel-action]').onclick=()=>{if(busy)return;confirming=false;box.replaceChildren();sync();};
      confirm.onclick=async()=>{if(busy||confirm.disabled||!valid())return;busy=true;confirm.disabled=true;box.querySelector('[data-cancel-action]').disabled=true;check.disabled=true;sync();status.textContent='İşlem uygulanıyor…';
        try{const result=await api('/profile-workspace/posts/action',{method:'POST',body:JSON.stringify({action,items,confirm_delete:action==='delete'})});showCounts(result.counts);box.replaceChildren();selected.clear();confirming=false;busy=false;await load(true);if(valid())status.textContent=result.count+' gönderi için işlem tamamlandı.';}
        catch(e){if(valid()){status.textContent=e.message;confirm.disabled=false;box.querySelector('[data-cancel-action]').disabled=false;check.disabled=false;}}
        finally{busy=false;if(valid())sync();}
      };sync();box.querySelector('[data-cancel-action]').focus();
    };
    await Promise.all([load(true),summary()]);
  }
  window.ErisProfileWorkspace={info,posts,reset,canLeave,hasPosts:list=>contexts.has(list),reloadPosts:list=>contexts.get(list)?.()};
})();

