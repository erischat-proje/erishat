# Evrensel Oyun Registry ve Esnek Mod Motoru
class GameRegistry:
    @staticmethod
    def process_game(game_id: str, bet: float, choice: any, mode: str = "room"):
        import random
        game_id = str(game_id).lower().strip()
        is_win = random.choice([True, False])
        multiplier = 2.0
        payout = (bet * multiplier) if is_win else 0.0
        return {
            "result": "win" if is_win else "lose",
            "payout": payout,
            "details": {
                "game": game_id,
                "choice": choice,
                "mode": mode,
                "winning_index": random.randint(0, 8),
                "winning_cup": str(random.randint(1, 4)),
                "winner": str(random.randint(1, 4)),
                "multiplier": multiplier
            }
        }

def is_room_game(game_type: str) -> bool:
    return True  # Artık tüm oyunlar hem oda hem kişisel modda çalışabilir

def is_private_game(game_type: str) -> bool:
    return True  # Hiçbir kısıtlama yok
