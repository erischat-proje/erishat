/* One bounded transport for API modules, including legacy fetch callers. */
(() => {
  'use strict';
  const nativeFetch=window.fetch.bind(window),pending=new Map(),queues={read:[],write:[]},active={read:0,write:0},limits={read:6,write:3};
  let failures=0,recoverAt=0;
  const abortError=()=>new DOMException('İstek iptal edildi.','AbortError');
  const isApi=input=>{try{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,document.baseURI),base=new URL(window.ERIS_API||window.ERISCHAT_API||'https://erischat-api-production.up.railway.app/v1');return url.origin===base.origin&&(url.pathname.startsWith('/v1/')||url.pathname==='/ready'||url.pathname==='/health');}catch{return false;}};
  function acquire(kind,signal){return new Promise((resolve,reject)=>{
    if(signal.aborted)return reject(abortError());
    if(queues[kind].length>=60)return reject(new Error('Çok fazla istek bekliyor. Birkaç saniye sonra yeniden deneyin.'));
    const ticket={start:()=>{signal.removeEventListener('abort',cancel);active[kind]++;resolve(()=>{active[kind]--;drain(kind);})}};
    function cancel(){const at=queues[kind].indexOf(ticket);if(at>=0)queues[kind].splice(at,1);reject(abortError());}
    signal.addEventListener('abort',cancel,{once:true});queues[kind].push(ticket);drain(kind);
  });}
  function drain(kind){while(active[kind]<limits[kind]&&queues[kind].length)queues[kind].shift().start();}
  async function perform(input,options,kind){
    const controller=new AbortController(),external=options.signal;let timedOut=false,release;
    const ms=Math.max(100,Math.min(180000,Number(options.timeout)||(options.body instanceof FormData?120000:20000)));
    const cancel=()=>controller.abort();external?.addEventListener('abort',cancel,{once:true});if(external?.aborted)cancel();
    const timer=setTimeout(()=>{timedOut=true;cancel();},ms);const opts={...options,signal:controller.signal};delete opts.timeout;
    try{
      release=await acquire(kind,controller.signal);
      const response=await nativeFetch(input,opts);
      // Include the complete JSON body in the deadline. Binary streaming remains native.
      const contentType=response.headers.get('content-type')||'';
      if(!/^(image|audio|video)\/|application\/octet-stream/i.test(contentType)&&String(options.method||'GET').toUpperCase()!=='HEAD')await response.clone().arrayBuffer();
      if(response.status===502||response.status===503||response.status===504){failures++;recoverAt=Date.now()+Math.min(60000,5000*2**Math.min(failures-1,4));}
      else if(response.ok){failures=0;recoverAt=0;}
      return response;
    }catch(error){
      if(!external?.aborted){failures++;recoverAt=Date.now()+Math.min(60000,5000*2**Math.min(failures-1,4));}
      if(timedOut){const e=new Error('Sunucu '+Math.round(ms/1000)+' saniye içinde yanıt vermedi.');e.name='TimeoutError';e.timeout=ms;throw e;}
      throw error;
    }finally{clearTimeout(timer);external?.removeEventListener('abort',cancel);release?.();}
  }
  function fetchApi(input,options={}){
    if(!isApi(input)||input instanceof Request)return nativeFetch(input,options);
    const method=String(options.method||'GET').toUpperCase(),kind=method==='GET'||method==='HEAD'?'read':'write';
    const reusable=method==='GET'&&!options.signal&&!/\/(?:media|audio)(?:\/|\?|$)/.test(String(input));
    if(!reusable)return perform(input,options,kind);
    const headers=new Headers(options.headers||{}),key=JSON.stringify([String(input),[...headers.entries()].sort(),options.credentials||'',options.cache||'',options.timeout||0]);
    if(!pending.has(key)){const promise=perform(input,options,kind);pending.set(key,promise);promise.finally(()=>{if(pending.get(key)===promise)pending.delete(key)}).catch(()=>{});}
    return pending.get(key).then(response=>response.clone());
  }
  function poll(fn,interval,when=()=>true){let busy=false;const run=async()=>{if(busy||document.hidden||navigator.onLine===false||Date.now()<recoverAt||!when())return;busy=true;try{await fn();}catch{}finally{busy=false;}};const timer=setInterval(run,interval);return {run,stop:()=>clearInterval(timer)};}
  window.fetch=fetchApi;
  window.ErisApiTransport={fetch:fetchApi,poll,stats:()=>({active:{...active},queued:{read:queues.read.length,write:queues.write.length},failures,recoverAt})};
})();
