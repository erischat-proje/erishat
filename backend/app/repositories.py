from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from .models import Conversation, ConversationMember, Message, User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, user_id: str) -> User | None:
        return self.db.get(User, user_id)

    def create(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user


class ConversationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, conversation_id: str) -> Conversation | None:
        return self.db.get(Conversation, conversation_id)

    def is_member(self, conversation_id: str, user_id: str) -> bool:
        stmt = select(ConversationMember.id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
        return self.db.scalar(stmt) is not None

    def members(self, conversation_id: str) -> list[str]:
        stmt = select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id
        )
        return list(self.db.scalars(stmt))

    def find_direct(self, user_ids: list[str]) -> Conversation | None:
        """Find an existing 1-to-1 conversation containing exactly these users."""
        if len(user_ids) != 2 or len(set(user_ids)) != 2:
            return None

        stmt = (
            select(Conversation.id)
            .join(
                ConversationMember,
                ConversationMember.conversation_id == Conversation.id,
            )
            .where(
                Conversation.type == "dm",
                ConversationMember.user_id.in_(user_ids),
            )
            .group_by(Conversation.id)
            .having(
                select(ConversationMember.user_id)
                .where(ConversationMember.conversation_id == Conversation.id)
                .where(ConversationMember.user_id.in_(user_ids))
                .correlate(Conversation)
                .scalar_subquery()
                .is_not(None)
            )
        )

        for conversation_id in self.db.scalars(stmt):
            if set(self.members(conversation_id)) == set(user_ids):
                return self.get(conversation_id)
        return None

    def list_for_user(self, user_id: str) -> list[Conversation]:
        stmt = (
            select(Conversation)
            .join(
                ConversationMember,
                ConversationMember.conversation_id == Conversation.id,
            )
            .where(ConversationMember.user_id == user_id)
            .order_by(Conversation.created_at.desc())
        )
        return list(self.db.scalars(stmt).unique())

    def create_direct(self, conversation_id: str, user_ids: list[str]) -> Conversation:
        conversation = Conversation(id=conversation_id)
        self.db.add(conversation)
        for user_id in user_ids:
            self.db.add(
                ConversationMember(
                    conversation_id=conversation_id,
                    user_id=user_id,
                )
            )
        self.db.commit()
        self.db.refresh(conversation)
        return conversation


class MessageRepository:
    def __init__(self, db: Session):
        self.db = db

    def list(self, conversation_id: str) -> list[Message]:
        stmt = (
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
        return list(self.db.scalars(stmt))

    def create(self, message: Message) -> Message:
        self.db.add(message)
        self.db.commit()
        self.db.refresh(message)
        return message
