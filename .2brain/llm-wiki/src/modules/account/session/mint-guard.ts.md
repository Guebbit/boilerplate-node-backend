---
source: src/modules/account/session/mint-guard.ts
sha256: c16c25d296555128b38e48c603ed79453e8aa9831cb8930fa27c9fe439402a03
generated_at: 2026-10-15T10:08:19.144705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/mint-guard.ts

## Purpose

Defines the two invariants a **first** session must satisfy at mint time: the proof must evidence an armed second factor, and it must not predate the account's current session epoch. These checks run inside `issue` (the mint path) rather than in login-branching logic, so a code path that forgets to branch to a challenge or re-validate after an epoch change is still refused at the point of no return.

## Key elements

- **`SecondFactorRequiredError`** — thrown when the account has a second factor armed but the proof's `amr` array lacks one. Carries `userId` for logging/context.
- **`assertSecondFactor(user, amr)`** — calls `firstSessionRefused` from the domain layer; throws `SecondFactorRequiredError` if the account is armed and the proof carries no second-factor marker.
- **`StaleProofError`** — thrown when the proof's check timestamp precedes the account's `tokensValidAfter` epoch (e.g., a password change or global logout landed mid-login).
- **`assertProofCurrent(user, provedAt)`** — calls `proofPredatesEpoch` from `epoch.ts`; throws `StaleProofError` if the epoch moved after the proof was verified.

## Relationships

- **`session-proof.ts`** — provides `firstSessionRefused`, the pure domain predicate that decides whether a given `amr` list satisfies a two-factor requirement. This file is its only caller in the session module.
- **`epoch.ts`** — provides `proofPredatesEpoch`, the comparison that decides whether a timestamp falls before an epoch boundary.
- **`jwt.ts`** — the `issue` function (both session modes) calls `assertSecondFactor` and `assertProofCurrent` as a gate before creating the token. The file's module doc explicitly states these guards are invoked from `issue`, never from re-mint.
- **`cookie-strategy.ts`** — shares the session-issuance flow; both are exercised together in integration tests.
- **`session-mint-guard.test.ts` / `session-modes.test.ts`** — integration tests that verify the guards fire on both session modes and on the re-mint exemption.

## Notes

- The guards are intentionally called only on **first** mints. Re-mints (e.g., sliding expiration) skip them; do not add a call to `issue`-equivalent paths that are not first-time.
- `assertProofCurrent` reads `tokensValidAfter` off the freshly loaded account object, so it catches epoch changes committed between the initial proof check and the mint commit — it does **not** re-read from the same snapshot used to verify the proof.
- Both error classes carry `userId` as a public readonly field, making them easy to log or map to a 403 response without message-parsing.
