from .models import Message
from .repositories import MessageRepository


class MessageService:
    def __init__(self, repo: MessageRepository):
        self.repo = repo

    def create(self, conversation_id: str, sender_id: str, text: str) -> Message:
        message = Message(conversation_id=conversation_id, sender_id=sender_id, text=text.strip())
        return self.repo.create(message)

    def list(self, conversation_id: str, limit: int = 100, offset: int = 0) -> list[Message]:
        return self.repo.list(conversation_id, limit=limit, offset=offset)
