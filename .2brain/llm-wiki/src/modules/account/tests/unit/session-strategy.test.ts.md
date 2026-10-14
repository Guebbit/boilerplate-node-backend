---
source: src/modules/account/tests/unit/session-strategy.test.ts
sha256: c2f7b66a061ded3829af07f93abccf59a40c15f8e062c305e8e8acd32701585a
generated_at: 2026-10-14T14:46:28.675902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-strategy.test.ts

## Purpose

Unit tests for the session-mode seam: they verify that `activeStrategy` dynamically selects the correct adapter from `NODE_SESSION_MODE` on every call (rather than caching the first one), that the resolver's cookie-authentication gate flips correctly per mode, and that the mint guard enforces second-factor proof only for armed accounts.

## Key elements

- **`describe('activeStrategy')`** — asserts the default is `jwtStrategy`; that `NODE_SESSION_MODE='cookie'` / `'jwt'` selects the matching adapter; and that a mid-test env change is picked up on the next call (no frozen import-time value).
- **`describe('accountAuthResolver')`** — checks `cookieAuthenticates()` returns `true` in cookie mode and `false` in jwt mode; also verifies `fromBearer` / `fromCookie` reject malformed tokens with a `{ miss: 'malformed' }` result without performing a lookup.
- **`describe('assertSecondFactor')`** — confirms the guard throws `SecondFactorRequiredError` (carrying `userId`) when an armed account's proof lacks a second factor, passes when the factor is present, and is a no-op for unarmed accounts.
- **`setEnvironment`** (from `@tests/environment`) — the sole mechanism for mutating `NODE_SESSION_MODE` between assertions.

## Relationships

- **`strategy.ts`** — source of `activeStrategy`, the function under test.
- **`resolver.ts`** — source of `accountAuthResolver` (`cookieAuthenticates`, `fromBearer`, `fromCookie`).
- **`cookie-strategy.ts`** / **`jwt-strategy.ts`** — the two adapters that `activeStrategy` must return; identity-checked with `.toBe` and `.mode` inspected.
- **`mint-guard.ts`** — source of `assertSecondFactor` and `SecondFactorRequiredError`.
- **`tests/support/environment.ts`** — provides `setEnvironment` to drive the `NODE_SESSION_MODE` env var in-process.

## Notes

- The "follows a mode changed after import" test is the critical regression guard: it locks in the per-call read contract. Any refactor that hoists the adapter selection to module scope will break it.
- Identity checks use `.toBe` (reference equality) for adapter selection, not deep equality — the tests care that the *same object* is returned, not just an equivalent one.
- All path imports use project aliases (`@modules/…`, `@tests/…`); no relative paths.
