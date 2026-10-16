# ErisChat slot standards

These are the user's standing requirements for every existing and future slot game.

- Use the shared Lidya wallet and fractional ledger. Never create a separate production balance.
- All +/- bet controls use `SlotStakes.next(value, direction)` from `slot-stakes.js`. Initial bet50, range1..10000. Bands:1–200 step50;200–1000 step100;1000–5000 step200;5000–10000 step250. Do not duplicate arithmetic or hard-code a single step in a game. Load shared module before game controllers and alias wrappers.
- Every slot includes bonus/free-spin purchase. Price and awarded spins come from server rules; show the total price and current balance before confirming. Disable purchases during active bonus, pending request or insufficient balance. Debit and outcome selection occur on server, with request UUID idempotency, locked stake and resumable bonus state.
- New game artwork is PNG and follows the Lidya visual theme. Menu cover must be2:1 without cut-off title/character; use the common `eg-launcher-card`/`pg-cover`/`eg-lc-play` layout and common marble CTA.
- Register custom games in `custom-game-routing.js`. A card must open its own game once and must never fall through to the legacy Wheel fallback.
- Sound has a bounded master gain, concurrency limit, mute and cleanup on close/background. Respect reduced-motion and stop autoplay on page background.
- Do not describe target RTP as certified or measured unless independent reports justify that description. Preserve math/version compatibility of already-open production bonuses when changing a model.
