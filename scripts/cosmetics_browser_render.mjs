#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ASSET_ROOT = join(ROOT, 'Gereken_icerikler');
const exts = new Set(['.jpg','.jpeg','.png','.webp','.gif','.svg']);
function walk(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const p=join(dir,entry.name);
    return entry.isDirectory() ? walk(p) : exts.has(entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()) ? [p] : [];
  });
}
const cosmeticRoot = join(ROOT, 'Gereken_icerikler');
const assets = walk(cosmeticRoot).map(p => relative(ROOT,p).replaceAll('\\','/')).sort();
if (assets.length !== 178) throw new Error(`expected 178 assets, found ${assets.length}`);

const server = spawn('python', ['-m','http.server','4174','--directory',ROOT], {stdio:'ignore'});
try {
  await new Promise(r=>setTimeout(r,800));
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:4174/frontend/erischat-main.html',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async (paths)=>{
    const rows=[];
    for(const path of paths){
      const img=new Image();
      img.src='/' + path.split('/').map(encodeURIComponent).join('/');
      try { await img.decode(); } catch (_) {}
      const ok=img.complete && img.naturalWidth>0 && img.naturalHeight>0;
      let transparent=null;
      if(ok && /\.(png|svg)$/i.test(path)){
        const canvas=document.createElement('canvas');
        canvas.width=Math.min(img.naturalWidth,160);
        canvas.height=Math.min(img.naturalHeight,160);
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        const data=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        transparent=false;
        for(let i=3;i<data.length;i+=4){ if(data[i]<250){transparent=true;break;} }
      }
      rows.push({path,ok,width:img.naturalWidth,height:img.naturalHeight,transparent});
    }
    return rows;
  },assets);
  const failed=result.filter(x=>!x.ok);
  const frames=result.filter(x=>x.path.includes('/standartcerceve/') || x.path.includes('/vipcerceve/'));
  const opaqueFrames=frames.filter(x=>x.ok && x.transparent===false);
  const standardFrames=frames.filter(x=>x.path.includes('/standartcerceve/'));
  if (standardFrames.length !== 40) throw new Error(`expected 40 standard frame assets, found ${standardFrames.length}`);
  if(failed.length) throw new Error('asset render failures: '+failed.map(x=>x.path).join(','));
  console.log(`COSMETICS_BROWSER_RENDER_PASS assets=${result.length} png_alpha_frames=${frames.length-opaqueFrames.length}/${frames.length} opaque_png_frames=${opaqueFrames.length}`);
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
