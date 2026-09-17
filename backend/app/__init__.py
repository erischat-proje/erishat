"""ErisChat application package bootstrap hooks."""

from fastapi import Depends
from fastapi.routing import APIRoute
from sqlalchemy.orm import Session

from .db import get_db
from .models import Conversation, ConversationMember
from .platform_models import Family, FamilyMember


def _patch_family_create_route() -> None:
    """Replace the legacy family creator with the schema-complete version."""
    from . import platform_routes as platform

    original = platform.register_platform_auth

    def register_with_fixed_family_create(current_user_dependency):
        original(current_user_dependency)

        for route in list(platform.router.routes):
            if isinstance(route, APIRoute) and route.path == "/v1/families" and "POST" in route.methods:
                platform.router.routes.remove(route)

        def create_family_fixed(
            payload: platform.FamilyCreate,
            db: Session = Depends(get_db),
            user=Depends(current_user_dependency),
        ):
            family_id = "family_" + platform.uuid4().hex[:12]
            conversation_id = "family_chat_" + family_id
            conversation = Conversation(id=conversation_id, type="family")
            row = Family(
                id=family_id,
                owner_id=user.id,
                name=payload.name.strip(),
                level=1,
                balance=0,
                chat_conversation_id=conversation_id,
            )
            db.add(conversation)
            db.add(row)
            db.flush()
            db.add(ConversationMember(conversation_id=conversation_id, user_id=user.id))
            db.add(FamilyMember(family_id=family_id, user_id=user.id, role="member"))
            db.commit()
            return {"id": row.id, "name": row.name, "level": 1}

        platform.router.add_api_route(
            "/v1/families",
            create_family_fixed,
            methods=["POST"],
            tags=["platform"],
        )

    platform.register_platform_auth = register_with_fixed_family_create


_patch_family_create_route()
