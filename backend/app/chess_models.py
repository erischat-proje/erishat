"""Chess is free: these tables never debit wallets or award transferable currency."""
from sqlalchemy import String, Integer, Boolean, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from datetime import datetime

class ChessGate(Base):
    __tablename__ = 'chess_gate'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, default=0)

class ChessPlayer(Base):
    __tablename__ = 'chess_players'
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), primary_key=True)
    rating: Mapped[int] = mapped_column(Integer, default=1200, index=True)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    draws: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    active_match: Mapped[str | None] = mapped_column(String(36), nullable=True)
    tournament_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    queue: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class ChessMatch(Base):
    __tablename__ = 'chess_matches'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    white_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    black_id: Mapped[str | None] = mapped_column(ForeignKey('users.id'), nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default='active', index=True)
    rated: Mapped[bool] = mapped_column(Boolean, default=False)
    preset: Mapped[str] = mapped_column(String(8))
    fen: Mapped[str] = mapped_column(String(100))
    moves: Mapped[str] = mapped_column(Text, default='[]')
    white_ms: Mapped[int] = mapped_column(Integer)
    black_ms: Mapped[int] = mapped_column(Integer)
    increment_ms: Mapped[int] = mapped_column(Integer)
    tick_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    result: Mapped[str] = mapped_column(String(8), default='*')
    reason: Mapped[str | None] = mapped_column(String(32), nullable=True)
    draw_by: Mapped[str | None] = mapped_column(String(64), nullable=True)
    rating_delta: Mapped[str] = mapped_column(Text, default='{}')
    tournament_id: Mapped[str | None] = mapped_column(ForeignKey('chess_tournaments.id'), index=True, nullable=True)
    round_no: Mapped[int | None] = mapped_column(Integer, nullable=True)

class ChessCommand(Base):
    __tablename__ = 'chess_commands'
    __table_args__ = (UniqueConstraint('match_id', 'key', name='uq_chess_command'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    match_id: Mapped[str] = mapped_column(ForeignKey('chess_matches.id'), index=True)
    key: Mapped[str] = mapped_column(String(64))
    actor: Mapped[str] = mapped_column(String(64))
    uci: Mapped[str] = mapped_column(String(5))

class ChessTournament(Base):
    __tablename__ = 'chess_tournaments'
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default='registration', index=True)
    preset: Mapped[str] = mapped_column(String(8))
    rounds: Mapped[int] = mapped_column(Integer)
    capacity: Mapped[int] = mapped_column(Integer)
    round_no: Mapped[int] = mapped_column(Integer, default=0)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

class ChessEntry(Base):
    __tablename__ = 'chess_entries'
    __table_args__ = (UniqueConstraint('tournament_id','user_id',name='uq_chess_entry'),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tournament_id: Mapped[str] = mapped_column(ForeignKey('chess_tournaments.id'), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id'), index=True)
    seed: Mapped[int] = mapped_column(Integer)
    points: Mapped[int] = mapped_column(Integer, default=0)  # half-point units
    opponents: Mapped[str] = mapped_column(Text, default='[]')
    colors: Mapped[str] = mapped_column(String(8), default='')
    bye: Mapped[bool] = mapped_column(Boolean, default=False)
