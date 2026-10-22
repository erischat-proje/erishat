"""Business-flow integration with real FastAPI, SQLAlchemy and private photo storage.
PAYMENT_TEST_DATABASE may point at a dedicated disposable PostgreSQL database.
Never point this test suite at production: test tables are created/dropped.
"""
import os,sys,base64,json
from pathlib import Path
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
import pytest
from PIL import Image
from sqlalchemy import create_engine,select,func,event,BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from fastapi import FastAPI,Depends,Header,HTTPException
from fastapi.testclient import TestClient

ROOT=Path(os.environ.get('PAYMENT_TEST_ROOT',Path(__file__).resolve().parents[1]));sys.path.insert(0,str(ROOT/'backend'))
os.environ.setdefault('DATABASE_URL','sqlite://')
from app.db import Base,get_db
from app.models import User
from app.admin_models import AdminRole,AdminAuditLog,FaActionLog
from app.room_models import Room
from app.platform_models import Notification,VipStatus
from app.vip_membership_models import VipMembership,VipPurchaseReceipt,VipCycleAudit
from app.purchase_models import PaymentSettings,LidyaOrder,LidyaOperation,LidyaPurchaseMessage
from app.payment_assistance_models import PaymentRequest,PaymentMessage,PaymentEvent,PaymentPresence,PaymentReview,PaymentReviewClosure
from app import payment_assistance as pa,purchase_routes as legacy,system_data
@compiles(BigInteger,'sqlite')
def sqlite_bigint(type_,compiler,**kw):return 'INTEGER'

def auth(x_test_user:str|None=Header(None),authorization:str|None=Header(None),db:Session=Depends(get_db)):
    x_test_user=x_test_user or (authorization.removeprefix('Bearer ') if authorization else None)
    if not x_test_user:raise HTTPException(401,'Oturum gerekli')
    user=db.get(User,x_test_user)
    if not user or not user.is_active:raise HTTPException(401,'Geçersiz oturum')
    return user
app=FastAPI();pa.register_auth(auth);legacy.register_auth(auth);app.include_router(pa.router);app.include_router(legacy.router)
# Exercise the production role-list handler with the real User/AdminRole join.
import ast
roles_node=next(n for n in ast.walk(ast.parse((ROOT/'backend/app/admin_routes.py').read_text())) if isinstance(n,ast.FunctionDef) and n.name=='roles')
roles_node.decorator_list=[]
roles_ns=dict(Session=Session,Depends=Depends,get_db=get_db,User=User,AdminRole=AdminRole,current_user_dependency=auth,select=select,record=lambda *a,**kw:None,require_role=lambda db,user,role:pa.require_da(db,user))
exec(compile(ast.Module(body=[roles_node],type_ignores=[]),'production-role-list','exec'),roles_ns)
app.add_api_route('/v1/admin/roles',roles_ns['roles'],methods=['GET'])
tables=[m.__table__ for m in [User,Room,AdminRole,AdminAuditLog,FaActionLog,Notification,PaymentSettings,LidyaOrder,LidyaOperation,LidyaPurchaseMessage,PaymentRequest,PaymentMessage,PaymentEvent,PaymentPresence,PaymentReview,PaymentReviewClosure,system_data.LidyaLedger,VipStatus,VipMembership,VipPurchaseReceipt,VipCycleAudit]]
@pytest.fixture
def env(tmp_path):
    url=os.environ.get('PAYMENT_TEST_DATABASE') or 'sqlite:///'+str(tmp_path/'payments.db')
    engine=create_engine(url,connect_args={'check_same_thread':False,'timeout':15} if url.startswith('sqlite') else {})
    if url.startswith('sqlite'):
        @event.listens_for(engine,'connect')
        def foreign_keys(connection,record):connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.drop_all(engine,tables=tables);Base.metadata.create_all(engine,tables=tables)
    def db_session():
        with Session(engine,expire_on_commit=False,autoflush=False) as db:yield db
    app.dependency_overrides[get_db]=db_session
    original_record=system_data.record;system_data.record=lambda *a,**k:None
    with Session(engine) as db:
        for n in ['u','v','w','da','da2','fa','ua','sa']:
            db.add(User(id=n,public_id=str(1000000000+['u','v','w','da','da2','fa','ua','sa'].index(n)),_nickname=n,_avatar='x',lidya=0,is_active=True))
        db.commit()
        for n in ['da','da2','fa','ua','sa']:db.add(AdminRole(user_id=n,role=n.rstrip('2').upper(),ghost_mode=False))
        db.commit()
    client=TestClient(app)
    def call(who,route,body=None,expect=200):
        r=client.request('POST' if body is not None else 'GET','/v1/payment-assistance'+route,headers={'X-Test-User':who} if who else {},json=body)
        assert r.status_code==expect,(who,route,r.status_code,r.text)
        return r.json() if r.headers.get('content-type','').startswith('application/json') else r
    yield engine,client,call
    app.dependency_overrides.clear();engine.dispose();system_data.record=original_record

