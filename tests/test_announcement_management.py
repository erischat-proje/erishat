"""Run with DATABASE_URL=sqlite:// python -m unittest discover -s tests -p test_announcement_management.py"""
import os
os.environ.setdefault('DATABASE_URL','sqlite://')
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine, select, BigInteger
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from fastapi import HTTPException
from backend.app.db import Base
from backend.app import admin_routes,system_data
from backend.app.models import User
from backend.app.admin_models import AdminRole, AdminAuditLog, SystemAnnouncement
from backend.app.announcement_identity import announcement_payloads

@compiles(BigInteger,'sqlite')
def sqlite_bigint(type_,compiler,**kw):return 'INTEGER'

admin_routes.register_admin_auth(lambda:None)

def endpoint(method):
    path='/v1/admin/announcements'+('/{announcement_id}' if method=='DELETE' else '')
    return next(r.endpoint for r in admin_routes.router.routes if r.path==path and method in r.methods)

class AnnouncementManagement(unittest.TestCase):
    def setUp(self):
        logger=patch("backend.app.admin_routes.record");logger.start();self.addCleanup(logger.stop)
        ledger_logger=patch.object(system_data,"record");ledger_logger.start();self.addCleanup(ledger_logger.stop)
        self.engine=create_engine('sqlite://')
        names=['users','admin_roles','admin_audit_logs','fa_action_logs','system_announcements','system_lidya_ledger']
        Base.metadata.create_all(self.engine,tables=[Base.metadata.tables[n] for n in names])
        self.db=Session(self.engine)
        self.author=User(id='author',public_id='1234567890',nickname='Yazar')
        self.actor=User(id='actor',public_id='9876543210',nickname='Yönetici')
        self.reader=User(id='reader',public_id='1111111111',nickname='Üye')
        self.db.add_all([self.author,self.actor,self.reader]);self.db.flush()
        self.db.add_all([AdminRole(user_id='author',role='DA'),AdminRole(user_id='actor',role='DA'),
                         SystemAnnouncement(id=1,admin_id='author',message='Eski iptal',active=False),
                         SystemAnnouncement(id=2,admin_id='author',message='İlk duyuru',active=True),
                         SystemAnnouncement(id=3,admin_id='actor',message='Yeni duyuru',active=True)])
        self.db.commit()

    def tearDown(self):self.db.close();self.engine.dispose()

    def test_active_pagination_and_actual_publisher_id(self):
        result=endpoint('GET')(before=None,limit=1,db=self.db,user=self.actor)
        self.assertEqual(result['items'][0]['admin_public_id'],'9876543210')
        self.assertEqual(result['next_before'],3)
        page=endpoint('GET')(before=3,limit=20,db=self.db,user=self.actor)
        self.assertEqual([r['id'] for r in page['items']],[2])
        self.assertEqual(page['items'][0]['admin_public_id'],'1234567890')
        self.assertIsNone(page['next_before'])

    def test_cancel_deletes_record_but_retains_operator_audit(self):
        result=endpoint('DELETE')(2,db=self.db,user=self.actor)
        self.assertTrue(result['deleted'])
        self.assertIsNone(self.db.get(SystemAnnouncement,2))
        self.assertEqual([r['id'] for r in endpoint('GET')(None,20,self.db,self.actor)['items']],[3])
        audit=self.db.scalar(select(AdminAuditLog).where(AdminAuditLog.action=='admin_announcement_cancelled'))
        self.assertEqual(audit.admin_id,'actor')
        self.assertEqual(audit.target_id,'2')

    def test_unauthorized_cancel_does_not_delete(self):
        with self.assertRaises(HTTPException) as error:endpoint('DELETE')(2,self.db,self.reader)
        self.assertEqual(error.exception.status_code,403)
        self.assertIsNotNone(self.db.get(SystemAnnouncement,2))

    def test_published_identity_is_authenticated_actor(self):
        result=endpoint('POST')(admin_routes.AnnouncementCreate(message='Yeni yayın'),self.db,self.actor)
        self.assertEqual(result['admin_public_id'],'9876543210')
        row=self.db.get(SystemAnnouncement,result['id'])
        self.assertEqual(row.admin_id,'actor')
        self.assertEqual(announcement_payloads(self.db,[row])[0]['admin_public_id'],'9876543210')

if __name__=='__main__':unittest.main()
