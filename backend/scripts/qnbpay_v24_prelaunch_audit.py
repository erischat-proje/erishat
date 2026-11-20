"""LidyaChat V24: read-only local test aggregation and integration checklist.

Does not call PSP, database, network or mutate wallets. V17 PostgreSQL disposable
script is NOT run; only the V17 unit tests are included.
"""
from __future__ import annotations

import argparse
import ast
import json
import os
from pathlib import Path
import subprocess
import sys

SUITES = (
    'test_woocommerce_qnbpay_pg_v17.py',
    'test_woocommerce_qnbpay_risk_v18.py',
    'test_woocommerce_qnbpay_delivery_v19.py',
    'test_woocommerce_qnbpay_events_v20.py',
    'test_woocommerce_qnbpay_event_journal_v21.py',
    'test_woocommerce_qnbpay_v22_offline.py',
    'test_woocommerce_qnbpay_preflight_v23.py',
)

# The V21 registry and all V18-20 planning modules deliberately deny real capture.
CRITICAL_MARKERS = {
    'woocommerce_qnbpay_ledger_v16.py': ["state = 'unverified'", "'payment_enabled': False", "'coin_delivery_enabled': False"],
    'woocommerce_qnbpay_event_journal_v21.py': ["state = 'unverified'", "'provider_callback_enabled': False", "'coin_delivery_enabled': False"],
    'woocommerce_qnbpay_delivery_v19.py': ['payment_enabled: bool = False', 'coin_delivery_authorized: bool = False'],
    'woocommerce_qnbpay_events_v20.py': ['event_ingestion_enabled: bool = False', 'coin_delivery_authorized: bool = False'],
}

UNAVAILABLE_UNTIL_PSP = (
    'QNBpay merchant contract and technical documentation validated',
    'Authenticated callback and server-to-server capture re-query integrated',
    'Exact user/order/package/TRY amount matching with provider evidence',
    'Durable verified transaction claim and atomic idempotent Coin wallet credit',
    'Refund, chargeback, reconciliation and operational alerts tested',
    'Sandbox end-to-end test and authorized production go-live approval',
)


def audit_layout(repo: Path) -> dict:
    base = repo / 'backend'
    if not (base / 'app' / 'main.py').is_file() or not (base / 'tests').is_dir():
        raise ValueError('LidyaChat repository root required')
    missing_tests = [x for x in SUITES if not (base / 'tests' / x).is_file()]
    issues = []
    for filename, fragments in CRITICAL_MARKERS.items():
        p = base / 'app' / filename
        if not p.is_file():
            issues.append(f'Missing safety module: {filename}')
            continue
        src = p.read_text(encoding='utf-8')
        try:
            ast.parse(src)
        except SyntaxError:
            issues.append(f'Invalid Python module: {filename}')
        for fragment in fragments:
            if fragment not in src:
                issues.append(f'Safety marker changed: {filename}: {fragment}')
    return {'missing_test_suites': missing_tests, 'safety_marker_issues': issues,
            'live_payment_ready': False,
            'prerequisites_not_verified': list(UNAVAILABLE_UNTIL_PSP)}


def run_suites(repo: Path) -> list[dict]:
    results = []
    for name in SUITES:
        env = dict(os.environ)
        env['PYTHONPATH'] = str(repo / 'backend')
        command = [sys.executable, '-m', 'unittest', 'discover',
                   '-s', 'backend/tests', '-p', name, '-v']
        completed = subprocess.run(command, cwd=repo, env=env,
                                   capture_output=True, text=True, timeout=180)
        output = completed.stdout + completed.stderr
        print(f'\n===== {name} =====', flush=True)
        print(output[-12000:], flush=True)
        results.append({'suite': name, 'passed': completed.returncode == 0,
                        'return_code': completed.returncode})
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', type=Path, default=Path.cwd())
    parser.add_argument('--skip-tests', action='store_true', help='validate layout only')
    args = parser.parse_args()
    repo = args.repo.resolve()
    result = audit_layout(repo)
    if result['missing_test_suites'] or result['safety_marker_issues']:
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 1
    result['suite_results'] = [] if args.skip_tests else run_suites(repo)
    result['regression_tests_passed'] = (not args.skip_tests and
                                         all(t['passed'] for t in result['suite_results']))
    print('\n===== V24 PRELAUNCH AUDIT =====')
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print('PAYMENT REMAINS DISABLED: this report is NOT QNBpay authorization.')
    return 0 if args.skip_tests or result['regression_tests_passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
