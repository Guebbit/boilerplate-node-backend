---
source: scenarios/rate-limits.ts
sha256: cd0546ab05b944e93042e37d1d3b816386ea4dd2c28ebc7bb753022142983bee
generated_at: 2026-11-14T17:16:12.862386+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose
Defines the rate-limit budget overrides and demo bank-transfer values that scripted callers (the e2e server and the shop-history seeder) need when driving the API from a single address at high volume. Without these, anti-automation rungs throttle the script and failures surface as unrelated errors (e.g. "login is broken"). The module is explicitly for local/test use only — both callers refuse to run in a deployment.

## Key elements
- **`SCRIPTED_RATE_LIMITS`** (exported) — A `Record<string, string>` mapping every rate-limit env var to `100000`, plus `NODE_RATE_LIMIT_REDIS_URL: ''` to force in-memory counting instead of the deployment's shared Redis.
- **`DEMO_BANK_TRANSFER`** (exported) — Fictional `NODE_BANK_TRANSFER_*` values so `GET /payments/methods` offers the bank-transfer option required by the `shop` scenario's `order.awaitingTransfer` guarantee.
- **`RAISED_RATE_LIMIT_ENV_VARS`** (internal) — The exhaustive list of budget vars that are raised. Deliberately excludes `NODE_MFA_CHALLENGE_MAX` (sized to a challenge's lifetime, not request volume).
- **`SCRIPTED_MAX`** (internal) — The value `'100000'` applied uniformly to every budget.
- **`PRIVATE_COUNTERS`** (internal) — Sets `NODE_RATE_LIMIT_REDIS_URL` to `''` so counters live in-process and do not spend a real visitor's Redis budget.

## Relationships
- **`scenarios/run-server.ts`** — Imports `SCRIPTED_RATE_LIMITS` to pre-populate the environment before it serves the paired e2e suite. Because a single process handles every spec within one 60-second window, the inflated budget prevents cross-spec counter accumulation from tripping limits.
- **`scenarios/apply.ts`** — Imports `SCRIPTED_RATE_LIMITS` before issuing several hundred requests to build shop history. Its first gate (`isRelaxedEnvironment()`) ensures it never applies in a real deployment.

## Notes
- A cross-cutting test (`tests/cross-cutting/rate-limit-budgets.test.ts`) asserts that `RAISED_RATE_LIMIT_ENV_VARS` stays in lockstep with every budget the app defines. Adding a new budget var elsewhere requires updating this list.
- The blank string for `NODE_RATE_LIMIT_REDIS_URL` is intentional: a blank value set *before* `dotenv` runs beats the `.env` file, whereas an unset variable would not.
- `DEMO_BANK_TRANSFER` values are only applied where the corresponding env var is unset, so a local developer who sets their own bank-transfer fields in `.env` keeps them.
- The four `NODE_PAYMENT_*` payment-related vars (confirm, decline, decline-block, intent) exist because `shop-history.ts` runs a dozen `checkoutAndPay` calls plus one declined card in a single process — far past the human-sized 5-per-hour confirm budget.
