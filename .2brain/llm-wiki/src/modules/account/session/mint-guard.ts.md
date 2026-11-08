---
source: src/modules/account/session/mint-guard.ts
sha256: d64bab2426935e629e7d5624467bcb802f3c293707615a3cad9e65efde83dae4
generated_at: 2026-11-08T04:29:46.545360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/mint-guard.ts

## Purpose

Enforces the two invariants a **first** (not re-minted) session must satisfy at the moment it is issued: the proof must carry a second factor when one is armed, and the proof must not predate the account's current epoch. Both session modes call these guards inside `issue`; they are the last line of defense against a login path that skipped the challenge or raced an epoch transition.

## Key elements

- **`assertSecondFactor(user, amr)`** — Throwing guard. If `user.twoFactorEnabledAt` is set and `amr` lacks the `otp` marker, throws `SecondFactorRequiredError`. Delegates the actual predicate to `firstSessionRefused`.
- **`assertProofCurrent(user, provedAt)`** — Throwing guard. If the account's `tokensValidAfter` epoch post-dates `provedAt`, throws `StaleProofError`. Delegates to `proofPredatesEpoch`.
- **`SecondFactorRequiredError`** — Domain error; carries `userId`. Signifies the proof arrived without a second factor despite one being armed.
- **`StaleProofError`** — Domain error; carries `userId`. Signifies the proof was validated before the account's epoch advanced (password change, global logout).

## Relationships

- **`src/modules/account/domain/epoch.ts`** — Supplies `proofPredatesEpoch`, the comparison used by `assertProofCurrent`.
- **`src/modules/account/domain/session-proof.ts`** — Supplies `firstSessionRefused`, the predicate used by `assertSecondFactor`.
- **`src/modules/account/session/cookie-strategy.ts`** / **`src/modules/account/session/jwt.ts`** — The two session modes that call these guards from their respective `issue` implementations.
- **`src/modules/account/tests/integration/session-mint-guard.test.ts`** — Direct integration coverage of both guards.
- **`src/modules/account/tests/integration/session-modes.test.ts`** — Exercises the guards as part of full session-mode flows.

## Notes

- Guards are invoked **only** from `issue`, never from re-mint paths. A re-mint (e.g. cookie refresh) does not re-check these invariants.
- `assertProofCurrent` reads `tokensValidAfter` from the account object the mint just loaded, so it catches epoch transitions that committed *between* the original proof check and the mint commit.
- `amr` is typed `readonly string[]`; callers pass the AMR array extracted from the proof.
- Both error classes expose `userId` as a public readonly field for downstream error-handling / logging.
