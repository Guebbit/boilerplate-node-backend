---
source: src/modules/account/session/mint-guard.ts
sha256: d64bab2426935e629e7d5624467bcb802f3c293707615a3cad9e65efde83dae4
generated_at: 2026-10-29T02:49:59.732879+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/mint-guard.ts

## Purpose

Guards that must pass before a **first** session is minted for an account. They enforce two invariants at the mint site (rather than relying on each login branch to check them): (1) a session cannot be issued when a second factor is armed but the proof carries none, and (2) a session cannot be issued on a proof whose check preceded the account's current epoch (e.g. a password change committed mid-login). Both session strategies invoke these from their `issue` path, never from a re-mint.

## Key elements

- **`SecondFactorRequiredError`** – Thrown when an armed account's proof lacks a second-factor `amr`. Carries `userId` for identification.
- **`StaleProofError`** – Thrown when the proof's `provedAt` timestamp predates the account's `tokensValidAfter` epoch. Carries `userId`.
- **`assertSecondFactor(user, amr)`** – Calls `firstSessionRefused` (from `session-proof`); throws `SecondFactorRequiredError` if the account has `twoFactorEnabledAt` set and the proof's `amr` array does not include `otp`.
- **`assertProofCurrent(user, provedAt)`** – Calls `proofPredatesEpoch` (from `epoch`); throws `StaleProofError` if the proof was checked before the account's `tokensValidAfter` moved.

## Relationships

- **`src/modules/account/domain/session-proof.ts`** – Provides `firstSessionRefused`, the pure predicate that `assertSecondFactor` delegates to.
- **`src/modules/account/domain/epoch.ts`** – Provides `proofPredatesEpoch`, the pure predicate that `assertProofCurrent` delegates to.
- **`src/modules/account/session/cookie-strategy.ts`** / **`src/modules/account/session/jwt.ts`** – Both session modes call `assertSecondFactor` and `assertProofCurrent` from their `issue` path (first-mint only, not re-mint).
- **Tests** – `session-mint-guard.test.ts` and `session-modes.test.ts` exercise the guard behavior end-to-end; `cookie-strategy.test.ts` and `session-strategy.test.ts` cover the calling context.

## Notes

- The functions are assertions, not checks returning a boolean: they either pass silently or throw a typed error. Callers must `catch` the specific error class to distinguish the two refusal reasons.
- `assertProofCurrent` reads `tokensValidAfter` off the **freshly loaded** account record at mint time, so a password change committed between the original proof check and the mint is still caught—this is the whole point of re-reading the account at issue rather than trusting a cached value.
- These guards are deliberately **not** invoked on re-mint paths; they exist only to catch a first session that a login branch failed to challenge first.
