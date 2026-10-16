(() => {
'use strict';
const base=new URL('./assets/lidya-games-png/',document.currentScript.src);
const aliases={wheel:'wheel',crash:'crash',blackjack:'cards',slot:'seven',cups:'cup',horse_race:'horse',vault:'vault',jackpot:'coin',gold:'crown',ruby:'rose',crystal:'gem',mystery:'gift',ludo:'pawn',uno:'cards',okey:'dice'};
const known=new Set('coin crash cup horse vault cards wheel rose heart star diamond crown gift fire gem bell seven pawn dice vault-open cherry lemon'.split(' '));
const cache=new Map();const theme=()=>document.documentElement.dataset.erisTheme==='dark'?'dark':'light';
const key=value=>known.has(aliases[value]||value)?aliases[value]||value:'coin';
function image(value){const k=key(value),t=theme(),id=t+'/'+k;if(!cache.has(id)){const img=new Image();img.src=new URL(t+'/'+k+'.png',base).href;cache.set(id,img)}return cache.get(id)}
function markup(value,cls=''){const k=key(value);return '<img class="lg-object '+String(cls).replace(/[^\w -]/g,'')+'" data-lidya-art="'+k+'" src="'+image(k).src+'" alt="" aria-hidden="true" draggable="false">'}
function draw(ctx,value,x,y,w,h=w){const img=image(value);if(img.complete&&img.naturalWidth){ctx.drawImage(img,x,y,w,h);return}if(!img.complete)img.addEventListener('load',()=>{if(ctx.canvas?.isConnected)ctx.drawImage(img,x,y,w,h)},{once:true})}
function sync(){document.querySelectorAll('img[data-lidya-art]').forEach(el=>{const src=image(el.dataset.lidyaArt).src;if(el.src!==src)el.src=src});}
known.forEach(image);window.LidyaGameArt={image,markup,draw,ready:()=>Promise.all([...cache.values()].map(img=>img.decode().catch(()=>{})))};
window.addEventListener('erischat:theme',sync);
})();