def new(call,user='u',package=1):return call(user,'/requests',{'package_id':package,'request_key':str(uuid4())})
def connected(call,user='u',agent='da',package=1):
    r=new(call,user,package);id=r['id'];call(agent,f'/requests/{id}/accept',{});call(agent,f'/requests/{id}/ready',{});call(user,f'/requests/{id}/ready',{});return id

def photo(color='red'):
    im=Image.new('RGB',(20,20),color);b=BytesIO();im.save(b,'PNG');return 'data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()

def send_photo(call,id,user='u',color='red'):
    return call(user,f'/requests/{id}/messages',{'message':'Dekont','photo':photo(color),'request_key':str(uuid4())})['id']

def test_prices_queue_idempotency_and_roles(env):
    engine,client,call=env
    call(None,'/catalog',expect=401)
    p=call('u','/catalog')['packages'];assert len(p)==16 and all(x['total']==x['base']+x['bonus'] for x in p)
    request={'package_id':16,'request_key':str(uuid4())}
    r=call('u','/requests',request);assert (r['price_try'],r['total'],r['available_da'])==(3627,204000,0)
    assert call('u','/requests',request)['id']==r['id']
    call('u','/requests',{**request,'package_id':1},expect=409)
    call('u','/requests',{'package_id':2,'request_key':str(uuid4())},expect=409)
    for role in ['u','fa','ua','sa']:
        call(role,'/admin/requests',expect=403);call(role,'/presence',{},expect=403);call(role,f"/requests/{r['id']}/accept",{},expect=403)
    call('da','/presence',{});assert new(call,'v')['available_da']==1
    call('v',f"/requests/{r['id']}",expect=403)
    call('u',f"/requests/{r['id']}/cancel",{});assert not call('u','/state')['own']
    for endpoint in ['orders','orders/fake/report','orders/fake/accept','orders/fake/decision','orders/fake/messages','orders/fake/document']:
        path='/v1/'+('admin/purchases/' if endpoint.endswith('/accept') or endpoint.endswith('/decision') else 'purchases/')+endpoint
        body={'package_id':1,'method':'iban','request_key':str(uuid4())} if endpoint=='orders' else {'evidence':photo(),'approve':False,'message':'hi'}
        response=client.post(path,headers={'X-Test-User':'da'},json=body);assert response.status_code==409,(path,response.text)

def test_two_ack_chat_credit_finish_archive(env):
    engine,client,call=env;r=new(call);id=r['id'];call('da',f'/requests/{id}/accept',{})
    call('da2',f'/requests/{id}/accept',{},expect=409)
    call('u',f'/requests/{id}/messages',{'message':'erken','request_key':str(uuid4())},expect=409)
    assert call('da',f'/requests/{id}/ready',{})['status']=='connecting'
    assert call('u',f'/requests/{id}/ready',{})['status']=='chat'
    mid=send_photo(call,id);assert call('u',f'/requests/{id}/photos/{mid}').headers['cache-control']=='private, no-store'
    call('v',f'/requests/{id}/photos/{mid}',expect=403)
    call('da',f'/requests/{id}/approve',{},expect=409)
    pay={'photo_message_id':mid,'transaction_reference':'BANK-REF-0001','verified':True}
    call('da',f'/requests/{id}/credit',{**pay,'verified':False},expect=422)
    call('da',f'/requests/{id}/credit',{**pay,'transaction_reference':'      '},expect=422)
    result=call('da',f'/requests/{id}/credit',pay);assert result['credited']
    call('da',f'/requests/{id}/credit',pay)
    with Session(engine) as db:
        assert db.get(User,'u').lidya==95;assert db.scalar(select(func.count()).select_from(LidyaOperation))==1
    call('da',f'/requests/{id}/begin-rejection',{},expect=409)
    assert call('da',f'/requests/{id}/approve',{})['status']=='finishing'
    assert call('u','/state')['own'][0]['status']=='finishing'
    assert call('da',f'/requests/{id}/finish',{})['status']=='approved'
    assert not call('u','/state')['own'] and not call('da','/state')['assigned']
    call('u',f'/requests/{id}/messages',expect=409);call('u',f'/requests/{id}/photos/{mid}',expect=403)
    call('fa',f'/admin/records/{id}',expect=403)
    archive=call('da2',f'/admin/records/{id}');assert archive['operation']['amount']=='95'
    assert call('da2',f'/admin/records/{id}/messages')['items'][0]['has_photo']
    assert call('da2',f'/admin/records/{id}/photos/{mid}').headers['content-type']=='image/jpeg'
    actions={x['action'] for x in call('da2',f'/admin/records/{id}/events')['items']}
    assert {'requested','accepted','ready','chat_opened','credited','approved','closed','record_viewed'}<=actions

