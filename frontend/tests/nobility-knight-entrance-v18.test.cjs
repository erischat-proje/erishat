const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const source=fs.readFileSync(
  'frontend/nobility-entrance.js','utf8'
);

function setup(options={}){
  const overlays=[];
  const timers=new Map();
  const windowEvents=new Map();
  const documentEvents=new Map();
  const videos=[];
  let sequence=0;
  let done=0;

  function element(tag){
    const node={
      tag,
      children:[],
      attributes:{},
      paused:0,
      loads:0,
      plays:0,

      append(...children){
        this.children.push(...children);
      },

      setAttribute(key,value){
        this.attributes[key]=value;
      },

      removeAttribute(key){
        delete this.attributes[key];
        delete this[key];
      },

      remove(){
        const index=overlays.indexOf(this);

        if(index>=0)overlays.splice(index,1);
      },

      pause(){
        this.paused++;
      },

      load(){
        this.loads++;
      },

      play(){
        this.plays++;

        if(options.throwPlay){
          throw Error('Video exception');
        }

        if(options.rejectPlay){
          return Promise.reject(Error('Video failure'));
        }

        return Promise.resolve();
      }
    };

    if(tag==='video')videos.push(node);

    return node;
  }

  const document={
    hidden:false,
    createElement:element,

    body:{
      append(node){overlays.push(node);}
    },

    addEventListener(type,fn){
      documentEvents.set(type,fn);
    },

    removeEventListener(type,fn){
      if(documentEvents.get(type)===fn){
        documentEvents.delete(type);
      }
    }
  };

  const window={
    LidyaNobilityAssets:{
      resolve:(rank,id)=>`${rank}/${id}`
    },

    matchMedia:()=>({
      matches:Boolean(options.reduced)
    }),

    addEventListener(type,fn){
      windowEvents.set(type,fn);
    }
  };

  vm.runInNewContext(source,{
    window,
    document,

    setTimeout(fn,delay){
      const id=++sequence;
      timers.set(id,{fn,delay});
      return id;
    },

    clearTimeout(id){
      timers.delete(id);
    }
  });

  const api=window.LidyaNobilityEntrance;

  return {
    api,
    overlays,
    videos,
    timers,
    document,
    documentEvents,

    get done(){return done;},

    start(rank=1,live=true){
      return api.play(rank,'Test Sovalye',()=>{
        done++;
      },{
        live,
        userId:'knight'
      });
    },

    event(type,detail={}){
      windowEvents.get(type)?.({detail});
    },

    hidden(){
      document.hidden=true;
      documentEvents.get('visibilitychange')?.();
    },

    tick(){
      const entry=timers.entries().next().value;

      if(entry){
        timers.delete(entry[0]);
        entry[1].fn();
      }
    }
  };
}

test('Canli Sovalye girisi orijinal tam ekran',()=>{
  const h=setup();
  assert.equal(h.start(),true);

  assert.ok(h.overlays[0].className.includes(
    'lidya-knight-live-entrance'
  ));

  assert.ok(h.overlays[0].className.includes(
    'lidya-knight-timed-entrance'
  ));

  assert.equal(
    h.overlays[0].attributes.role,'region'
  );

  assert.equal(
    h.overlays[0].attributes['aria-modal'],
    undefined
  );
});

test('Magaza onizlemesi tam ekran',()=>{
  const h=setup();
  h.start(1,false);

  assert.equal(
    h.overlays[0].attributes['aria-modal'],
    'true'
  );
});

for(const rank of [3,4]){
  test('Diger rutbe korunur: '+rank,()=>{
    const h=setup();
    h.start(rank);

    assert.equal(
      h.overlays[0].className,
      'ln-entrance-overlay'
    );

    assert.equal(
      [...h.timers.values()][0].delay,
      15000
    );
  });
}

test('Sovalye video sesi aktif ve satir ici oynar',()=>{
  const h=setup();
  h.start();

  const video=h.videos[0];

  assert.equal(video.muted,false);
  assert.equal(video.defaultMuted,false);
  assert.equal(video.volume,1);
  assert.equal(video.playsInline,true);
});

test('Video bittiginde kaynaklar temizlenir',()=>{
  const h=setup();
  h.start();

  h.videos[0].onended();

  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
  assert.equal(h.videos[0].src,undefined);
  assert.equal(h.done,1);
});

