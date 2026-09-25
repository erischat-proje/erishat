def play(bet: float, choice, mode: str = "room"):
    import random
    winner = str(random.randint(1, 4))
    is_win = str(choice) == winner
    multiplier = 4.0
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"winner": winner, "choice": choice, "mode": mode}
    }
