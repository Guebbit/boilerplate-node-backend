---
source: src/modules/account/tests/unit/session-strategy.test.ts
sha256: e0ba30759df3c281ecd82bf72c9cfd5c8e02e6dcf9653167b26b9b01776e43f9
generated_at: 2026-11-08T04:50:26.269782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-strategy.test.ts

## Purpose

Unit tests that verify the session-strategy seam: the `activeStrategy` factory picks the correct adapter per call based on `NODE_SESSION_MODE`, the resolver consults that live selection (not a frozen snapshot) when deciding whether a cookie can authenticate ordinary routes, and the mint guard enforces second-factor proof on armed accounts.

## Key elements

- **`describe('activeStrategy')`** — three tests confirming the default is `jwtStrategy`, that the returned object is the exact adapter for the named mode, and that the choice re-evaluates on every call (mode change after import is honoured, not cached).
- **`describe('accountAuthResolver')`** — verifies `cookieAuthenticates()` returns `true` only in cookie mode, and that `fromBearer` / `fromCookie` reject out-of-mode credentials (`{ miss: 'revoked' }` for a JWT in cookie mode, `{ miss: 'malformed' }` for a non-session-id cookie).
- **`describe('assertSecondFactor')`** — covers the three branches: throws `SecondFactorRequiredError` (carrying `userId`) when the account is armed but the proof lacks a factor; passes when the factor is present; is a no-op when no factor is armed.

## Relationships

- **`session/strategy.ts`** — source of `activeStrategy`, the function under test.
- **`session/jwt-strategy.ts`** / **`session/cookie-strategy.ts`** — the two adapters; tests assert identity (`toBe`) against these singletons.
- **`session/resolver.ts`** — source of `accountAuthResolver`; tests exercise its `cookieAuthenticates()`, `fromBearer()`, and `fromCookie()` surface.
- **`session/mint-guard.ts`** — source of `assertSecondFactor` and the `SecondFactorRequiredError` class.
- **`tests/support/environment.ts`** — provides `setEnvironment` to flip `NODE_SESSION_MODE` between assertions without mocking the module system.

## Notes

- Strategy selection is asserted with `toBe` (reference identity), not `toEqual` — the two adapters are expected to be stable singletons.
- The "mode changed after import" test exists specifically to guard against a regression where `activeStrategy` memoises the first lookup.
- The `jwtShaped` bearer token in the resolver test is deliberately a JWT sent to a cookie-mode resolver, modelling a credential left behind by a mode switch (stale, not forged).