test('12 saniye zaman asimi',()=>{
  const h=setup();
  h.start();

  assert.equal(
    [...h.timers.values()][0].delay,
    12000
  );

  h.tick();

  assert.equal(h.overlays.length,0);
  assert.equal(h.done,1);
});

test('Video hata durumunda poster',()=>{
  const h=setup();
  h.start();

  h.videos[0].onerror();

  assert.equal(h.videos[0].hidden,true);

  assert.ok(
    h.overlays[0].children[0].children.some(
      n=>n.className==='lidya-knight-entrance-poster'
    )
  );

  assert.equal(
    [...h.timers.values()][0].delay,
    3000
  );

  h.tick();
  assert.equal(h.done,1);
});

test('Oynatma reddedilirse poster',async()=>{
  const h=setup({rejectPlay:true});
  h.start();

  await new Promise(resolve => setImmediate(resolve));

  assert.equal(h.videos[0].hidden,true);

  assert.ok(
    h.overlays[0].children[0].children.some(
      n=>n.className==='lidya-knight-entrance-poster'
    )
  );

  assert.equal(
    [...h.timers.values()][0].delay,
    3000
  );

  h.tick();

  assert.equal(h.overlays.length,0);
  assert.equal(h.done,1);
});

test('Oynatma istisnasinda poster',()=>{
  const h=setup({throwPlay:true});
  h.start();

  assert.equal(h.videos[0].hidden,true);
});

test('Hareket azaltma video oynatmaz',()=>{
  const h=setup({reduced:true});
  h.start();

  assert.equal(h.videos[0].plays,0);
  assert.equal(h.videos[0].hidden,true);
});

test('Odadan cikista animasyon temizlenir',()=>{
  const h=setup();
  h.start();

  h.event('erischat:room-closed');

  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
});

test('Oturum degisiminde temizlik',()=>{
  const h=setup();
  h.start();

  h.event('erischat:auth');

  assert.equal(h.overlays.length,0);
  assert.equal(h.done,1);
});

test('Ilgili kullanici engellenince kapanir',()=>{
  const h=setup();
  h.start();

  h.event('erischat:user-block-changed',{
    blocked:true,userId:'knight'
  });

  assert.equal(h.overlays.length,0);
});

test('Farkli kullanici engeli etkilemez',()=>{
  const h=setup();
  h.start();

  h.event('erischat:user-block-changed',{
    blocked:true,userId:'other'
  });

  assert.equal(h.overlays.length,1);
});

test('Arka plana geciste animasyon kapanir',()=>{
  const h=setup();
  h.start();
  h.hidden();

  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
});

test('Canli giris Escape tusunu engellemez',()=>{
  const h=setup();
  h.start();

  h.documentEvents.get('keydown')({
    key:'Escape',
    preventDefault(){assert.fail('Blocked Escape');},
    stopImmediatePropagation(){assert.fail('Blocked key');}
  });

  assert.equal(h.overlays.length,1);
});

test('Onizleme Escape ile kapanir',()=>{
  const h=setup();
  h.start(1,false);

  h.documentEvents.get('keydown')({
    key:'Escape',
    preventDefault(){},
    stopImmediatePropagation(){}
  });

  assert.equal(h.overlays.length,0);
});

test('Eski video yaniti yeni animasyonu kapatamaz',()=>{
  const h=setup();

  h.start();

  const stale=h.videos[0].onended;

  h.start();

  stale();

  assert.equal(h.overlays.length,1);
  assert.equal(h.done,1);

  h.api.close();
  h.api.close();

  assert.equal(h.done,2);
  assert.equal(h.overlays.length,0);
});


// KNIGHT APPROVED ENTRANCE V1.13.5

test('Isim video baslangicinda gizli',()=>{
  const h=setup();
  h.start();

  const name=h.overlays[0].children[0].children[1];

  assert.equal(name.hidden,true);
});

test('Isim 8 saniyeden once gorunmez',()=>{
  const h=setup();
  h.start();

  const video=h.videos[0];
  const name=h.overlays[0].children[0].children[1];

  video.currentTime=7.99;
  video.ontimeupdate();

  assert.equal(name.hidden,true);
});

test('Isim 8 saniyede gorunur',()=>{
  const h=setup();
  h.start();

  const video=h.videos[0];
  const name=h.overlays[0].children[0].children[1];

  video.currentTime=8;
  video.ontimeupdate();

  assert.equal(name.hidden,false);
});