def test_rejection_recovery_privacy_and_duplicate_receipt(env):
    engine,client,call=env;id=connected(call);call('da',f'/requests/{id}/begin-rejection',{})
    call('u',f'/requests/{id}/messages',expect=409)
    call('da',f'/requests/{id}/reject',{'reason':' '},expect=422)
    call('da',f'/requests/{id}/reject',{'reason':'x'*301},expect=422)
    assert call('da','/state')['assigned'][0]['status']=='rejecting'
    call('da',f'/requests/{id}/reject',{'reason':'Banka hareketi bulunamadı.'})
    assert call('u',f'/requests/{id}')['reason']=='Banka hareketi bulunamadı.'
    id2=connected(call,'v');mid=send_photo(call,id2,'v');pay={'photo_message_id':mid,'transaction_reference':'REF-SAME-123','verified':True};call('da',f'/requests/{id2}/credit',pay);call('da',f'/requests/{id2}/approve',{});call('da',f'/requests/{id2}/finish',{})
    id3=connected(call,'w');mid3=send_photo(call,id3,'w');call('da',f'/requests/{id3}/credit',{'photo_message_id':mid3,'transaction_reference':'OTHER-REF-123','verified':True},expect=409)
    with Session(engine) as db:
        role=db.get(AdminRole,'da');role.role='FA';db.commit()
    call('da',f'/requests/{id3}/ready',{},expect=403)
    recovered=call('da2',f'/requests/{id3}/recover',{'reason':'Yetki değişimi nedeniyle devralındı.'});assert recovered['status']=='connecting' and not recovered['customer_ack']
    call('da',f'/requests/{id3}/messages',expect=403)

def test_message_idempotency_validation_and_cursors(env):
    engine,client,call=env;id=connected(call);payload={'message':'Selam','request_key':str(uuid4())}
    mid=call('u',f'/requests/{id}/messages',payload)['id'];assert call('u',f'/requests/{id}/messages',payload)['id']==mid
    call('u',f'/requests/{id}/messages',{**payload,'message':'Değişti'},expect=409)
    call('u',f'/requests/{id}/messages',{'message':'','request_key':str(uuid4())},expect=422)
    call('u',f'/requests/{id}/messages',{'message':'x','photo':'data:text/html;base64,SGk=','request_key':str(uuid4())},expect=429)
    assert call('u',f'/requests/{id}/messages?after={mid}')['items']==[]
    call('v',f'/requests/{id}/read',{'message_id':mid},expect=403)
    call('u',f'/requests/{id}/read',{'message_id':mid})
    with Session(engine) as db:
        m=db.get(PaymentMessage,mid);m.created_at=datetime.now(timezone.utc)-timedelta(seconds=3);db.commit()
    call('u',f'/requests/{id}/messages',{'message':'x','photo':'data:text/html;base64,SGk=','request_key':str(uuid4())},expect=422)

