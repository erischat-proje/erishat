def play(bet: float, choice, mode: str = "room"):
    import random
    multiplier = round(random.uniform(1.2, 5.0), 2)
    target = float(choice) if choice else 2.0
    is_win = multiplier >= target
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"multiplier": multiplier, "target": target, "mode": mode}
    }
