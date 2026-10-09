"""Room Ludo rules. Server-owned two-dice gameplay, bombs and bot takeover."""
from __future__ import annotations
import secrets
import time

TRACK = [
    (6,1),(6,2),(6,3),(6,4),(6,5),(5,6),(4,6),(3,6),(2,6),(1,6),
    (0,6),(0,7),(0,8),(1,8),(2,8),(3,8),(4,8),(5,8),(6,9),(6,10),
    (6,11),(6,12),(6,13),(6,14),(7,14),(8,14),(8,13),(8,12),(8,11),
    (8,10),(8,9),(9,8),(10,8),(11,8),(12,8),(13,8),(14,8),(14,7),
    (14,6),(13,6),(12,6),(11,6),(10,6),(9,6),(8,5),(8,4),(8,3),
    (8,2),(8,1),(8,0),(7,0),(6,0)
]

STARTS = {1: 0, 2: 13, 3: 26, 4: 39}
SAFE = {0, 8, 13, 21, 26, 34, 39, 47}
BOMB_STARTS = [4, 17, 30, 43]
STAKES = (50, 100, 150, 200, 250, 300)
TURN_SECONDS = 30


def event(s, kind, **data):
    s["version"] += 1
    s["events"].append(dict(seq=s["version"], kind=kind, **data))
    s["events"] = s["events"][-96:]


def player(s, seat):
    return next(p for p in s["players"] if p["seat"] == seat)


def allied(s, a, b):
    # Eşli Ludo: karşılıklı koltuklar takım arkadaşıdır.
    # Takımlar: 1+3 ve 2+4.
    return a == b or (
        s["mode"] == "paired"
        and {a, b} in ({1, 3}, {2, 4})
    )


def target(pos, die):
    if pos == -1:
        return 0 if die == 6 else None
    return pos + die if pos < 56 and pos + die <= 56 else None


def square(seat, pos):
    return (STARTS[seat] + pos) % 52


def captures(s, seat, destination):
    if destination is None or destination > 50:
        return []

    sq = square(seat, destination)

    if sq in SAFE:
        return []

    return [
        dict(seat=p["seat"], token=i, pos=pos)
        for p in s["players"]
        if not allied(s, seat, p["seat"])
        for i, pos in enumerate(p["tokens"])
        if 0 <= pos <= 50 and square(p["seat"], pos) == sq
    ]


def occupied_by_other(s, seat, destination):
    if destination is None or destination > 50:
        return False

    sq = square(seat, destination)

    return any(
        p["seat"] != seat
        and 0 <= pos <= 50
        and square(p["seat"], pos) == sq
        for p in s["players"]
        for pos in p["tokens"]
    )


def legal_for_die(s, seat, die, harmless=False):
    result = []

    for i, pos in enumerate(player(s, seat)["tokens"]):
        destination = target(pos, die)

        if destination is None:
            continue

        if harmless and occupied_by_other(s, seat, destination):
            continue

        result.append(i)

    return result


def legal(s, seat, die=None, harmless=False):
    if s.get("roll_ready"):
        return []
    dice = [d["value"] if isinstance(d, dict) else d for d in (s.get("pending_dice") or [])]

    if die is not None:
        dice = [die]

    if not dice:
        return []

    result = []

    for token in range(4):
        if any(
            token in legal_for_die(s, seat, d, harmless=harmless)
            for d in dice
        ):
            result.append(token)

    return result


def begin(s, now=None):
    seats = sorted(p["seat"] for p in s["players"])

    if len(seats) not in (2, 4):
        raise ValueError("Tekli oyun 2 veya 4 oyuncuyla başlar.")

    if 1 not in seats:
        raise ValueError("Ludo oyununu başlatmak için 1. koltuk dolu olmalı.")

    if s["mode"] == "paired" and seats != [1, 2, 3, 4]:
        raise ValueError("Eşli oyun dört oyuncuyla başlar.")

    s.update(
        status="playing",
        turn=1,
        dice=[],
        pending_dice=[],
        die=None,
        double_sixes=0,
        roll_ready=False,
        turn_has_six=False,
        deadline=(now or time.time()) + TURN_SECONDS,
        winners=[],
        bombs=[
            dict(id=i, square=BOMB_STARTS[i], used=False)
            for i in range(4)
        ],
    )

    event(s, "start")


def next_turn(s, now=None):
    seats = sorted(p["seat"] for p in s["players"])

    if not seats:
        return

    seat = s["turn"]

    for offset in range(1, len(seats) + 1):
        candidate = seats[
            (seats.index(seat) + offset) % len(seats)
        ]

        if not all(
            pos == 56
            for pos in player(s, candidate)["tokens"]
        ):
            s["turn"] = candidate
            break

    s.update(
        dice=[],
        pending_dice=[],
        die=None,
        double_sixes=0,
        roll_ready=False,
        turn_has_six=False,
        deadline=(now or time.time()) + TURN_SECONDS,
    )

    # Her yeni turda 4 bomba yeniden kullanılabilir.
    for bomb in s.get("bombs", []):
        bomb["used"] = False