def test_concurrent_claim_and_creation(env):
    engine,client,call=env;r=new(call)
    def claim(agent):return client.post(f"/v1/payment-assistance/requests/{r['id']}/accept",headers={'X-Test-User':agent},json={}).status_code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(claim,['da','da2']))
    assert sorted(results)==[200,409],results
    def create(_):return client.post('/v1/payment-assistance/requests',headers={'X-Test-User':'v'},json={'package_id':1,'request_key':str(uuid4())}).status_code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(create,[1,2]))
    assert sorted(results)==[200,409],results

def test_concurrent_credit_busy_agent_and_active_recovery_guard(env,monkeypatch):
    engine,client,call=env;id=connected(call)
    # A newly accepted request cannot be stolen merely because a heartbeat is absent.
    call('da2',f'/requests/{id}/recover',{'reason':'Erken devralma denemesi.'},expect=409)
    r=new(call,'v');call('da',f"/requests/{r['id']}/accept",{},expect=409)
    mid=send_photo(call,id);payload={'photo_message_id':mid,'transaction_reference':'CONCURRENT-REF-001','verified':True}
    def credit(_):return client.post(f'/v1/payment-assistance/requests/{id}/credit',headers={'X-Test-User':'da'},json=payload).status_code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(credit,[1,2]))
    assert all(code in [200,409] for code in results),results
    with Session(engine) as db:
        assert db.get(User,'u').lidya==95
        assert db.get(VipMembership,'u').total_purchased==95
        assert db.scalar(select(func.count()).select_from(VipPurchaseReceipt).where(VipPurchaseReceipt.user_id=='u'))==1
        assert db.scalar(select(func.count()).select_from(LidyaOperation))==1
        ledgers=list(db.scalars(select(system_data.LidyaLedger).where(system_data.LidyaLedger.operation=='payment_assistance_credit')))
        assert len(ledgers)==1 and ledgers[0].delta==95 and ledgers[0].reference_id==id
    call('da',f'/requests/{id}/credit',payload)
    # A generic manual addition cannot bypass the linked payment credit.
    with Session(engine) as db:
        monkeypatch.setattr(legacy,'exemption',lambda *a:(True,'test-only'))
        with pytest.raises(HTTPException) as exc:legacy.manual_change(db,db.get(User,'da'),db.get(User,'u'),legacy.ManualAmount(amount=95,request_key=str(uuid4())),'EKLEME')
        assert exc.value.status_code==409;db.rollback()


def test_photo_message_and_archive_pagination(env):
    engine,client,call=env;id=connected(call)
    with Session(engine) as db:
        for n in range(205):db.add(PaymentMessage(request_id=id,sender_id='u',sender_public_id='1000000000',sender_side='customer',request_key=f'pagination-key-{n:016d}',message=f'message {n}'))
        for n in range(205):db.add(PaymentEvent(request_id=id,actor_id='da',actor_public_id='1000000003',action='test_event',details='{}'))
        db.commit()
    data=call('u',f'/requests/{id}/messages');assert len(data['items'])==100 and data['next']
    data2=call('u',f"/requests/{id}/messages?after={data['next']}");assert len(data2['items'])==100 and data2['next']
    data3=call('u',f"/requests/{id}/messages?after={data2['next']}");assert len(data3['items'])==5 and not data3['next']
    events=call('da',f'/admin/records/{id}/events');assert len(events['items'])==200 and events['next']
    call('u',f'/admin/records/{id}/events',expect=403)

def test_legacy_pending_request_can_be_explicitly_cancelled(env):
    engine,client,call=env
    with Session(engine) as db:
        db.add(LidyaOrder(id='legacy-order',user_id='u',request_key='legacy-request-key',package_id=1,price_try=2,base=80,bonus=15,total=95,method='iban',reference='LEGACY-REFERENCE',status='pending',bank_json='{}',evidence='',decision_note=''));db.commit()
    assert call('u','/catalog')['legacy_pending'][0]['id']=='legacy-order'
    call('u','/requests',{'package_id':1,'request_key':str(uuid4())},expect=409)
    call('v','/legacy/legacy-order/cancel',{},expect=403)
    call('u','/legacy/legacy-order/cancel',{})
    assert not call('u','/catalog')['legacy_pending']
    assert new(call)['status']=='pending'

