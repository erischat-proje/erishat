#!/usr/bin/env python3
"""Read-only public deployment probe. No token, account or production writes."""
import argparse
import concurrent.futures
import json
import urllib.error
import urllib.request

VERSION='20261022-management-operations-v7'
PATHS=['/v1/admin/operations-desk/support','/v1/admin/operations-desk/feedback','/v1/admin/operations-desk/referrals','/v1/admin/operations-desk/announcement-drafts','/v1/admin/operations-desk/appeals','/v1/admin/workspace','/v1/admin/workspace/users','/v1/admin/workspace/role-requests','/v1/admin/operations/overview','/v1/admin/cases','/v1/admin/finance-audit/overview','/v1/admin/finance-audit/manual-operations','/v1/admin/finance-audit/alerts','/v1/admin/fraud-review/signals','/v1/admin/role-actions/SA','/v1/admin/management/finance-requests','/v1/admin/management/audit','/v1/admin/management/signal-reviews','/v1/admin/finance-audit/orders','/v1/admin/finance-audit/vip']

def fetch(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=20) as response:
            return response.status,response.read(),response.headers.get('Content-Type','')
    except urllib.error.HTTPError as error:return error.code,error.read(),error.headers.get('Content-Type','')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--api',default='https://erischat-api-production.up.railway.app')
    parser.add_argument('--web',default='https://www.lidyachat.com')
    args=parser.parse_args();api=args.api.rstrip('/');web=args.web.rstrip('/');failed=[]
    status,data,_=fetch(api+'/health')
    try:health=json.loads(data)
    except (ValueError,UnicodeError):health={}
    if status!=200 or health.get('management_api_version')!=VERSION:failed.append('API yeni yönetim sürümünde değil.')
    else:print('OK: API sürümü '+VERSION)
    if fetch(api+'/ready')[0]!=200:failed.append('API readiness başarısız.')
    for path in PATHS:
        status,_,_=fetch(api+path)
        print(str(status)+' '+path)
        if status not in (401,403):failed.append(path+' beklenen yetki yanıtını vermedi.')
    status,page,_=fetch(web+'/')
    if status!=200 or b'management-operations-v7-20261022' not in page:failed.append('Web yeni yönetim sürümünde değil.')
    for filename,marker in [('admin-workspace.js',b'announcementDesk'),('admin-workspace.css',b'.aw-menu-tools'),('admin-live.js',b'ErisAdminWorkspace'),('ban-workflow-live.js',b'openAppeal'),('support-live.js',b'openAssigned'),('suggestion-live.js',b'openReview'),('payment-assistance.js',b'openRecord'),('management-center.js',b'recordFields')]:
        status,source,kind=fetch(web+'/'+filename)
        if status!=200 or marker not in source or source.lstrip().lower().startswith(b'<!doctype html'):failed.append(filename+' yeni sürümü yüklenemedi.')
    def image(pair):
        theme,key=pair;path=f'/assets/admin-lidya-v4/{theme}/{key}.png';status,data,kind=fetch(web+path)
        return path,status==200 and data.startswith(b'\x89PNG\r\n\x1a\n') and 'image/png' in kind
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for path,ok in pool.map(image,[(t,k) for t in ['light','dark'] for k in ['command','cases','emergency','finance','fraud','audit']]):
            if not ok:failed.append(path+' yüklenemedi.')
    if failed:raise SystemExit('HAZIR DEĞİL:\n'+'\n'.join(failed))
    print('OK: API yolları yetki korumalı, readiness başarılı, web sürümü ve 12 PNG doğrulandı. Yetkili hesap içi işlem testi ayrıca yapılmalıdır.')
if __name__=='__main__':
    try:main()
    except (OSError,TimeoutError) as error:raise SystemExit('BAĞLANTI HATASI: '+str(error))