test('Video geri alinirsa isim tekrar gizlenir',()=>{
  const h=setup();
  h.start();

  const video=h.videos[0];
  const name=h.overlays[0].children[0].children[1];

  video.currentTime=9;
  video.ontimeupdate();

  assert.equal(name.hidden,false);

  video.currentTime=3;
  video.ontimeupdate();

  assert.equal(name.hidden,true);
});

test('Kapanista isim zamanlayicisi temizlenir',()=>{
  const h=setup();
  h.start();

  const video=h.videos[0];

  h.api.close();

  assert.equal(video.ontimeupdate,null);
  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
});

test('Diger rutbelerin ses ayarlari korunur',()=>{
  for(const rank of [3,4]){
    const h=setup();
    h.start(rank);

    assert.equal(h.videos[0].muted,true);
    assert.equal(h.videos[0].defaultMuted,true);
  }
});


// COUNT ENTRANCE V1.20.5.1

test('Kont canli girisi tam ekran',()=>{
  const h=setup();

  assert.equal(h.start(2),true);

  assert.match(
    h.overlays[0].className,
    /lidya-count-timed-entrance/
  );

  assert.match(
    h.overlays[0].className,
    /lidya-count-live-entrance/
  );

  assert.equal(h.overlays[0].attributes.role,'region');
});

test('Kont orijinal video ve ses',()=>{
  const h=setup();

  h.start(2);

  const video=h.videos[0];

  assert.equal(video.src,'2/entrance_video');
  assert.equal(video.muted,false);
  assert.equal(video.defaultMuted,false);
  assert.equal(video.volume,1);
  assert.equal(video.playsInline,true);
});

test('Kont ismi dogru zamanda gorunur',()=>{
  const h=setup();

  h.start(2);

  const video=h.videos[0];
  const name=h.overlays[0].children[0].children[1];

  assert.equal(name.hidden,true);

  for(const [time,hidden] of [
    [0,true],
    [6.99,true],
    [7,false],
    [8.2,false],
    [9.79,false],
    [9.8,true],
    [10,true],
    [8,false],
    [3,true]
  ]){
    video.currentTime=time;
    video.ontimeupdate();

    assert.equal(name.hidden,hidden,'Time: '+time);
  }
});

test('Kont onizlemesi tam ekran',()=>{
  const h=setup();

  h.start(2,false);

  assert.match(
    h.overlays[0].className,
    /lidya-count-timed-entrance/
  );

  assert.equal(
    h.overlays[0].attributes['aria-modal'],
    'true'
  );
});

test('Kont video sonunda kaynaklar temizlenir',()=>{
  const h=setup();

  h.start(2);

  h.videos[0].onended();

  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
  assert.equal(h.videos[0].ontimeupdate,null);
  assert.equal(h.videos[0].src,undefined);
  assert.equal(h.done,1);
});

test('Kont oda cikisinda temizlenir',()=>{
  const h=setup();

  h.start(2);
  h.event('erischat:room-closed');

  assert.equal(h.overlays.length,0);
  assert.equal(h.timers.size,0);
});

test('Kont oturum degisiminde temizlenir',()=>{
  const h=setup();

  h.start(2);
  h.event('erischat:auth');

  assert.equal(h.overlays.length,0);
});

test('Kont arka planda temizlenir',()=>{
  const h=setup();

  h.start(2);
  h.hidden();

  assert.equal(h.overlays.length,0);
});

test('Kont engellenen kullanici animasyonu kapanir',()=>{
  const h=setup();

  h.start(2);

  h.event('erischat:user-block-changed',{
    blocked:true,
    userId:'knight'
  });

  assert.equal(h.overlays.length,0);
});

test('Kont video hatasinda poster',()=>{
  const h=setup();

  h.start(2);
  h.videos[0].onerror();

  assert.equal(h.videos[0].hidden,true);

  const children=h.overlays[0].children[0].children;

  assert.equal(children[1].hidden,false);

  assert.ok(children.some(
    n=>n.src==='2/entrance'
  ));

  h.tick();

  assert.equal(h.overlays.length,0);
});

test('Kont hareket azaltma ayarina uyar',()=>{
  const h=setup({reduced:true});

  h.start(2);

  assert.equal(h.videos[0].plays,0);
  assert.equal(h.videos[0].hidden,true);
});

test('Kont 12 saniye zaman asimi',()=>{
  const h=setup();

  h.start(2);

  assert.equal(
    [...h.timers.values()][0].delay,
    12000
  );

  h.tick();

  assert.equal(h.overlays.length,0);
});
