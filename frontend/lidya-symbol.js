/* Show the artist's Lidya coin to the right of numeric amounts in live UI. */
(() => {
  const pattern=/(\d[\d.,\s]*?)\s*Lidya\b/gi;
  function convert(node){
    if(node.parentElement?.closest('script,style,textarea,option,[contenteditable],.eris-lidya-rendered'))return;
    const source=node.nodeValue||'';pattern.lastIndex=0;
    if(!pattern.test(source))return;
    pattern.lastIndex=0;
    const fragment=document.createDocumentFragment();let from=0,match;
    while((match=pattern.exec(source))){
      fragment.appendChild(document.createTextNode(source.slice(from,match.index)));
      const amount=document.createElement('span');amount.className='eris-lidya-rendered';
      amount.appendChild(document.createTextNode(match[1].trimEnd()));
      const coin=document.createElement('img');coin.className='eris-lidya-coin';coin.src='./lidya-coin.png';coin.alt=' Lidya';
      amount.appendChild(coin);fragment.appendChild(amount);from=pattern.lastIndex;
    }
    fragment.appendChild(document.createTextNode(source.slice(from)));
    node.replaceWith(fragment);
  }
  function scan(root){
    if(root.nodeType===Node.TEXT_NODE){convert(root);return}
    if(root.nodeType!==Node.ELEMENT_NODE||root.matches('script,style,textarea,option,[contenteditable],.eris-lidya-rendered'))return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const texts=[];
    while(walker.nextNode())texts.push(walker.currentNode);
    texts.forEach(convert);
  }
  const start=()=>{
    scan(document.body);
    new MutationObserver(records=>{for(const r of records){
      if(r.type==='characterData')scan(r.target);
      else for(const node of r.addedNodes)scan(node);
    }}).observe(document.body,{childList:true,subtree:true,characterData:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
