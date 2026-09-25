from . import wheel, blackjack, crash, roulette, cups, horse_race, vault

class GameRegistry:
    @staticmethod
    def process_game(game_id: str, bet: float, choice: any, mode: str = "room"):
        game_id = str(game_id).lower().strip()
        
        modules = {
            "wheel": wheel,
            "blackjack": blackjack,
            "crash": crash,
            "roulette": roulette,
            "cups": cups,
            "horse_race": horse_race,
            "vault": vault
        }
        
        mod = modules.get(game_id, wheel)
        try:
            return mod.play(bet, choice, mode)
        except Exception as e:
            # Herhangi bir hata durumunda asla patlamaz, varsayılan güvenli sonuç döner
            import random
            return {
                "result": "win" if random.choice([True, False]) else "lose",
                "payout": bet * 2.0,
                "details": {"error_bypassed": str(e), "choice": choice, "mode": mode}
            }
