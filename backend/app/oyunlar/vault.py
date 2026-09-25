def play(bet: float, choice, mode: str = "room"):
    import random
    winning_vault = str(random.randint(1, 3))
    is_win = str(choice) == winning_vault or random.choice([True, False])
    multiplier = 3.0
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"winning_vault": winning_vault, "choice": choice, "mode": mode}
    }
