"""DA-only, read-only paginated per-account game and credit-source histories.

Never infer a successful purchase from a positive wallet delta. Balance changes
also include game payouts. Payment status comes from its authoritative source.
"""
from sqlalchemy import BigInteger, String, case, cast, func, literal, select, union_all

from .platform_models import GameBet, GameRound, GamePlay
from .purchase_models import LidyaOrder, LidyaOperation
from .payment_assistance_models import PaymentRequest
from .dealer_routes import DealerTransfer
from .play_billing_models import PlayPurchaseRecord
from .woocommerce_order_v6 import WebOrderV6
from .purchase_routes import PACKAGES

PAGE_SIZE = 20


def _txt(column):
    return cast(column, String)


def _packages(column, key):
    return case(*[(column == (f'lidya_{p["id"]:03d}' if key == 'sku' else p['id']),
                    literal(int(p['total']))) for p in PACKAGES], else_=0)


def _row(id_, created, source, amount, status, detail):
    return select(id_.label('id'), created.label('created_at'),
                  source.label('source'), amount.label('amount'),
                  status.label('status'), detail.label('detail'))


def history(db, uid, kind, page):
    if kind == 'games':
        bet = _row(
            literal('bet:') + _txt(GameBet.id), GameBet.created_at,
            GameRound.game_type, GameBet.amount,
            case((GameRound.status == 'finished', literal('finished')),
                 else_=literal('pending')),
            GameBet.choice + literal(' | Kazanc: ') + _txt(GameBet.payout),
        ).select_from(GameBet).join(GameRound, GameBet.round_id == GameRound.id).where(GameBet.user_id == uid)
        play = _row(
            literal('play:') + _txt(GamePlay.id), GamePlay.created_at,
            GamePlay.game_type, literal(0), literal('recorded'),
            GamePlay.result_key,
        ).where(GamePlay.user_id == uid)
        # GameBet payout is read from the bet record, not purchase credit.
        statements = [bet, play]
    elif kind == 'purchases':
        play = _row(
            literal('google:') + _txt(PlayPurchaseRecord.id), PlayPurchaseRecord.created_at,
            literal('Google Play'), _packages(PlayPurchaseRecord.product_id, 'sku'),
            PlayPurchaseRecord.purchase_status,
            case((PlayPurchaseRecord.test_purchase.is_(True), literal('test')),
                 else_=literal('real')),
        ).where(PlayPurchaseRecord.user_id == uid)
        orders = _row(
            literal('order:') + LidyaOrder.id, LidyaOrder.created_at,
            literal('Lidya siparisi: ') + LidyaOrder.method,
            LidyaOrder.total, LidyaOrder.status, literal('siparis'),
        ).where(LidyaOrder.user_id == uid)
        assistance = _row(
            literal('assisted:') + PaymentRequest.id, PaymentRequest.created_at,
            literal('Odeme temsilcisi'), PaymentRequest.total,
            case((PaymentRequest.credit_operation_id.is_not(None), literal('credited')),
                 else_=PaymentRequest.status), literal('odeme_talebi'),
        ).where(PaymentRequest.user_id == uid)
        dealers = _row(
            literal('dealer:') + DealerTransfer.id, DealerTransfer.created_at,
            literal('Bayi transferi'), DealerTransfer.amount,
            literal('credited'), literal('bayi'),
        ).where(DealerTransfer.recipient_id == uid)
        # An assisted payment's LidyaOperation is represented above only once.
        assisted_ids = select(PaymentRequest.credit_operation_id).where(
            PaymentRequest.credit_operation_id.is_not(None))
        manual = _row(
            literal('manual:') + LidyaOperation.id, LidyaOperation.created_at,
            literal('Yonetici Lidya eklemesi'), LidyaOperation.amount,
            literal('credited'), literal('manuel'),
        ).where(LidyaOperation.user_id == uid,
                LidyaOperation.operation == 'EKLEME',
                ~LidyaOperation.id.in_(assisted_ids))
        web = _row(
            literal('web:') + WebOrderV6.id, WebOrderV6.created_at,
            literal('Web / WooCommerce'), _packages(WebOrderV6.package_id, 'id'),
            WebOrderV6.state, literal('odeme_dogrulanmadi'),
        ).where(WebOrderV6.user_id == uid)
        statements = [play, orders, assistance, dealers, manual, web]
    else:
        raise ValueError('Gecersiz gecmis turu')

    combined = union_all(*statements).subquery('account_history')
    count = int(db.scalar(select(func.count()).select_from(combined)) or 0)
    rows = db.execute(select(combined).order_by(
        combined.c.created_at.desc(), combined.c.id.desc()
    ).offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)).all()
    return {
        'kind': kind,
        'page': page,
        'page_size': PAGE_SIZE,
        'total': count,
        'total_pages': max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE),
        'has_previous': page > 1,
        'has_next': page * PAGE_SIZE < count,
        'items': [dict(id=r.id, created_at=r.created_at.isoformat() if r.created_at else None,
                       source=r.source, amount=str(r.amount), status=r.status,
                       detail=r.detail) for r in rows],
    }