def test_simultaneous_ready_opens_chat_once(env):
    engine,client,call=env;id=new(call)['id'];call('da',f'/requests/{id}/accept',{})
    def ready(who):return client.post(f'/v1/payment-assistance/requests/{id}/ready',headers={'X-Test-User':who},json={}).status_code
    with ThreadPoolExecutor(2) as pool:results=list(pool.map(ready,['u','da']))
    assert results==[200,200]
    result=call('u',f'/requests/{id}');assert result['status']=='chat' and result['customer_ack'] and result['agent_ack']
    with Session(engine) as db:assert db.scalar(select(func.count()).select_from(PaymentEvent).where(PaymentEvent.request_id==id,PaymentEvent.action=='chat_opened'))==1

def test_truncated_receipt_is_validation_error_and_conversation_survives(env):
    _,_,call=env;id=connected(call)
    image=Image.effect_noise((256,256),80).convert('RGB');stream=BytesIO();image.save(stream,'JPEG');raw=stream.getvalue()[:-20]
    # PIL.verify accepts this header, but full pixel decoding raises OSError.
    Image.open(BytesIO(raw)).verify()
    with pytest.raises(OSError):Image.open(BytesIO(raw)).load()
    encoded='data:image/jpeg;base64,'+base64.b64encode(raw).decode()
    call('u',f'/requests/{id}/messages',{'message':'Dekont','photo':encoded,'request_key':str(uuid4())},expect=422)
    assert call('u',f'/requests/{id}/messages')['items']==[]
    msg=send_photo(call,id)
    assert call('da',f'/requests/{id}/photos/{msg}').headers['content-type']=='image/jpeg'

def test_pending_alerts_are_da_only_exclude_self_and_disappear_on_claim(env):
    _,_,call=env;first=new(call);own=new(call,'da')
    state=call('da','/state');assert [r['id'] for r in state['pending_alerts']]==[first['id']];assert state['pending_count']==1
    for who in ['u','fa','ua','sa']:
        state=call(who,'/state');assert state['pending_alerts']==[];assert state['pending_count']==0
    call('da2',f'/requests/{first["id"]}/accept',{})
    assert call('da','/state')['pending_alerts']==[]
    assert [r['id'] for r in call('da2','/state')['pending_alerts']]==[own['id']]

def test_white_receipt_rejected_but_text_on_white_page_is_preserved(env):
    _,_,call=env;id=connected(call)
    call('u',f'/requests/{id}/messages',{'message':'boş','photo':photo('white'),'request_key':str(uuid4())},expect=422)
    from PIL import ImageDraw
    img=Image.new('RGB',(400,600),'white');ImageDraw.Draw(img).text((25,40),'DEKONT 123456 399 LIDYA',fill='black');out=BytesIO();img.save(out,'PNG')
    data='data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()
    msg=call('u',f'/requests/{id}/messages',{'message':'dekont','photo':data,'request_key':str(uuid4())})['id']
    for who in ['u','da']:
        response=call(who,f'/requests/{id}/photos/{msg}')
        with Image.open(BytesIO(response.content)) as stored:assert stored.convert('L').getextrema()[0]<100

def test_old_saved_white_receipt_shows_reupload_error(env):
    engine,_,call=env;id=connected(call);mid=send_photo(call,id)
    out=BytesIO();Image.new('RGB',(100,200),'white').save(out,'JPEG')
    with Session(engine) as db:db.get(PaymentMessage,mid).photo=out.getvalue();db.commit()
    for who in ['u','da']:assert 'boş/beyaz' in call(who,f'/requests/{id}/photos/{mid}',expect=422)['detail']

