def play(bet: float, choice, mode: str = "room"):
    import random
    outcomes = ["red", "black", "green"]
    winning_outcome = random.choice(outcomes)
    is_win = str(choice).lower() == str(winning_outcome).lower() or random.choice([True, False])
    multiplier = 14.0 if winning_outcome == "green" else 2.0
    payout = (bet * multiplier) if is_win else 0.0
    return {
        "result": "win" if is_win else "lose",
        "payout": payout,
        "details": {"winning_outcome": winning_outcome, "choice": choice, "mode": mode}
    }
