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
    """Return the isolated engine registered for a game type."""
    try:
        return GAME_ENGINES[game_type]
    except KeyError as exc:
        raise ValueError(f"Unknown game engine: {game_type}") from exc


def is_room_game(game_type: str) -> bool:
    return game_type in ROOM_GAMES


def is_private_game(game_type: str) -> bool:
    return game_type in PRIVATE_GAMES


def validate_registry() -> None:
    """Fail fast if a declared game is missing from the central registry."""
    declared = ROOM_GAMES | PRIVATE_GAMES
    registered = frozenset(GAME_ENGINES)
    if declared != registered:
        raise RuntimeError(f"Game registry mismatch: declared={sorted(declared)} registered={sorted(registered)}")
    for name, engine in GAME_ENGINES.items():
        if not callable(getattr(engine, "play", None)):
            raise RuntimeError(f"Game engine '{name}' must expose play(choice, profile, data)")


validate_registry()
