import importlib.util
from pathlib import Path
import random
import unittest

spec=importlib.util.spec_from_file_location('uno_engine',Path(__file__).parents[1]/'app/uno_engine.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)

def cid(color,value,index=0):
    return [c['id'] for c in u.CARDS if c['color']==color and c['value']==str(value)][index]

def fixture(n=3,mode='solo',victory='quick'):
    s=u.new_game('u1',mode,victory,0)
    s['players']=[dict(seat=i,user_id='u'+str(i),name='P'+str(i),team=1 if i in (1,3) else 2,hand=[],bot=False,uno=False) for i in range(1,n+1)]
    s.update(status='playing',stock=list(range(108)),discard=[cid('red',5)],active_color='red',turn=1,direction=1,phase='play',drawn=None,pending_draw4=None,uno_vulnerable=None,deadline=20)
    return s

def set_hands(s,hands):
    used=set(s['discard'])
    for p,hand in zip(s['players'],hands):p['hand']=list(hand);used.update(hand)
    s['stock']=[c for c in range(108) if c not in used]

class UnoRules(unittest.TestCase):
    def test_deck(self):
        self.assertEqual(len(u.CARDS),108)
        self.assertEqual(len({c['id'] for c in u.CARDS}),108)
        for color in u.COLORS:
            self.assertEqual(len([c for c in u.CARDS if c['color']==color]),25)
            self.assertEqual(len([c for c in u.CARDS if c['color']==color and c['value']=='0']),1)
    def test_deal_all_counts(self):
        for n in (2,3,4):
            s=fixture(n);s['status']='lobby';u.start_hand(s,0)
            self.assertEqual(sum(len(p['hand']) for p in s['players'])+len(s['stock'])+len(s['discard']),108)
            self.assertTrue(all(len(p['hand'])>=7 for p in s['players']))
    def test_two_player_reverse_and_skip(self):
        for v in ('reverse','skip'):
            s=fixture(2);c=cid('red',v);set_hands(s,[[c,cid('red',1)],[cid('blue',1)]])
            u.play(s,1,c,None,True,1);self.assertEqual(s['turn'],1)
    def test_three_player_reverse(self):
        s=fixture();c=cid('red','reverse');set_hands(s,[[c,cid('red',1)],[cid('blue',1)],[cid('green',1)]])
        u.play(s,1,c,None,False,1);self.assertEqual(s['turn'],3);self.assertEqual(s['direction'],-1)
    def test_draw2_skips_without_stacking(self):
        s=fixture();c=cid('red','draw2');set_hands(s,[[c,cid('red',1)],[cid('blue','draw2')],[cid('green',1)]])
        u.play(s,1,c,None,False,1);self.assertEqual(s['turn'],3);self.assertEqual(len(s['players'][1]['hand']),3)
    def test_draw_only_one_and_only_drawn_playable(self):
        s=fixture();set_hands(s,[[cid('red',1)],[cid('blue',1)],[cid('green',1)]]);d=cid('red',2);s['stock'].remove(d);s['stock'].append(d)
        u.draw(s,1,1);self.assertEqual(s['phase'],'drawn');self.assertEqual(u.legal(s,1),[d]);self.assertEqual(len(s['players'][0]['hand']),2)
        with self.assertRaises(u.RuleError):u.play(s,1,cid('red',1),None,False,2)
        u.pass_turn(s,1,2);self.assertEqual(s['turn'],2)
    def test_draw_unplayable_passes(self):
        s=fixture();set_hands(s,[[cid('red',1)],[cid('blue',1)],[cid('green',1)]]);d=cid('blue',2);s['stock'].remove(d);s['stock'].append(d)
        u.draw(s,1,1);self.assertEqual(s['turn'],2)
    def draw4_fixture(self,illegal=False):
        s=fixture();c=cid(None,'draw4');set_hands(s,[[c,cid('red' if illegal else 'blue',1)],[cid('green',1)],[cid('yellow',1)]]);u.play(s,1,c,'green',False,1);return s
    def test_draw4_valid_challenge(self):
        s=self.draw4_fixture();u.answer_draw4(s,2,True,2);self.assertEqual(len(s['players'][1]['hand']),7);self.assertEqual(s['turn'],3)
    def test_draw4_illegal_challenge(self):
        s=self.draw4_fixture(True);u.answer_draw4(s,2,True,2);self.assertEqual(len(s['players'][0]['hand']),5);self.assertEqual(len(s['players'][1]['hand']),1);self.assertEqual(s['turn'],2)
    def test_draw4_accept(self):
        s=self.draw4_fixture(True);u.answer_draw4(s,2,False,2);self.assertEqual(len(s['players'][1]['hand']),5);self.assertEqual(s['turn'],3)
    def test_only_target_challenges(self):
        s=self.draw4_fixture()
        with self.assertRaises(u.RuleError):u.answer_draw4(s,3,True,2)
    def test_privacy(self):
        s=self.draw4_fixture(True);v=u.public_state(s,'watcher')
        self.assertNotIn('stock',v);self.assertNotIn('pending_draw4',v);self.assertTrue(all('hand' not in p for p in v['players']))
        u.answer_draw4(s,2,True,2)
        self.assertNotIn('challenge_reveal',u.public_state(s,'u3'))
        self.assertIn('challenge_reveal',u.public_state(s,'u2'))
        self.assertEqual([p['seat'] for p in u.public_state(s,'u1')['players'] if 'hand' in p],[1])
    def test_uno_catch(self):
        s=fixture();c=cid('red',1);set_hands(s,[[c,cid('red',2)],[cid('blue',1)],[cid('green',1)]])
        u.play(s,1,c,None,False,1);self.assertEqual(s['uno_vulnerable'],1);u.catch(s,3);self.assertEqual(len(s['players'][0]['hand']),3)
        with self.assertRaises(u.RuleError):u.catch(s,2)
    def test_uno_self_rescue(self):
        s=self.draw4_fixture();u.call(s,1)
        with self.assertRaises(u.RuleError):u.catch(s,2)
    def test_uno_window_closes_on_next_action(self):
        s=fixture();c=cid('red',1);set_hands(s,[[c,cid('red',2)],[cid('blue',1)],[cid('green',1)]])
        u.play(s,1,c,None,False,1);u.draw(s,2,2)
        with self.assertRaises(u.RuleError):u.catch(s,3)
    def test_last_draw2_counts_penalty(self):
        s=fixture(2);c=cid('red','draw2');set_hands(s,[[c],[cid('blue',1)]]);u.play(s,1,c,None,False,1)
        self.assertEqual(s['status'],'finished');self.assertEqual(len(s['players'][1]['hand']),3);self.assertEqual(s['hand_points'],u.points(s['players'][1]['hand']))
    def test_last_draw4_waits_for_challenge(self):
        s=fixture(2);c=cid(None,'draw4');set_hands(s,[[c],[cid('blue',1)]]);u.play(s,1,c,'red',False,1)
        self.assertEqual(s['status'],'playing');u.answer_draw4(s,2,True,2);self.assertEqual(s['status'],'finished');self.assertEqual(len(s['players'][1]['hand']),7)
    def test_pair_wins_and_ignores_partner_score(self):
        s=fixture(4,'paired');c=cid('red',1);set_hands(s,[[c],[cid('blue',1)],[cid(None,'wild')],[cid('green',2)]]);u.play(s,1,c,None,False,1)
        self.assertEqual(s['winners'],[1,3]);self.assertEqual(s['hand_points'],3)
    def test_points_match(self):
        s=fixture(2,victory='points');c=cid('red',1);set_hands(s,[[c],[cid('blue',1)]]);u.play(s,1,c,None,False,1)
        self.assertEqual(s['status'],'hand_finished');s['scores']['1']=499;u.start_hand(s,2);set_hands(s,[[c],[cid('blue',2)]]);s.update(turn=1,phase='play',discard=[cid('red',5)],active_color='red');u.play(s,1,c,None,False,3);self.assertEqual(s['status'],'finished')
    def test_reshuffle_preserves_top(self):
        s=fixture();s['stock']=[];s['discard']=[cid('blue',3),cid('red',5)];u.draw_cards(s,1,1);self.assertEqual(s['discard'],[cid('red',5)]);self.assertEqual(s['players'][0]['hand'],[cid('blue',3)])
    def test_timeout_draws_and_passes(self):
        s=fixture();set_hands(s,[[cid('red',1)],[cid('blue',1)],[cid('green',1)]]);u.timeout(s,21);self.assertEqual(s['turn'],2);self.assertEqual(len(s['players'][0]['hand']),2)
    def test_paired_needs_four(self):
        s=fixture(3,'paired')
        with self.assertRaises(u.RuleError):u.start_hand(s,0)
    def test_random_games_conserve_deck_and_finish(self):
        rng=random.Random(71)
        for game in range(120):
            n=(2,3,4)[game%3];s=fixture(n,'paired' if n==4 and game%2 else 'solo');u.start_hand(s,0)
            for turn in range(6000):
                if s['status']!='playing':break
                seat=s['turn'];now=turn+1
                if s['phase']=='challenge':u.answer_draw4(s,seat,bool(rng.randrange(2)),now)
                elif s['phase']=='opening_color':u.choose_color(s,seat,rng.choice(u.COLORS),now)
                else:
                    legal=u.legal(s,seat)
                    if legal and rng.random()<.9:u.play(s,seat,rng.choice(legal),rng.choice(u.COLORS),True,now)
                    elif s['phase']=='drawn':u.pass_turn(s,seat,now)
                    else:u.draw(s,seat,now)
                all_cards=s['stock']+s['discard']+[c for p in s['players'] for c in p['hand']]
                self.assertEqual(len(all_cards),108);self.assertEqual(len(set(all_cards)),108)
            self.assertEqual(s['status'],'finished',f'game {game} stalled')

if __name__=='__main__':unittest.main()
