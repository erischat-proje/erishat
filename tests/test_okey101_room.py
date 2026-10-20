"""Server rules exercised by the room UI: physical IDs, privacy and complete hands."""
import copy
import importlib.util
from pathlib import Path
import time
import unittest

spec = importlib.util.spec_from_file_location('okey101_engine', Path(__file__).resolve().parents[1] / 'backend/app/okey101_engine.py')
rules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rules)


def game(mode='solo', hands=3):
    state = dict(round_id='qa', version=0, events=[], mode=mode, penalties=True,
                 progressive=False, hand_count=hands,
                 players=[dict(seat=n, user_id=f'u{n}', name=f'Oyuncu {n}', stake=50) for n in range(1, 5)])
    rules.begin(state)
    return state


class Okey101RoomTests(unittest.TestCase):
    def test_all_physical_faces_and_false_jokers(self):
        state = game()
        for tile in range(104):
            self.assertEqual(rules.face(state, tile), (tile // 26, tile % 13 + 1))
        self.assertEqual(rules.face(state, 104), tuple(state['joker']))
        self.assertEqual(rules.face(state, 105), tuple(state['joker']))
        self.assertFalse(rules.wild(state, 104))
        self.assertFalse(rules.wild(state, 105))
        self.assertEqual(sum(rules.wild(state, t) for t in range(106)), 2)

    def test_deals_conserve_every_tile_and_rotate_starter(self):
        for _ in range(40):
            state = game(hands=7)
            for hand in range(1, 8):
                state['hand_number'] = hand
                rules.deal(state)
                starter = (hand - 1) % 4 + 1
                self.assertEqual(state['turn'], starter)
                self.assertEqual([len(p['hand']) for p in state['players']], [22 if n == starter else 21 for n in range(1, 5)])
                self.assertEqual(len(state['stock']), 20)
                rules.invariant(state)

    def test_private_hands_and_stock_never_leak_to_other_players(self):
        state = game()
        for viewer in ['u1', 'u2', 'spectator']:
            public = rules.public(state, viewer)
            self.assertNotIn('stock', public)
            self.assertNotIn('taken', public)
            self.assertEqual(public['stock_count'], 20)
            for p in public['players']:
                self.assertEqual('hand' in p, p['user_id'] == viewer)
        self.assertIn('hand', state['players'][0])

    def test_draw_discard_and_wrong_turn(self):
        state = game()
        first = state['players'][0]['hand'][0]
        rules.discard(state, 1, first)
        self.assertEqual((state['turn'], state['phase']), (2, 'draw'))
        before = copy.deepcopy(state)
        with self.assertRaises(ValueError):
            rules.draw(state, 3, 'stock')
        self.assertEqual(state, before)
        rules.draw(state, 2, 'stock')
        self.assertEqual(len(state['players'][1]['hand']), 22)
        rules.discard(state, 2, state['players'][1]['hand'][0])
        rules.invariant(state)
        self.assertEqual((state['turn'], state['phase']), (3, 'draw'))

    def test_meld_validation_rejects_duplicates_and_wrap(self):
        state = game()
        state['joker'] = [3, 8]
        self.assertEqual(rules.meld(state, [0, 1, 2], 'run', [[0, 1], [0, 2], [0, 3]])['kind'], 'run')
        self.assertEqual(rules.meld(state, [0, 26, 52], 'set', [[0, 1], [1, 1], [2, 1]])['kind'], 'set')
        self.assertEqual(rules.meld(state, [0, 13], 'pair', [[0, 1], [0, 1]])['kind'], 'pair')
        for tiles, faces in [([0, 0, 2], [[0, 1], [0, 2], [0, 3]]), ([11, 12, 0], [[0, 12], [0, 13], [0, 1]])]:
            with self.assertRaises(ValueError):
                rules.meld(state, tiles, 'run', faces)
        with self.assertRaises(ValueError):
            rules.meld(state, [104, 1, 2], 'run', [[0, 1], [0, 2], [0, 3]])

    def test_complete_solo_and_paired_matches_preserve_tiles(self):
        for mode in ['solo', 'paired']:
            for _ in range(8):
                state = game(mode)
                moves = 0
                while state['status'] != 'finished':
                    rules.bot_step(state, time.time() + 60)
                    rules.invariant(state)
                    moves += 1
                    self.assertLess(moves, 500)
                self.assertEqual(len(state['history']), 3)
                self.assertTrue(state['winners'])
                self.assertTrue(all('hand' in p for p in rules.public(state, 'spectator')['players']))


if __name__ == '__main__':
    unittest.main()
