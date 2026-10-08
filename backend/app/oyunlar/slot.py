import secrets

SYMBOLS = ("cherry", "lemon", "bell", "star", "diamond", "seven", "crown")
WEIGHTS = (26, 23, 19, 14, 9, 6, 3)

def play(choice, profile, data):
    reels = [
        secrets.SystemRandom().choices(SYMBOLS, weights=WEIGHTS, k=1)[0]
        for _ in range(3)
    ]
    winner = reels[0] if len(set(reels)) == 1 else None
    result = winner or "miss"
    data.update({
        "reels": reels,
        "winning_symbol": winner,
        "choice_hit": bool(winner),
        "animation": {
            "type": "slot_reels",
            "duration_ms": 2800,
            "reveal_ms": 900
        },
        "result": result
    })
    return result, data
