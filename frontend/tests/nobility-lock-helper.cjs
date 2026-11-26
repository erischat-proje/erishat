'use strict';

function createLockManager(){
 const held=new Map();
 const events=[];

 return {
  held,
  events,

  async request(name,options,callback){
   if(options.mode!=='exclusive'||
      options.ifAvailable!==true){
    throw new Error('Invalid lock options');
   }

   events.push(['request',name]);

   if(held.has(name)){
    events.push(['denied',name]);
    return await callback(null);
   }

   const lock=Object.freeze({
    name,
    mode:'exclusive'
   });

   held.set(name,lock);
   events.push(['acquired',name]);

   try{
    return await callback(lock);
   }finally{
    held.delete(name);
    events.push(['released',name]);
   }
  }
 };
}

module.exports={createLockManager};
