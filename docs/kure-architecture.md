# Lidya Kaderin Küresi

Original ErisChat fortune-teller game using the user's variable-ways/wheel specification, with generated artwork and original random distributions. This does not reproduce or certify a provider's proprietary reel strips or licensed game maths.

## Ways and Wilds

Six main reels hold 2..7 symbols. Four top-tracker cells are additional positions on reels 2..5; max ways = 7×8×8×8×8×7 = 200704. Pay the longest contiguous left-to-right match of at least three reels for each normal symbol appearing on reel 1. No enumeration of 200704 combinations: multiply per-reel match counts.

For each winning symbol: ordinaryWays = product(normal counts); totalWays = product(normal+Wild counts); WildWays = totalWays-ordinaryWays. Pay = basePay × (ordinaryWays + 2×WildWays) × currentWheelMultiplier. One or multiple Wilds within one combination cause only one 2× factor. Wild is forbidden on main reel 1; top Wilds on reels 2..5 are valid. Wild never substitutes for crystal Scatter.

## Tumbles and crystal balls

Winning normal/Wild positions are removed once, including shared Wild positions. Main-reel survivors fall down and refill from above. Top-tracker survivors shift right; new cells enter at left. Heights stay fixed for the entire paid/free spin and are rerolled next spin.

Scatters are seeded only on the initial main board, at most one per reel, none on top. They survive tumbles, are counted once and never appear in refills. Three/four/five/six pay 5/10/20/100× basic stake and trigger a wheel. In bonus these payments also use the current wheel multiplier, but never Wild's 2×. Total paid-spin plus complete bonus cap: 5000×. At cap no further tumble/wheel/bonus steps are awarded. Scatter UI amount is clipped to actual capped payout.

## Two-ring wheel and persistent bonus

Outer sectors [5,8,10,12,15,20,12], including both requested 12 sectors; inner [2,3,5,8,10,15,20,25]. Server selects and stores the exact sector indices before animation. Purchase: 100× basic stake, independent of Ante, selects the initial purchase wheel. Initial wheel sets remaining spins/multiplier. Every free spin uses the existing multiplier. Three or more Scatters in bonus pay and spin another wheel; new spins are added to the counter and new multiplier is added, starting next spin. There is no fixed retrigger-count limit; cap ends the round.

Ante in paid base spins charges 125 cents per stake unit and doubles every nonzero initial Scatter-count probability via a .4→.8 event gate. Its separate height distribution is explained in rules. Normal/Ante share symbol/pay tables; buy has an explicitly separate initial wheel distribution. Bonus tumble/wheel-retrigger rules are common. This is an original simulation-calibrated model, never a certified RTP claim.

## Wallet/API and integration

Existing User.lidya + dede_wallet fractional ledger; user row lock; GameRound/GameBet/GamePlay; archived UUID receipts; ownership/sequence/stake/Ante checks; active-round resume. Same request replay, including older requests, causes no extra debit/credit/retrigger. API never accepts client board, refill or wheel selections.

Register kure router before catch-all StaticFiles. Same SlotStakes +/- bands, shared SlotBonusBuy confirmation/price/balance, dedicated capture routing and premium PNG mapper. Other game rules/open bonus versions unchanged. The production HTML does not load the offline RNG module.

## Assets, rendering and one-file demo

12 genuine generated transparent PNG symbols plus original 2:1 cover: gold-violet 10/J/Q/K/A, tarot, candles, potion, cat, owl, blue crystal sphere, fortune-teller Wild. Built-in image generation prompts requested original premium violet/blue/gold raster artwork with a transparent 4×3 atlas and safe gutters, plus an original Kaderin Küresi cover. Atlas extraction/sizing prepares assets for Canvas.

Variable cell heights, staggered reels, two-Scatter glow/anticipation, blue/purple tumble particles, vertical refill, horizontal top shift, Wild eye glints/lightning. Exact two-ring Canvas wheel rotates to selected sectors and highlights them; no guessed result. Animation targets RAF/60fps and stops RAF while idle. Reduced motion supported. Background stops autoplay/audio/wheel; close releases renderer/wheel promises, observers, timers, keys and audio. Escape and focus trapping work when a spinning button loses focus. Bounded synth master .16, six voices, mystic-scale music and magic/bell/tick cues; no external MP3.

Package-root index.html embeds all CSS/JS/config/PNG and uses virtual localStorage balance only, with persistent bonus/receipt state. It works without network requests. Production results come from the authenticated server.

## Validation

- 18 new engine/API cases plus 4 Python/JavaScript parity cases: mixed ordinary/Wild combinations, top ways, max ways/cap, scatter payments, tumble removal, all 56 wheel-sector mappings, Ante fraction debit, ownership/sequence/Ante lock, replay and additive retrigger. 19 Altın regression cases; 41 total pass.
- Chromium 320/390/1024px, both themes; PNG load, shared bet, Ante price, cancel/one purchase, exact wheel result and persisted bonus finish; zero network in standalone demo.
- Actual-motion variable-height/tumble/Wild FX and double wheel; close mid animation; bounded audio and cleanup. Production card/PNG mapper/capture route works without legacy Wheel fallback.
- Python compile, JS syntax, whitespace; sparse installer twice with mocked remote actions, exact patched source tree, SHA256 and ZIP CRC.
- Independent complete-round simulations: normal 300000 = 96.5566633% (95% CI 92.2547914–100.8585353); Ante 300000 = 96.2913627% (CI 91.9517661–100.6309592); buy 30000 = 96.2069917% (CI 93.8494224–98.5645609). Target 96.56% lies within each interval. Reports and reproducible scripts included. These are Monte Carlo estimates, not certified exact RTP. Live DB concurrent load and physical Android device QA were not run.

Installer creates a draft PR; it never merges or deploys automatically.
