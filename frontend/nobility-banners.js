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

  function next(){
    if(current || !queue.length) return;

    const data = queue.shift();

    if(document.hidden){
      queue.length = 0;
      return;
    }

    const asset = window.LidyaNobilityAssets?.resolve?.(
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

    card.append(image,text);
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
    show,clear,validate
  });
})();
