"""ErisChat application package bootstrap hooks."""

from sqlalchemy import event
from sqlalchemy.orm import Session

from .models import Conversation, ConversationMember
from .platform_models import Family


@event.listens_for(Session, "before_flush")
def _complete_family_creation(session: Session, flush_context, instances) -> None:
    """Backfill required family ownership/chat records for legacy creation routes.

    The existing platform route creates a Family first and flushes it before
    adding its FamilyMember. Family requires owner_id and chat_conversation_id,
    so populate both before SQLAlchemy emits the INSERT.
    """
    for family in tuple(session.new):
        if not isinstance(family, Family):
            continue
        if family.owner_id and family.chat_conversation_id:
            continue
        members = [
            obj for obj in session.new
            if isinstance(obj, object)
            and isinstance(obj, ConversationMember)
            and obj.user_id
        ]
        owner_id = family.owner_id
        if not owner_id:
            for member in members:
                owner_id = member.user_id
                if owner_id:
                    break
        if not owner_id:
            continue
        family.owner_id = owner_id
        family.level = family.level or 1
        conversation_id = family.chat_conversation_id or f"family_chat_{family.id}"
        family.chat_conversation_id = conversation_id
        conversation = session.get(Conversation, conversation_id)
        if conversation is None:
            session.add(Conversation(id=conversation_id, type="family"))
        if not any(
            isinstance(obj, ConversationMember)
            and obj.conversation_id == conversation_id
            and obj.user_id == owner_id
            for obj in session.new
        ):
            session.add(ConversationMember(conversation_id=conversation_id, user_id=owner_id))
