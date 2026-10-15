"""Reproducible full-round model audit. Never reads or writes a user wallet."""
import argparse
import hashlib
import importlib.util
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def simulate(game, mode, samples, seed, version='v2'):
    path = ROOT / 'backend/app' / f'aztek_ares_{version}.py'
    spec = importlib.util.spec_from_file_location('aztek_math_' + version, path)
    engine = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(engine)
    rng = random.Random(seed)
    if version == 'v1':
        # Isolated legacy module: preserve production code bytes and RNG.
        engine.pick = rng.randrange
        engine.Turn.event = lambda *args, **kwargs: None
    cost = 100 if mode == 'buy' else 1
    total = squared = hits = paid_hits = profits = caps = bonus_rounds = free_spins = 0
    maximum = 0

    def spin(**kwargs):
        if version == 'v2':
            kwargs.update(rng=rng.random, trace=False)
        return engine.spin(game, **kwargs)

    for _ in range(samples):
        result = spin(purchase=mode == 'buy')
        payout = result['payoutHundredths']
        paid_hits += payout > 0
        remaining = result['awarded']
        bonus_rounds += mode == 'buy' or bool(remaining) or result.get('goldFever', False)
        steps = 0
        while remaining and payout < engine.CAP:
            result = spin(bonus=True, remaining_cap=engine.CAP - payout)
            payout += result['payoutHundredths']
            remaining += result['awarded'] - 1
            free_spins += 1
            steps += 1
            if steps > 10000:
                raise RuntimeError('Unexpected bonus chain; no silent truncation')
        ratio = payout / 100 / cost
        total += ratio
        squared += ratio * ratio
        hits += payout > 0
        profits += ratio > 1
        caps += payout >= engine.CAP
        maximum = max(maximum, payout / 100)
    mean = total / samples
    se = math.sqrt(max(0, (squared - total * total / samples) / (samples - 1) / samples))
    sources = [path, ROOT / 'tests/aztek_ares_simulate.py']
    if version == 'v2':
        sources.append(ROOT / 'backend/app/aztek-ares-math-v2.json')
    return dict(game=game, mode=mode, version=engine.VERSION, samples=samples, seed=seed,
                costUnits=cost, rtp=mean, ci95=[max(0, mean - 1.96 * se), mean + 1.96 * se],
                roundHitFrequency=hits / samples, netProfitFrequency=profits / samples,
                paidSpinHitFrequency=paid_hits / samples if mode != 'buy' else None,
                bonusFrequency=None if version == 'v1' and game == 'aztek' and mode != 'buy' else bonus_rounds / samples, freeSpins=free_spins,
                cappedRounds=caps, maxObservedX=maximum, certified=False,
                targetRtp=engine.CONFIG['targetRtp'] if version == 'v2' else None,
                source_sha256={str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sources},
                note='Whole paid rounds, including retriggers and shared round cap. Normal-approximation 95% Monte Carlo interval; not certified RTP.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('game', choices=['aztek', 'ares'])
    parser.add_argument('mode', choices=['normal', 'buy'])
    parser.add_argument('--version', choices=['v1', 'v2'], default='v2')
    parser.add_argument('--samples', type=int, default=500000)
    parser.add_argument('--seed', type=int, default=151026)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2')
    report = simulate(args.game, args.mode, args.samples, args.seed, args.version)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report), flush=True)
