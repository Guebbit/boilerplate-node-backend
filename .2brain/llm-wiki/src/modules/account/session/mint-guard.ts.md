---
source: src/modules/account/session/mint-guard.ts
sha256: 99a2a48754f57d4575549aafa38a0d13c609dbeaad1f60b5e37c2aad77bd2b5e
generated_at: 2026-10-14T09:01:56.426599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/mint-guard.ts

## Purpose

Enforces "no first session without a second factor" at the point where a session token is minted. Rather than relying on every login branch to check the 2FA challenge, this guard sits inside `issue` so that any present or future login path that skips the challenge still cannot hand out a first session.

## Key elements

- **`SecondFactorRequiredError`** — Error subclass carrying the `userId` of the refused account. Thrown when the mint guard rejects a first session.
- **`assertSecondFactor(user, amr)`** — Synchronous guard. Given an account object (`id`, `twoFactorEnabledAt?`) and the `amr` claims array, it calls `firstSessionRefused` and throws `SecondFactorRequiredError` if the account has 2FA armed but the proof lacks the `otp` attestation.

## Relationships

- **`src/modules/account/domain/session-proof.ts`** — Supplies `firstSessionRefused`, the pure predicate that decides whether the mint is refused. This file adds the *throwing* wrapper around it.
- **`src/modules/account/session/jwt.ts`** / **`cookie-strategy.ts`** — The two session modes that call `assertSecondFactor` from their `issue` (first-session) path, per the module doc. They do **not** call it from a re-mint path.
- **`src/modules/account/tests/integration/session-mint-guard.test.ts`** — Integration test that exercises the guard end-to-end.
- **`src/modules/account/tests/integration/session-modes.test.ts`** — Covers both session modes, implicitly exercising the guard via `issue`.

## Notes

- The guard is invoked **only on first-session minting**, never on re-mint. A session that already exists is not re-checked here.
- The `amr` parameter is a `readonly string[]`; the expected 2FA attestation is the literal token `'otp'`.
- This is a defense-in-depth check: login paths are still expected to branch to the challenge before calling `issue`. The guard exists to catch a path that *forgot* to branch.
