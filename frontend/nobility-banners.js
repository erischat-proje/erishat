(function(){
  'use strict';

  const kinds = Object.freeze({
    gift_banner: 1,
    activation_banner: 1,
    daily_banner: 3,
    room_welcome: 3
  });

  const names = Object.freeze({
    1: 'Şövalye',
    2: 'Kont',
    3: 'Dük',
    4: 'Kral'
  });

  const queue = [];
  const seen = new Set();

  let current = null;
  let timer = null;

  function validate(data){
    if(!data || data.type !== 'nobility_banner') return false;

    if(!Object.prototype.hasOwnProperty.call(kinds,data.kind))
      return false;

    if(!Number.isInteger(data.rank) ||
       data.rank < kinds[data.kind] ||
       data.rank > 4) return false;

    if(typeof data.id !== 'string' ||
       !data.id || data.id.length > 160) return false;

    if(typeof data.nickname !== 'string') return false;

    const scope = data.kind === 'room_welcome' ||
      (data.kind === 'activation_banner' && data.rank < 3)
      ? 'room' : 'global';

    return data.scope === scope;
  }

  function message(data){
    const name = data.nickname.slice(0,80);
    const rank = names[data.rank];

    switch(data.kind){
      case 'gift_banner':
        return `${rank} ${name} hediye gönderdi!`;

      case 'activation_banner':
        if(data.action === 'renew')
          return `${name}, ${rank} asaletini yeniledi!`;

        if(data.action === 'upgrade')
          return `${name}, ${rank} seviyesine yükseldi!`;

        return `${name}, ${rank} asaletine ulaştı!`;

      case 'daily_banner':
        return `${rank} ${name} bugün aramızda!`;

      case 'room_welcome':
        return `${rank} ${name}, odaya hoş geldin!`;
    }
  }

  function clear(){
    clearTimeout(timer);
    timer = null;
    queue.length = 0;
    current?.remove();
    current = null;
    seen.clear();
  }

  // Only server-authorized premium gifts with known local artwork use this layout.
  function dynamicGift(data){
    if(![1,2].includes(data.rank) || data.kind !== 'gift_banner') return null;
    const gift = data.gift;
    if(!gift || typeof gift.name !== 'string' || !gift.name.trim() ||
       !Number.isSafeInteger(gift.quantity) || gift.quantity < 1 ||
       typeof gift.image_url !== 'string') return null;
    const path = gift.image_url;
    if(!/^\/(?:hediyesistemi\/[0-9]+|relationship-assets\/[A-Za-z0-9_-]+)\.png$/.test(path)) return null;
    const folder = data.rank === 2 ? 'count' : 'knight';
    return {
      name:gift.name.slice(0,120),quantity:gift.quantity,src:'.'+path,
      template:`./assets/lidya-nobility/${folder}/gift-banner-dynamic.png`,
      className:`lidya-${folder}-dynamic-gift`
    };
  }

  function buildDynamic(card, image, data, gift){
    card.className += ' '+gift.className;
    image.className = 'ln-dynamic-template';
    image.src = gift.template;
    const sender = document.createElement('div');
    sender.className = 'ln-dynamic-sender';
    sender.textContent = data.nickname.slice(0,80);
    const artwork = document.createElement('img');
    artwork.className = 'ln-dynamic-artwork';
    artwork.src = gift.src;
    artwork.alt = gift.name;
    artwork.draggable = false;
    artwork.onerror = ()=>{artwork.hidden = true;};
    const label = document.createElement('div');
    label.className = 'ln-dynamic-label';
    label.textContent = `${gift.name} ×${gift.quantity}`;
    const fallback = document.createElement('span');
    fallback.className = 'ln-dynamic-fallback';
    fallback.textContent = `${message(data)} ${gift.name} ×${gift.quantity}`;
    image.onerror = ()=>{
      image.hidden = true;
      card.className += ' ln-dynamic-template-failed';
    };
    card.append(image,sender,artwork,label,fallback);
  }

  function next(){
    if(current || !queue.length) return;

    const data = queue.shift();

    if(document.hidden){
      queue.length = 0;
      return;
    }

    const dynamic = dynamicGift(data);

    const asset = dynamic
      ? dynamic.template
      : window.LidyaNobilityAssets?.resolve?.(
          data.rank,data.kind
        );

    if(!asset){
      next();
      return;
    }

    const card = document.createElement('div');
    card.className = 'lidya-nobility-live-banner';

    const knight = data.rank === 1;

    if(knight){
      card.className += ' lidya-knight-live-banner';
      card.className += data.kind === 'gift_banner'
        ? ' lidya-knight-gift-banner'
        : ' lidya-knight-activation-banner';
    }

    const image = document.createElement('img');
    image.src = asset;
    image.alt = '';
    image.draggable = false;

    if(knight){
      image.onerror = ()=>{
        image.hidden = true;
        card.className += ' lidya-knight-banner-fallback';
      };
    }


    const text = document.createElement('span');
    text.textContent = message(data);

    const gift = dynamicGift(data);
    if(data.rank === 2 && data.kind === 'activation_banner'){
      card.className += ' lidya-count-activation-banner';

      const panel = document.createElement('div');
      panel.className = 'ln-count-activation-panel';

      const title = document.createElement('div');
      title.className = 'ln-count-activation-title';
      title.textContent = 'KONT';

      const sender = document.createElement('div');
      sender.className = 'ln-count-activation-name';
      sender.textContent = data.nickname.slice(0,80);

      const action = document.createElement('div');
      action.className = 'ln-count-activation-action';
      action.textContent = data.action === 'renew'
        ? 'Kont asaletini yeniledi!'
        : data.action === 'upgrade'
          ? 'Kont seviyesine yükseldi!'
          : 'Kont asaletine ulaştı!';

      image.onerror = ()=>{
        image.hidden = true;
        card.className += ' ln-count-activation-fallback';
      };

      panel.append(title,sender,action);
      card.append(image,panel);
    }
    else if(gift) buildDynamic(card,image,data,gift);
    else card.append(image,text);
    document.body.appendChild(card);

    current = card;

    timer = setTimeout(()=>{
      current?.remove();
      current = null;
      timer = null;
      next();
    },4000);
  }

  function show(data){
    if(!validate(data) || document.hidden) return false;
    if(seen.has(data.id)) return false;
    if(queue.length >= 8) return false;

    seen.add(data.id);

    if(seen.size > 512)
      seen.delete(seen.values().next().value);

    queue.push(Object.freeze({...data}));
    next();

    return true;
  }

  window.addEventListener('erischat:auth',clear);

  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) clear();
  });

  window.LidyaNobilityBanners = Object.freeze({
    show,clear,validate,
    replacesGift(data){
      return validate(data) && Boolean(dynamicGift(data));
    }
  });
})();
