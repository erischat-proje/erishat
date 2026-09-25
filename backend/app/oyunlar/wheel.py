def play(bet: float, choice, mode: str = "room"):
    import random
    winning_index = random.randint(0, 8)
    is_win = str(choice) == str(winning_index) or random.choice([True, False])
    multiplier = 2.0
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"winning_index": winning_index, "choice": choice, "mode": mode}
    }
