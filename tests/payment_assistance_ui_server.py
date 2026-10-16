"""Disposable local test server, never uses production accounts or databases."""
import os,sys,importlib.util,tempfile,re
from pathlib import Path
from fastapi import Depends
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
spec=importlib.util.spec_from_file_location('payment_tests',Path(__file__).with_name('test_payment_assistance.py'))
t=importlib.util.module_from_spec(spec);spec.loader.exec_module(t)
tmp=tempfile.TemporaryDirectory(prefix='eris-payment-ui-');gen=t.env.__wrapped__(Path(tmp.name));engine,client,call=next(gen);app=t.app
root=Path(os.environ['PAYMENT_TEST_ROOT'])/'frontend';source=(root/'erischat-main.html').read_text()
css='\n'.join(re.findall(r'<style[^>]*>([\s\S]*?)</style>',source))
for href in re.findall(r'<link[^>]+href=["\']([^"\']+)',source):
 path=root/href.split('?')[0].removeprefix('./')
 if path.is_file():css+='\n'+path.read_text()
@app.get('/fixture',response_class=HTMLResponse)
def fixture():
 return '<!doctype html><html data-eris-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><link rel="stylesheet" href="/payment-assistance.css"></head><body><button id="buy" onclick="ErisPurchases.open()">Lidya Yükleme</button><div id="adminMenuMount"></div><section id="messages"><h2>Mesajlar</h2><div class="list"></div></section><script>window.ERISCHAT_API_BASE=location.origin;window.ERIS_API=location.origin+"/v1";window.showView=()=>{};window.ErisChatDM={load:()=>{}};window.ErisProfile={refresh:()=>{}};window.toast=()=>{};</script><script src="/purchase-live.js"></script><script src="/payment-assistance.js"></script><script src="/device-layout.js"></script></body></html>'
@app.get('/v1/admin/me')
def admin_me(user=Depends(t.auth),db=Depends(t.get_db)):
 role=db.get(t.AdminRole,user.id)
 return {'id':user.id,'nickname':user.nickname,'role':role.role if role else None,'ghost_mode':False}
@app.get('/v1/admin/ban-requests')
@app.get('/v1/admin/ban-appeals')
def empty(user=Depends(t.auth)):return []
app.mount('/',StaticFiles(directory=str(root)),name='fixture-files')
if __name__=='__main__':
 import uvicorn
 uvicorn.run(app,host='127.0.0.1',port=int(os.environ.get('PAYMENT_TEST_PORT','55439')),log_level='warning')