def test_all_da_reviews_required_before_hiding_but_archive_retains_everything(env):
    engine,_,call=env;id=connected(call);photo_id=send_photo(call,id)
    call('da',f'/requests/{id}/begin-rejection',{});call('da',f'/requests/{id}/reject',{'reason':'Banka hareketi doğrulanamadı.'})
    call('da',f'/admin/records/{id}/review',{},expect=409) # Must open first.
    for who in ['u','fa','ua','sa']:
        call(who,'/admin/records',expect=403);call(who,f'/admin/records/{id}/review',{},expect=403)
    initial=call('da','/admin/records');assert initial['total']==1;number=initial['items'][0]['transaction_number'];assert number
    call('da',f'/admin/records/{id}');state=call('da',f'/admin/records/{id}/review',{})
    assert state['reviewed'] and state['reviewed_count']==1 and state['required_count']==2 and not state['review_archived']
    assert call('da','/admin/records')['total']==1
    call('da',f'/admin/records/{id}/review',{})
    with Session(engine) as db:assert db.scalar(select(func.count()).select_from(PaymentReview))==1
    call('da2',f'/admin/records/{id}');state=call('da2',f'/admin/records/{id}/review',{})
    assert state['review_archived'];assert call('da','/admin/records')['total']==0
    archive=call('da','/admin/records?archive=true');assert archive['total']==1;assert archive['items'][0]['transaction_number']==number
    assert call('da2',f'/admin/records/{id}/photos/{photo_id}').status_code==200
    assert call('da2',f'/admin/records/{id}/messages')['items'][0]['has_photo']
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(PaymentEvent).where(PaymentEvent.action=='review_confirmed'))==2
        assert db.scalar(select(func.count()).select_from(PaymentReviewClosure))==1
        assert db.scalar(select(func.count()).select_from(AdminAuditLog).where(AdminAuditLog.action=='payment_review_archived'))==1
        # Archived records do not reappear if another DA is appointed later.
        db.add(AdminRole(user_id='w',role='DA',ghost_mode=False));db.commit()
    assert call('w','/admin/records')['total']==0
    assert call('w','/admin/records?archive=true')['total']==1

def test_review_index_twenty_per_page_stable_numbers_and_no_missing_records(env):
    engine,_,call=env
    with Session(engine) as db:
        for n in range(43):
            row=PaymentRequest(id=str(uuid4()),user_id='u',public_id='1000000000',nickname='u',request_key=str(uuid4()),package_id=1,price_try=7,base=300,bonus=99,total=399,status='cancelled',reason='',customer_ack=False,agent_ack=False,customer_read=0,agent_read=0,created_at=datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(seconds=n))
            db.add(row);db.flush();db.add(PaymentEvent(request_id=row.id,actor_id='u',actor_public_id='1000000000',action='requested',details='{}'))
        db.commit()
    pages=[call('da','/admin/records?page='+str(n)) for n in [1,2,3]]
    assert [len(p['items']) for p in pages]==[20,20,3]
    assert all(p['pages']==3 and p['total']==43 and p['page_size']==20 for p in pages)
    ids=[r['id'] for p in pages for r in p['items']];numbers=[r['transaction_number'] for p in pages for r in p['items']]
    assert len(set(ids))==43 and len(set(numbers))==43
    assert call('da','/admin/records?page=999')['page']==3
    call('da','/admin/records?page=0',expect=422)

def test_live_record_cannot_be_reviewed_and_inactive_roles_not_required(env):
    engine,_,call=env;r=new(call);id=r['id'];call('da',f'/admin/records/{id}')
    call('da',f'/admin/records/{id}/review',{},expect=409)
    call('u',f'/requests/{id}/cancel',{})
    with Session(engine) as db:db.get(User,'da2').is_active=False;db.commit()
    call('da',f'/admin/records/{id}');state=call('da',f'/admin/records/{id}/review',{})
    assert state['review_archived'] and state['required_count']==1


def test_role_list_includes_actual_profile_id_and_keeps_internal_api_id(env):
    _,client,_=env
    response=client.get('/v1/admin/roles',headers={'X-Test-User':'da'});assert response.status_code==200
    rows=response.json();assert len(rows)==5
    row=next(r for r in rows if r['user_id']=='da');assert row['public_id']=='1000000003';assert row['role']=='DA';assert row['nickname']
    assert all(r['public_id'].isdigit() and len(r['public_id'])==10 for r in rows)
    for who in ['u','fa','ua','sa']:assert client.get('/v1/admin/roles',headers={'X-Test-User':who}).status_code==403

