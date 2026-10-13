"""Server-owned purchase profiles; natural spins and existing bonuses are unchanged."""
from pathlib import Path
import json,secrets
BUY=json.loads(Path(__file__).with_name('slot-bonus-buy.json').read_text())
def purchase(game,rng=None):
 cfg=BUY[game];rng=rng or secrets.SystemRandom().random
 if game=='balikci':return cfg['spins'],None
 from .dogparty_engine import weighted
 wheel=[1+weighted(rng,cfg['wheelWeights']) for _ in range(9)]
 return sum(wheel),{'purchase':True,'board':[],'lineWins':[],'lineHundredths':0,'scatterHundredths':0,'payoutHundredths':0,'sticky':{},'newSticky':[],'scatters':0,'wheel':wheel,'bonusSpins':sum(wheel),'capped':False,'reelWindows':[]}
def hasan_buy_spin(**kwargs):
 from .balikci_engine import spin,CONFIG
 return spin(config={**CONFIG,'wildCounts':BUY['balikci']['wildCounts']},**kwargs)
