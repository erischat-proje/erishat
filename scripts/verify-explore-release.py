#!/usr/bin/env python3
"""Read-only release checks; no account, bearer token, or mutations."""
import argparse,json,urllib.request,urllib.error
VERSION='explore-workspace-v1-20261023'
def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=20) as r:return r.status,r.read()
    except urllib.error.HTTPError as e:return e.code,e.read()
def main():
    p=argparse.ArgumentParser();p.add_argument('--api',default='https://erischat-api-production.up.railway.app');p.add_argument('--web',default='https://www.erischat.com');a=p.parse_args();api=a.api.rstrip('/');web=a.web.rstrip('/');errors=[]
    status,body=fetch(api+'/health')
    try:data=json.loads(body)
    except (ValueError,UnicodeError):data={}
    if status!=200 or data.get('explore_api_version')!=VERSION:errors.append('API Keşfet sürümü eski veya erişilemiyor.')
    if fetch(api+'/ready')[0]!=200:errors.append('API readiness başarısız.')
    for path in ['/v1/explore/feed','/v1/explore/preferences','/v1/explore/readiness']:
        status,_=fetch(api+path)
        if status not in (401,403):errors.append(path+' yetki koruması beklenen yanıtı vermedi: '+str(status))
    status,body=fetch(web+'/')
    if status!=200 or VERSION.encode() not in body:errors.append('Web Keşfet sürümü eski.')
    for name,marker in [('social-feed-live.js','/explore/feed?'),('discovery-live.js','data-room-tools'),('explore-polish.css','.ec-feed-tools')]:
        status,body=fetch(web+'/'+name+'?v='+VERSION)
        if status!=200 or marker.encode() not in body:errors.append(name+' güncel değil.')
    if errors:raise SystemExit('HAZIR DEĞİL:\n'+'\n'.join(errors))
    print('OK: API/web Keşfet sürümü, readiness, korumalı yollar ve modüller doğrulandı. Yetkili staging işlem testi ayrıca gerekir.')
if __name__=='__main__':
    try:main()
    except (OSError,TimeoutError) as e:raise SystemExit('BAĞLANTI HATASI: '+str(e))
