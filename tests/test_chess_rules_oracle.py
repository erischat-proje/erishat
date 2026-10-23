"""Optional independent oracle; python-chess is a TEST dependency only.

pip install chess==1.11.2. It is neither vendored nor a runtime dependency.
"""
import sys,random
from pathlib import Path
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
chess=pytest.importorskip('chess')
from app.chess_vendor import Game
from app.chess_rules import san_move,insufficient,position_key
@pytest.mark.parametrize('seed',range(10))
def test_random_legal_sets_san_and_fen_match_independent_oracle(seed):
 rng=random.Random(seed);oracle=chess.Board();game=Game()
 for _ in range(80):
  moves=sorted(m.uci() for m in oracle.legal_moves)
  assert sorted(game.get_moves())==moves
  assert insufficient(game)==oracle.is_insufficient_material()
  if not moves:break
  uci=rng.choice(moves);move=chess.Move.from_uci(uci)
  san=oracle.san(move);assert san_move(game,uci)==san
  oracle.push(move)
  assert str(game)==oracle.fen(en_passant='fen')
@pytest.mark.parametrize('fen',[
 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
 '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
 '4k3/8/8/r4pPK/8/8/8/8 w - f6 0 1',
 '4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1',
 '7k/P7/8/8/8/8/8/4K3 w - - 0 1'])
def test_special_position_every_legal_san(fen):
 oracle=chess.Board(fen);game=Game(fen)
 assert set(game.get_moves())=={m.uci() for m in oracle.legal_moves}
 for m in oracle.legal_moves:assert san_move(Game(fen),m.uci())==oracle.san(m)

def test_starting_position_perft_depth_two():
 game=Game();total=0
 for move in game.get_moves():
  child=Game();child.apply_move(move);total+=len(child.get_moves())
 assert total==400