def roll(s, bot=False, now=None):
    if s["status"] != "playing":
        raise ValueError("Oyun devam etmiyor.")
    if s.get("pending_dice") and not s.get("roll_ready"):
        raise ValueError("Önce biriken zarların hamlelerini oynayın.")
    dice = [secrets.randbelow(6) + 1, secrets.randbelow(6) + 1]
    double_six = dice == [6, 6]
    s["double_sixes"] = s.get("double_sixes", 0) + 1 if double_six else 0
    s["dice"] = list(s.get("dice") or []) + dice
    first_index = len(s["dice"]) - 2
    s["pending_dice"] = list(s.get("pending_dice") or []) + [
        {"index": first_index + i, "value": value} for i, value in enumerate(dice)
    ]
    s["roll_ready"] = double_six
    s["turn_has_six"] = False
    event(s, "roll", seat=s["turn"], dice=dice, double_six=double_six,
          double_sixes=s["double_sixes"], accumulated=s["dice"][:])
    if double_six and s["double_sixes"] >= 3:
        event(s, "pass", seat=s["turn"], reason="Üçüncü ardışık 6+6: biriken zarlar iptal edildi; sıra değişti.")
        next_turn(s, now)
        return
    if not double_six:
        if not legal(s, s["turn"], harmless=bot):
            next_turn(s, now)
            return
    s["deadline"] = (now if now is not None else time.time()) + TURN_SECONDS


def trigger_bomb(s, seat, destination):
    if destination is None or destination < 0 or destination > 50:
        return []

    landing_square = square(seat, destination)
    triggered = []

    for bomb in s.get("bombs", []):
        if bomb.get("used"):
            continue

        if bomb.get("square") != landing_square:
            continue

        bomb["used"] = True

        path = [
            (landing_square + step) % 52
            for step in range(1, 8)
        ]

        hits = []

        for p in s["players"]:
            for token, pos in enumerate(p["tokens"]):
                if (
                    0 <= pos <= 50
                    and square(p["seat"], pos) in path
                    and square(p["seat"], pos) not in SAFE
                ):
                    hits.append(
                        dict(
                            seat=p["seat"],
                            token=token,
                            pos=pos,
                        )
                    )
                    p["tokens"][token] = -1

        bomb["square"] = path[-1]

        event(
            s,
            "bomb",
            bomb=bomb["id"],
            trigger_seat=seat,
            start=landing_square,
            path=path,
            end=bomb["square"],
            hits=hits,
        )

        triggered.extend(hits)

    return triggered


def move(s, token, die=None, bot=False, now=None):
    if s.get("status") != "playing":
        raise ValueError("Oyun devam etmiyor.")
    if s.get("roll_ready"):
        raise ValueError("6+6 geldi; piyon seçmeden önce yeniden zar atın.")
    if isinstance(token, bool) or not isinstance(token, int) or not 0 <= token < 4:
        raise ValueError("Geçersiz piyon.")
    seat = s["turn"]
    p = player(s, seat)

    pending = list(s.get("pending_dice") or [])

    if not pending:
        raise ValueError("Önce zar atın.")

    # Compatibility: old clients may omit die.
    if die is None:
        die = pending[0]["value"]

    selected = next(
        (d for d in pending if d["value"] == die),
        None,
    )

    if selected is None:
        raise ValueError("Bu zar artık kullanılamaz.")

    if token not in legal_for_die(s, seat, die, harmless=bot):
        raise ValueError("Bu piyon bu zarla hareket edemez.")

    before = p["tokens"][token]
    after = target(before, die)

    taken = captures(s, seat, after)

    for hit in taken:
        player(s, hit["seat"])["tokens"][hit["token"]] = -1

    p["tokens"][token] = after

    s["pending_dice"].remove(selected)

    bomb_hits = trigger_bomb(s, seat, after)

    event(
        s,
        "move",
        seat=seat,
        token=token,
        die=die,
        before=before,
        after=after,
        captured=taken,
        bomb_hits=bomb_hits,
    )

    winners = (
        [
            q["seat"]
            for q in s["players"]
            if allied(s, seat, q["seat"])
        ]
        if s["mode"] == "paired"
        else [seat]
    )

    if all(
        all(pos == 56 for pos in player(s, n)["tokens"])
        for n in winners
    ):
        s.update(
            status="finished",
            winners=winners,
            dice=[],
            pending_dice=[],
            die=None,
            deadline=0,
        )

        # Bombs return to their original positions for the next game.
        for i, bomb in enumerate(s.get("bombs", [])):
            bomb.update(
                square=BOMB_STARTS[i],
                used=False,
            )

        event(s, "win", winners=winners)
        return

    # Retain temporarily unplayable dice: a later six may release a pawn for them.
    if s["pending_dice"] and legal(s, seat, harmless=bot):
        s["die"] = s["pending_dice"][0]["value"]
        s["deadline"] = (now or time.time()) + TURN_SECONDS
        return

    # Every accumulated die was consumed or became unusable.
    next_turn(s, now)


def bot_step(s, now=None):
    if not s.get("pending_dice") or s.get("roll_ready"):
        roll(s, bot=True, now=now)
        return

    pending = list(s["pending_dice"])

    candidates = []

    for die_info in pending:
        die = die_info["value"]
        choices = legal_for_die(
            s,
            s["turn"],
            die,
            harmless=True,
        )

        for token in choices:
            destination = target(
                player(s, s["turn"])["tokens"][token],
                die,
            )
            candidates.append(
                (destination or -1, die, token)
            )

    if candidates:
        _, die, token = max(candidates)
        move(
            s,
            token,
            die=die,
            bot=True,
            now=now,
        )
        return

    # No accumulated die can be played by the bot.
    next_turn(s, now)
