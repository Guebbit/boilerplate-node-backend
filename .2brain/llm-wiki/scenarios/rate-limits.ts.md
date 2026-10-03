---
source: scenarios/rate-limits.ts
sha256: 104bf3016d9125214ba9ba5f0d11727af916ff83fc29ee624b4104362f01b815
generated_at: 2026-10-01T12:23:10.780904+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Defines the set of rate-limit environment overrides that scripted callers (the e2e test server and the `apply` seeder) need so that hundreds of rapid, single-address requests don't trip the anti-automation ladder. Without these overrides, a rate-limit refusal on one request cascades into opaque failures (e.g. "login is broken") on subsequent ones. The file is explicitly never applied in a real deployment.

## Key elements

- **`SCRIPTED_MAX`** (`'100000'`) — the value every budget is raised to; deliberately far above the test suites' own `1000` because `run-server.ts` accumulates counters across all specs in one 60-second window.
- **`PRIVATE_COUNTERS`** — sets `NODE_RATE_LIMIT_REDIS_ENABLED: '0'` to force in-memory counting, preventing the seeder from spending or inheriting real visitors' Redis-backed allowances.
- **`RAISED_RATE_LIMIT_ENV_VARS`** — the full list of rate-limit env vars a scripted driver can trip. Deliberately excludes `NODE_MFA_CHALLENGE_MAX` (sized to challenge lifetime, not request volume).
- **`SCRIPTED_RATE_LIMITS`** — the combined `Record<string, string>` of every var in `RAISED_RATE_LIMIT_ENV_VARS` set to `SCRIPTED_MAX`, plus `PRIVATE_COUNTERS`. This is the object callers spread into their process env.
- **`DEMO_BANK_TRANSFER`** — fictional beneficiary/IBAN so `GET /payments/methods` offers the bank-transfer option the shop-history scenario requires. Real deployments that set their own values in `.env` are unaffected (callers only fill unset vars).

## Relationships

- **`scenarios/run-server.ts`** — applies `SCRIPTED_RATE_LIMITS` to its loopback server process. Its single-process, multi-spec design is the reason `SCRIPTED_MAX` is 100000 rather than 1000.
- **`scenarios/apply.ts`** — applies the same record before driving hundreds of requests to build the shop's history. Gates itself with `isRelaxedEnvironment()` first.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — asserts that `RAISED_RATE_LIMIT_ENV_VARS` remains a complete list of every budget in the app; adding a new rate-limit var without updating this file will fail that test.

## Notes

- Two payment-confirm/decline vars (`NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX`, `NODE_PAYMENT_DECLINE_RATE_LIMIT_MAX`) are included specifically because `shop-history.ts` runs a dozen `checkoutAndPay` cycles plus one declined card in a single process — well past the human-sized 5/hour confirm budget.
- `PRIVATE_COUNTERS` is a separate object (not folded into `RAISED_RATE_LIMIT_ENV_VARS`) because the "disable Redis" toggle is a different kind of setting; the kill-switch semantics are documented in `rate-limit-store.ts`.
- The file exports a `Readonly` record, not a mutable one — callers should not mutate `SCRIPTED_RATE_LIMITS` in place.
