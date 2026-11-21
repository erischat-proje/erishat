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

    # Oyun V3: bahis, iade ve net kar/zarar.
    items = [
        dict(
            id=r.id,
            created_at=r.created_at.isoformat()
            if r.created_at else None,
            source=r.source,
            amount=str(r.amount),
            status=r.status,
            detail=r.detail,
        )
        for r in rows
    ]

    if kind == 'games':
        import json

        bet_ids = [
            int(item['id'][4:])
            for item in items
            if item['id'].startswith('bet:')
        ]
        play_ids = [
            int(item['id'][5:])
            for item in items
            if item['id'].startswith('play:')
        ]

        bets = {
            bet.id: bet
            for bet in db.scalars(
                select(GameBet).where(
                    GameBet.id.in_(bet_ids),
                    GameBet.user_id == uid,
                )
            ).all()
        } if bet_ids else {}

        plays = {
            play.id: play
            for play in db.scalars(
                select(GamePlay).where(
                    GamePlay.id.in_(play_ids),
                    GamePlay.user_id == uid,
                )
            ).all()
        } if play_ids else {}

        for item in items:
            stake = payout = None
            finished = False

            if item['id'].startswith('bet:'):
                bet = bets.get(int(item['id'][4:]))
                if bet:
                    stake = int(bet.amount)
                    payout = int(bet.payout or 0)
                    finished = item['status'] == 'finished'

            elif item['id'].startswith('play:'):
                play = plays.get(int(item['id'][5:]))
                if play:
                    try:
                        data = json.loads(play.result_data or '{}')
                    except (TypeError, ValueError):
                        data = {}
                    if isinstance(data, dict):
                        raw_stake = data.get('stake')
                        raw_payout = data.get('payout')
                        if (
                            isinstance(raw_stake, int)
                            and not isinstance(raw_stake, bool)
                            and raw_stake >= 0
                            and isinstance(raw_payout, int)
                            and not isinstance(raw_payout, bool)
                            and raw_payout >= 0
                        ):
                            stake = raw_stake
                            payout = raw_payout
                            finished = (
                                play.result_key != 'pending'
                            )

            net = (
                payout - stake
                if finished and stake is not None
                and payout is not None
                else None
            )

            item.update({
                'stake': str(stake) if stake is not None else None,
                'payout': str(payout) if payout is not None else None,
                'net': str(net) if net is not None else None,
                'outcome': (
                    'pending' if not finished else
                    'profit' if net > 0 else
                    'loss' if net < 0 else 'even'
                ) if net is not None or not finished else 'unknown',
            })

    return {
        'kind': kind,
        'page': page,
        'page_size': PAGE_SIZE,
        'total': count,
        'total_pages': max(1, (count + PAGE_SIZE - 1) // PAGE_SIZE),
        'has_previous': page > 1,
        'has_next': page * PAGE_SIZE < count,
        'items': items,
    }
