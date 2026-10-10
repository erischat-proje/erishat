(() => {
  'use strict';
  const revision='lydia-rings-20261010';
  function url(value){
    if(!value)return value;
    let source;try{source=new URL(value,document.baseURI)}catch(_){return value}
    const match=source.pathname.match(/\/relationship-assets\/(?:(copper|silver|gold)-(\d+)|rewards\/ring-(\d+))\.png$/);
    if(!match)return value;
    const n=Number(match[2]||match[3]);
    if(n<1||n>(match[3]?2:20))return value;
    const target=new URL('relationship-assets/modern/rings/'+(match[3]?'level':match[1])+'-'+n+'.png',document.baseURI);
    target.searchParams.set('v',revision);return target.href;
  }
  function image(el){const old=el.getAttribute('src'),next=url(old);if(old&&next!==old)el.setAttribute('src',next)}
  function visit(node){if(node.nodeType!==1)return;if(node.matches('img[src]'))image(node);node.querySelectorAll('img[src]').forEach(image)}
  const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')image(record.target);else record.addedNodes.forEach(visit)}});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  visit(document.documentElement);
  window.ErisRingArt={url};
})();
