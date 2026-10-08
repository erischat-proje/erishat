"""ErisChat ortak canlı Kasa motoru."""
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select, text
from .models import User
from .platform_models import GameRound, GameBet

GAME = "vault_live"
PRIZES = ("rare", "epic", "legendary", "mythic")
BET_SECONDS = 30
OPEN_SECONDS = 7
RESULT_SECONDS = 5
STAKES = {10, 25, 50, 75, 100, 250, 500, 1000}
MULTIPLIERS = {"common": 0, "rare": 2, "epic": 4, "legendary": 10, "mythic": 20}

def now():
    return datetime.now(timezone.utc)

def lock_round(db):
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(731905248)"))

def finish(row, db):
    if row.status != "open" or row.ends_at > now():
        return row

    roll = secrets.randbelow(1000)
    if roll < 700:
        winner = "common"
    elif roll < 900:
        winner = "rare"
    elif roll < 980:
        winner = "epic"
    elif roll < 998:
        winner = "legendary"
    else:
        winner = "mythic"
    row.result_key = winner
    row.status = "finished"

    bets = list(db.scalars(
        select(GameBet).where(GameBet.round_id == row.id)
    ))
    payouts = {}

    for bet in bets:
        if bet.choice == winner:
            amount = int(bet.amount) * MULTIPLIERS[winner]
            bet.payout = amount
            payouts[bet.user_id] = (
                payouts.get(bet.user_id, 0) + amount
            )

    for user_id, amount in sorted(payouts.items()):
        user = db.scalar(
            select(User)
            .where(User.id == user_id)
            .with_for_update()
        )
        if user:
            user.lidya += amount

    row.state_data = json.dumps({
        "winner": winner,
        "bet_count": len(bets),
        "total_payout": sum(payouts.values())
    })
    db.flush()
    return row

def get_round(db):
    lock_round(db)
    current = now()
    row = db.scalar(
        select(GameRound)
        .where(GameRound.game_type == GAME)
        .order_by(GameRound.started_at.desc())
        .with_for_update()
    )

    if row and row.status == "open" and row.ends_at <= current:
        finish(row, db)

    if row and row.status == "finished":
        if current < row.ends_at + timedelta(
            seconds=OPEN_SECONDS + RESULT_SECONDS
        ):
            return row
        row = None

    if row is None:
        row = GameRound(
            id=str(uuid4()),
            user_id=None,
            room_id=None,
            game_type=GAME,
            status="open",
            started_at=current,
            ends_at=current + timedelta(seconds=BET_SECONDS),
            result_key=None,
            state_data="{}"
        )
        db.add(row)
        db.flush()

    return row
