---
source: tests/integration/auth-hardening.test.ts
sha256: 0039b2c5dd2fc240db6e2f3761ed7d765e3cc148cb4a43fff728bcaddbe267b5
generated_at: 2026-09-23T20:03:04.565905+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/auth-hardening.test.ts

## Purpose

Integration tests for three auth-hardening properties: per-identity and per-address rate limiting on credential endpoints, the anti-bot challenge gate that engages once the identity budget is half-spent, and the global 500 handler's error-sanitization contract. Each property is invisible under normal use and only observable under attack-shaped load, hence "hardening."

## Key elements

- **`limitersWithBudget(identityLimit, addressLimit?)`** — Returns `credentialLimiters` from a reloaded rate-limit module with a small, independently-settable budget per bucket. Used when a test only needs the limiters.
- **`appWithBudget(identityLimit)`** — Returns an Express app wiring `credentialLimiters` + `loginChallengeGate` from a _single_ reload, then a trivial 401 handler. Required when the gate and limiter must reference the same module instance.
- **`answerFor(thrown)`** — Dynamically imports `handleUncaughtError`, mounts it behind a route that `throw`s the given value, and fires a real HTTP request via supertest. Returns the response.
- **`describe('credential endpoints are rate limited separately')`** — Four cases: 429 after budget exhaustion, successful attempts not consuming budget, per-identity isolation within a shared address, and a smoke test that the limiter is mounted on the real `/account/login` route.
- **`describe('loginChallengeGate …')`** — Three cases: gate inactive without a provider, first attempt passes untouched with a provider set, challenge (`ANTIBOT_VERIFICATION_FAILED`) fires at exactly half the identity budget.
- **`describe('the 500 handler')`** — Sanitization of thrown error details, genuine body-parser `413` passthrough, and the `expose: false` contract (internal status codes must not leak).

## Relationships

| Neighbor                               | Interaction                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/account/rate-limits.ts`   | The system under test for the first two `describe` blocks. Reloaded via `withReloadedRateLimits`; its `credentialLimiters` and `loginChallengeGate` exports are the objects being asserted on. |
| `src/app/error-handling.ts`            | System under test for the 500-handler block. `handleUncaughtError` is imported **dynamically inside `answerFor`** (not at file top) to survive `jest.resetModules()`.                          |
| `src/modules/users/tests/factories.ts` | Provides `createUser` and `PLAIN_PASSWORD` for the single test that hits the real login route.                                                                                                 |
| `tests/support/http.ts`                | Provides `api()` for that same real-route smoke test.                                                                                                                                          |
| `tests/support/rate-limit-harness.ts`  | Provides `withReloadedRateLimits`, the mechanism that swaps env vars, resets the module cache, and re-imports `rate-limits.ts`.                                                                |
| `tests/support/setup-test-db.ts`       | Called once at module top level to prepare a clean database for the real-route test.                                                                                                           |

## Notes

- **`jest.resetModules()` is mandatory** between every case in the rate-limit and challenge-gate blocks. Without it the reloaded module instance leaks into the next case and budgets carry over.
- **`limitersWithBudget` ≠ `appWithBudget`.** The former returns limiters alone; the latter returns limiters _and_ gate from one reload. Using `limitersWithBudget` in a gate test would hand the gate a property name pointing at a limiter no one is actually spending.
- **`answerFor` imports inside the function body** on purpose — a top-level `import` would bind the handler once and go stale after `resetModules()`.
- The real-route test (`is mounted on the real login route`) is intentionally minimal: it only checks for the presence of `ratelimit` response headers, not the full auth flow.
- The 500-handler tests are deliberately built with _trivial_ Express apps rather than the application's actual error middleware chain, isolating `handleUncaughtError` as the unit under test.
