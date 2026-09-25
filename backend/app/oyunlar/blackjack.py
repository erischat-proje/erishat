def play(bet: float, choice, mode: str = "room"):
    import random
    is_win = random.choice([True, False])
    multiplier = 2.0
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {
            "player_hand": ["A", "10"],
            "dealer_hand": ["10", "8"],
            "choice": choice,
            "mode": mode
        }
    }
