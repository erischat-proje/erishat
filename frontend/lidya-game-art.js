(() => { 'use strict';
const script=document.currentScript; const base=new URL('./assets/lidya-games/',script.src); const cache={};
const aliases={wheel:'wheel',crash:'crash',blackjack:'cards',slot:'seven',cups:'cup',horse_race:'horse',vault:'vault',jackpot:'coin',gold:'crown',ruby:'rose',crystal:'gem',mystery:'gift',cherry:'rose',lemon:'coin',ludo:'pawn',uno:'cards',okey:'dice'};
const known=new Set('coin crash cup horse vault cards wheel rose heart star diamond crown gift fire gem bell seven pawn dice'.split(' '));
const key=k=>known.has(aliases[k]||k)?aliases[k]||k:'coin';
function image(k){ k=key(k); if(!cache[k]){const img=new Image();img.src=new URL(k+'.svg',base).href;cache[k]=img;}return cache[k]; }
function markup(k,cls=''){return '<img class="lg-object '+cls+'" src="'+image(k).src+'" alt="" aria-hidden="true" draggable="false">';}
function draw(ctx,k,x,y,w,h=w){const img=image(k);if(img.complete&&img.naturalWidth)ctx.drawImage(img,x,y,w,h);}
known.forEach(image);window.LidyaGameArt={image,markup,draw};
})();
