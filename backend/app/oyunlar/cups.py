def play(bet: float, choice, mode: str = "room"):
    import random
    winning_cup = str(random.randint(1, 4))
    is_win = str(choice) == winning_cup
    multiplier = 3.5
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"winning_cup": winning_cup, "choice": choice, "mode": mode}
    }
