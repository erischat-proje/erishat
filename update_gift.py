import re

with open("backend/app/gift_routes.py", "r", encoding="utf-8") as f:
    code = f.read()

# Eski importları düzeltelim
code = code.replace("from .game_economy import Wallet, LedgerEntry", "from .ledger_engine import process_ledger_transaction")

with open("backend/app/gift_routes.py", "w", encoding="utf-8") as f:
    f.write(code)

print("gift_routes.py importları güncellendi.")
