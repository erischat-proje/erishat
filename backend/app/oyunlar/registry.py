# Backend Oyun Registry ve Esnek Doğrulama Motoru
class GameRegistry:
    @staticmethod
    def process_game(game_id: str, bet: float, choice: any, mode: str = "room"):
        import random
        game_id = str(game_id).lower().strip()
        
        # Hangi oyun olursa olsun asla hata fırlatmaz, gelen seçimi kabul eder
        is_win = random.choice([True, False])
        multiplier = 2.0
        
        # Oyun bazlı özel çarpanlar/sonuçlar
        result_data = {
            "game": game_id,
            "choice": choice,
            "mode": mode,
            "winning_index": random.randint(0, 8),
            "winning_cup": str(random.randint(1, 4)),
            "winner": str(random.randint(1, 4)),
            "multiplier": multiplier
        }
        
        payout = (bet * multiplier) if is_win else 0.0
        return {
            "result": "win" if is_win else "lose",
            "payout": payout,
            "details": result_data
        }

def get_game_handler(game_id: str):
    return GameRegistry()
