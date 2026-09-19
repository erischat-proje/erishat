from . import blackjack, cups, crash, horse_race, roulette, vault, wheel

GAME_ENGINES = {
    "roulette": roulette,
    "cups": cups,
    "horse_race": horse_race,
    "blackjack": blackjack,
    "crash": crash,
    "vault": vault,
    "wheel": wheel,
}

ROOM_GAMES = frozenset({"roulette", "cups", "horse_race", "wheel"})
PRIVATE_GAMES = frozenset({"blackjack", "crash", "vault"})

def get_engine(game_type: str):
    try:
        return GAME_ENGINES[game_type]
    except KeyError:
        raise ValueError(f"Unknown game engine: {game_type}")

def is_room_game(game_type: str) -> bool:
    return game_type in ROOM_GAMES

def is_private_game(game_type: str) -> bool:
    return game_type in PRIVATE_GAMES
