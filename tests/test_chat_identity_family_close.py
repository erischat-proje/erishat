"""Run: DATABASE_URL=sqlite:// python -m unittest discover -s tests -p test_chat_identity_family_close.py"""
import os
os.environ.setdefault('DATABASE_URL', 'sqlite://')
import unittest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from fastapi import HTTPException
from backend.app.db import Base
from backend.app import family_routes, group_routes, referral_models
from backend.app.models import User, Conversation, ConversationMember
from backend.app.platform_models import Family, FamilyMember, FamilyVisual, FamilyDonation, FamilyInvitation, FamilyJoinRequest
from backend.app.group_models import MessageGroup
from backend.app.performance_queries import conversation_page
from backend.app.schemas import ConversationOut


class ChatIdentityFamilyClose(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://')
        names = ['users','user_cosmetics','auth_identities','conversations','conversation_members','messages',
                 'families','family_members','family_invitations','family_join_requests','family_donations',
                 'family_visuals','admin_roles','notifications','message_groups','conversation_folders','conversation_read_states','message_hidden','conversation_inbox_preferences','private_message_requests']
        Base.metadata.create_all(self.engine, tables=[Base.metadata.tables[n] for n in names])
        self.db = Session(self.engine)
        self.owner = User(id='owner', public_id='1111111111', nickname='Kurucu')
        self.member = User(id='member', public_id='2222222222', nickname='Üye')
        self.db.add_all([self.owner,self.member,Conversation(id='fam-chat',type='family'),Conversation(id='grp_test',type='group')]);self.db.flush()
        self.db.add_all([Family(id='fam',owner_id='owner',name='Aile',balance=100,chat_conversation_id='fam-chat'),
                         MessageGroup(conversation_id='grp_test',owner_id='owner',name='Grup',description='',request_key='request-test-123456',image=b'photo',image_mime='image/png')]);self.db.flush()
        self.db.add_all([FamilyVisual(family_id='fam',mime_type='image/png',image_bytes=b'photo'),
                         FamilyDonation(family_id='fam',user_id='owner',amount=100),
                         FamilyMember(family_id='fam',user_id='owner',role='owner'),FamilyMember(family_id='fam',user_id='member',role='member'),
                         ConversationMember(conversation_id='fam-chat',user_id='owner'),ConversationMember(conversation_id='fam-chat',user_id='member'),
                         ConversationMember(conversation_id='grp_test',user_id='owner')]);self.db.commit()
        family_routes.register_family_auth(lambda: None)
        self.close = next(r.endpoint for r in family_routes.router.routes if r.path=='/v1/families/{family_id}' and 'DELETE' in r.methods)

    def tearDown(self):
        self.db.close();self.engine.dispose()

    def test_inbox_preserves_authenticated_image_urls_through_schema(self):
        rows=conversation_page(self.db,'owner','inbox',100,0)
        by_id={r['id']:ConversationOut(**r) for r in rows}
        self.assertEqual(by_id['fam-chat'].avatar_url,'/families/fam/avatar')
        self.assertEqual(by_id['grp_test'].avatar_url,'/message-groups/grp_test/image')
        self.assertEqual(by_id['grp_test'].name,'Grup')

    def test_only_founder_can_close_and_members_cannot_access_afterwards(self):
        with self.assertRaises(HTTPException) as denied:self.close('fam',self.db,self.member)
        self.assertEqual(denied.exception.status_code,403)
        self.assertIsNotNone(self.db.scalar(select(FamilyMember)))
        self.assertTrue(self.close('fam',self.db,self.owner)['closed'])
        self.assertTrue(self.db.get(Family,'fam').closed)
        self.assertIsNone(self.db.scalar(select(FamilyMember)))
        self.assertIsNone(self.db.scalar(select(ConversationMember).where(ConversationMember.conversation_id=='fam-chat')))
        self.assertIsNotNone(self.db.scalar(select(FamilyDonation)))
        self.assertFalse(any(r['id']=='fam-chat' for r in conversation_page(self.db,'owner','inbox',100,0)))
        with self.assertRaises(HTTPException):family_routes.get_family(self.db,'fam')
        with self.assertRaises(HTTPException):self.close('fam',self.db,self.owner)

if __name__=='__main__':unittest.main()
