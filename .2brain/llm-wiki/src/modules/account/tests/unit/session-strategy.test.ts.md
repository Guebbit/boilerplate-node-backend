---
source: src/modules/account/tests/unit/session-strategy.test.ts
sha256: e0ba30759df3c281ecd82bf72c9cfd5c8e02e6dcf9653167b26b9b01776e43f9
generated_at: 2026-10-15T10:16:18.016419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-strategy.test.ts

## Purpose

Unit tests for the session-strategy seam: verifying that the active adapter is selected per-call from `NODE_SESSION_MODE`, that the resolver delegates (rather than caching) to whichever adapter is active, and that the shared mint guard enforces second-factor requirements before a session is issued.

## Key elements

- **`describe('activeStrategy')`** — Asserts the default (no env var → `jwtStrategy`), the per-mode mapping (`jwt`/`cookie`), and that a later change to `NODE_SESSION_MODE` is observed on the next call (no frozen snapshot).
- **`describe('accountAuthResolver')`** — Verifies `cookieAuthenticates()` reflects the current mode, and that `fromBearer` / `fromCookie` return structured miss codes (`'revoked'` for a foreign-mode credential, `'malformed'` for an unparseable value) without performing a lookup.
- **`describe('assertSecondFactor')`** — Confirms the guard throws `SecondFactorRequiredError` (carrying `userId`) when an armed account's proof list lacks the factor, passes when the factor is present, and is a no-op for un-armed accounts.

## Relationships

- **`strategy.ts`** — Under test. `activeStrategy()` is the function exercised in the first block.
- **`resolver.ts`** — Under test. `accountAuthResolver.cookieAuthenticates()` and `.fromBearer()` / `.fromCookie()` are exercised in the second block.
- **`cookie-strategy.ts` / `jwt-strategy.ts`** — Referenced as identity-check targets (`toBe(jwtStrategy)`, `toBe(cookieStrategy)`) to confirm the resolver reaches the correct adapter.
- **`mint-guard.ts`** — Under test. `assertSecondFactor` and `SecondFactorRequiredError` are exercised in the third block.
- **`tests/support/environment.ts`** — Provides `setEnvironment`, used to mutate `NODE_SESSION_MODE` between assertions.

## Notes

- The "mode changed after import" test exists to guard against a regression where `activeStrategy` captures the adapter once at module load. If that ever regresses, the first call still returns `cookieStrategy` while the second returns `jwtStrategy`, and the test catches it.
- Cross-mode credentials are modelled as *stale*, not *forged*: a JWT-shaped string presented in cookie mode yields `miss: 'revoked'`, not an error. This is an intentional design choice being pinned by the test.
- `setEnvironment` is the only env-mutation helper used; tests do not call `process.env` directly.
