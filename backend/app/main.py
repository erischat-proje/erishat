from __future__ import annotations

# Room WebSocket hardening: existing members who are subsequently banned must not
# keep/reopen a room socket. The endpoint re-checks membership and ban state at
# connection time and on every chat message.

