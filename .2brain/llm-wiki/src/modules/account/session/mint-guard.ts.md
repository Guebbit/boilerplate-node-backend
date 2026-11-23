---
source: src/modules/account/session/mint-guard.ts
source_sha256: 7f080b48c2ba61f3660ed3ff5e5f859ce47caa766681ef5ef5d3b87b080a1991
context_sha256: d9c3ed83463f5c2792bc497e665c4f2fff5435e6cbf9f9356c2443e20698cf35
generated_at: 2026-11-22T03:48:28.493129+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/mint-guard.ts

## Purpose
Defines the checks a first session must pass at the point it is minted, rather than only where a login flow branches. Both session modes call these guards from `issue` (never from a re-mint), so a login path that skipped the second-factor challenge or raced a password change/logout-everywhere still cannot obtain a session.

## Key elements
- `assertSecondFactor(user, amr)` — throws `SecondFactorRequiredError` if `firstSessionRefused(Boolean(user.twoFactorEnabledAt), amr)` is true, i.e. a second factor is armed but the proof's `amr` carries no `otp`. Takes `user: { id, twoFactorEnabledAt? }`.
- `SecondFactorRequiredError` — carries `userId`; message "A second factor is armed for this account and the proof carries none".
- `assertProofCurrent(user, provedAt)` — throws `StaleProofError` if `proofPredatesEpoch(provedAt, user.tokensValidAfter)` is true. `provedAt` is epoch milliseconds from when the proof's check began; `user` is `{ id, tokensValidAfter? }`.
- `StaleProofError` — carries `userId`; message "The account ended its sessions after this proof was checked".

## Relationships
- `src/modules/account/domain/session-proof.ts` — supplies `firstSessionRefused`, which holds the second-factor decision logic used by `assertSecondFactor`.
- `src/modules/account/domain/epoch.ts` — supplies `proofPredatesEpoch`, which holds the epoch comparison used by `assertProofCurrent`.
- `src/modules/account/session/cookie-strategy.ts` and `src/modules/account/session/jwt.ts` — the two session modes' `issue` paths, which per the module docs are the callers of these guards.
- Tests: `src/modules/account/tests/integration/session-mint-guard.test.ts` (guard behavior at mint), `src/modules/account/tests/integration/session-modes.test.ts`, `src/modules/account/tests/unit/cookie-strategy.test.ts`, and `src/modules/account/tests/unit/session-strategy.test.ts`.

## Notes
- The guards are a backstop: login paths are expected to branch to the challenge first, so `SecondFactorRequiredError` signals a path that forgot to.
- `assertProofCurrent` is meant to run against the account the mint has just loaded, so a password change committed between the proof check and the mint is detected.
- `tokensValidAfter` is optional; it is absent when nothing ever moved the epoch.
- Re-mints are intentionally not guarded.
