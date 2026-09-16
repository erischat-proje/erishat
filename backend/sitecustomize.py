"""Railway startup compatibility patch.

The deployment image may contain an older generated main.py snapshot. Normalize
legacy response annotations before Uvicorn imports app.main.
"""
from pathlib import Path

for candidate in (Path('/app/app/main.py'), Path(__file__).resolve().parent / 'app' / 'main.py'):
    if candidate.exists():
        source = candidate.read_text(encoding='utf-8')
        fixed = source.replace('list[Conversation]', 'list[ConversationOut]')
        if fixed != source:
            candidate.write_text(fixed, encoding='utf-8')
        break
