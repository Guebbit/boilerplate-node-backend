---
source: src/modules/account/tests/integration/auth-hardening.test.ts
sha256: 9346399e7cd478cfbdc689db5fe0a878ba45d3c48d29f3d047e92334d003a34e
generated_at: 2026-09-27T14:34:12.435890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for the two hardening layers that protect the account login endpoint from credential-stuffing: the per-identity / per-address rate limiter (`credentialLimiters`) and the antibot challenge gate (`loginChallengeGate`). The suite verifies that these mechanisms behave correctly in isolation (via a minimal Express app) and that they are actually mounted on the real `/account/login` route.

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — helper that reloads `@modules/account/rate-limits` with a small `NODE_AUTH_RATE_LIMIT_MAX` (and optional `NODE_AUTH_RATE_LIMIT_ADDRESS_MAX`) and returns the `credentialLimiters` middleware pair. Keeps the two buckets independently settable so a test about one can leave the other with headroom.
- **`appWithBudget(identityLimit)`** — builds an Express app whose `POST /login` route uses `credentialLimiters` **and** `loginChallengeGate` from the *same* module reload (they must share a module instance because the gate reads the property name the limiter was configured with).
- **`describe('credential endpoints are rate limited separately')`** — four tests: 429 after budget exhaustion, successful attempts don't spend budget, per-identity buckets are independent of per-address buckets, and the limiter is mounted on the real login route (checked via `ratelimit` response header).
- **`describe('loginChallengeGate — rung 3 only once the identity budget is mostly spent')`** — three tests: gate is inert when no `NODE_ANTIBOT_PROVIDER` is set, first attempt passes through even with a provider selected, and the gate returns `ANTIBOT_VERIFICATION_FAILED` once the identity budget reaches half its limit.

## Relationships

- **`src/modules/account/rate-limits.ts`** — the unit under test. Reloaded via `withReloadedRateLimits` with controlled env vars; provides `credentialLimiters` (two express middlewares) and `loginChallengeGate`.
- **`tests/support/rate-limit-harness.ts`** — supplies `withReloadedRateLimits`, which re-imports the target module under a fresh Jest module registry with specified `process.env` values, yielding a clean limiter for each test.
- **`tests/support/http.ts`** — supplies the `api()` helper used by the "mounted on the real login route" test to hit the full application rather than the isolated Express stub.
- **`tests/support/setup-test-db.ts`** — called once at module scope (`setupTestDb()`) so the real-route test can persist a user.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` and the `PLAIN_PASSWORD` constant for the real-route test.

## Notes

- `afterEach(() => jest.resetModules())` appears in **both** describe blocks. Without it, the second test in a block would see the mutated limiter state from the first. The challenge-gate block additionally restores `NODE_ANTIBOT_PROVIDER` in its own `afterEach`.
- The "mounted on the real login route" test does **not** assert a 200 or 401; it only checks for the `ratelimit` response header. A 401 from a wrong password is the expected body response — the assertion is purely about the limiter having run.
- The comment block at the top of the file clarifies the boundary: this suite covers `account/rate-limits.ts` hardening, whereas the global error-handler path is tested in the root-level `tests/integration/auth-hardening.test.ts`.
- `addressLimit` defaults to `identityLimit` in `limitersWithBudget`; the identity-vs-address isolation test explicitly passes `50` for the address budget so the identity bucket is the one under observation.
