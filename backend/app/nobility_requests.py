"""Strict LidyaChat nobility mutation requests."""

from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
)


class NobilityActionRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
        frozen=True,
    )

    rank: int = Field(ge=1, le=4)
    request_id: str = Field(
        min_length=36,
        max_length=36,
    )

    confirmed_revision: str | None = Field(
        default=None,
        max_length=64,
    )

    confirmed_cost: str | None = Field(
        default=None,
        max_length=19,
    )

    @field_validator("request_id")
    @classmethod
    def validate_request_id(cls, value):
        try:
            parsed = UUID(value)
        except (ValueError, TypeError):
            raise ValueError("Invalid request ID")

        if parsed.version != 4 or str(parsed) != value:
            raise ValueError("Invalid request ID")

        return value


class NobilityCancellationRequest(NobilityActionRequest):
    """Explicit cancellation of an unresolved action."""

    action: str = Field(
        pattern=r"^(activate|upgrade|renew)$",
    )

    user_id: str = Field(
        min_length=1,
        max_length=64,
    )

    confirmed_revision: str = Field(
        min_length=64,
        max_length=64,
        pattern=r"^[0-9a-f]{64}$",
    )

    confirmed_cost: str = Field(
        min_length=1,
        max_length=19,
        pattern=r"^[1-9][0-9]{0,18}$",
    )

    @field_validator("confirmed_cost")
    @classmethod
    def validate_cancellation_cost(cls, value):
        if int(value) > 9223372036854775807:
            raise ValueError("Points overflow")

        return value

    @field_validator("user_id")
    @classmethod
    def validate_cancellation_user(cls, value):
        if value.strip() != value:
            raise ValueError("Invalid account identity")

        return value

    @field_validator("action")
    @classmethod
    def validate_cancellation_action(cls, value):
        if value not in ("activate", "upgrade", "renew"):
            raise ValueError("Invalid action")

        return value