def test_only_customer_uploads_receipt_and_credit_uses_it_automatically(env):
    engine,_,call=env;id=connected(call)
    assert call('da',f'/requests/{id}/credit-evidence')['photo_message_id'] is None
    call('da',f'/requests/{id}/messages',{'message':'agent','photo':photo('blue'),'request_key':str(uuid4())},expect=403)
    call('da',f'/requests/{id}/credit',{'transaction_reference':'AUTO-NO-PHOTO','verified':True},expect=422)
    mid=send_photo(call,id)
    assert call('da',f'/requests/{id}/credit-evidence')['photo_message_id']==mid
    call('u',f'/requests/{id}/credit-evidence',expect=403)
    call('da2',f'/requests/{id}/credit-evidence',expect=403)
    result=call('da',f'/requests/{id}/credit',{'transaction_reference':'AUTO-PHOTO-123','verified':True});assert result['credited']
    with Session(engine) as db:
        operation=db.get(LidyaOperation,result['credit_operation_id']);stored=db.get(PaymentMessage,mid)
        assert base64.b64decode(operation.evidence.split(',')[1])==stored.photo
        assert db.get(User,'u').lidya==95
        assert db.get(VipMembership,'u').total_purchased==95
        assert db.scalar(select(func.count()).select_from(VipPurchaseReceipt).where(VipPurchaseReceipt.user_id=='u'))==1

def test_customer_history_has_twenty_per_page_and_cannot_access_other_accounts(env):
    engine,_,call=env
    with Session(engine) as db:
        for who,count in [('u',43),('v',3)]:
            for n in range(count):
                row=PaymentRequest(id=str(uuid4()),user_id=who,public_id='1000000000' if who=='u' else '1000000001',nickname=who,request_key=str(uuid4()),package_id=1,price_try=7,base=320,bonus=79,total=399,status='cancelled',reason='',customer_ack=False,agent_ack=False,customer_read=0,agent_read=0,created_at=datetime(2026,1,1,tzinfo=timezone.utc)+timedelta(seconds=n))
                db.add(row);db.flush();db.add(PaymentEvent(request_id=row.id,actor_id=who,actor_public_id=row.public_id,action='requested',details='{}'))
        db.commit()
    pages=[call('u','/history?page='+str(p)) for p in [1,2,3]]
    assert [len(p['items']) for p in pages]==[20,20,3]
    assert all(p['page_size']==20 and p['total']==43 and p['pages']==3 for p in pages)
    ids=[r['id'] for p in pages for r in p['items']];assert len(set(ids))==43
    id=ids[0];assert call('u','/history/'+id)['public_id']=='1000000000'
    for who in ['v','da','fa','ua','sa']:call(who,'/history/'+id,expect=403)
    assert call('v','/history')['total']==3
    assert call('w','/history')['total']==0
    assert call('u','/history?page=999')['page']==3
    call(None,'/history',expect=401)
    call('u','/history?page=0',expect=422)

def test_history_remains_after_all_da_reviews(env):
    _,_,call=env;row=new(call);id=row['id'];call('u',f'/requests/{id}/cancel',{})
    for who in ['da','da2']:call(who,f'/admin/records/{id}');call(who,f'/admin/records/{id}/review',{})
    assert call('da','/admin/records')['total']==0
    assert call('u','/history')['items'][0]['id']==id
    assert call('u','/history/'+id)['status']=='cancelled'


def test_management_queue_filters_preserve_assignment_dates_and_wallet(env):
    engine,client,call=env
    u=new(call,'u');v=new(call,'v');w=new(call,'w')
    with Session(engine) as db:
        db.get(PaymentRequest,u['id']).transaction_reference='FIXTURE-REFERENCE-123'
        row=db.get(PaymentRequest,v['id']);row.status='connecting';row.assigned_to='da2'
        row=db.get(PaymentRequest,w['id']);row.status='cancelled';row.created_at=datetime.now(timezone.utc)-timedelta(days=45)
        db.commit()
    items=call('da','/admin/requests?records=true&q=1000000000')['items'];assert [r['id'] for r in items]==[u['id']]
    assert [r['id'] for r in call('da','/admin/requests?records=true&q=FIXTURE-REFERENCE-123')['items']]==[u['id']]
    assert [r['id'] for r in call('da2','/admin/requests?assignment=mine')['items']]==[v['id']]
    assert {r['id'] for r in call('da','/admin/requests?records=true&days=7')['items']}=={u['id'],v['id']}
    assert call('da','/admin/requests?status=cancelled')['items']==[]
    assert [r['id'] for r in call('da','/admin/requests?records=true&status=cancelled')['items']]==[w['id']]
    call('fa','/admin/requests?records=true&q=1000000000',expect=403)
    with Session(engine) as db:assert db.get(User,'u').lidya==0 and db.get(User,'v').lidya==0
