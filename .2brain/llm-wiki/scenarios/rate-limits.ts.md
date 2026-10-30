---
source: scenarios/rate-limits.ts
sha256: 9e152716e6d102ce7ccfca9ba44bd2e09466ecc3d46ba5fd6b3eb70b7ba19187
generated_at: 2026-10-29T01:24:54.256408+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Defines the rate-limit budget overrides needed when a **scripted driver** (not a human) hammers the API from a single address. Without these, the app's multi-rung anti-automation ladder 429s the script mid-flight, and the failure surfaces on an unrelated request. The file exists so the two scripted callers can apply one consistent set of raised limits and in-memory counters without duplicating the list.

## Key elements

- **`SCRIPTED_MAX`** (`'100000'`) — the value every budget is raised to. Chosen well above the suites' own `1000` because `run-server.ts` accumulates counters across all specs in one 60-second window.
- **`PRIVATE_COUNTERS`** — sets `NODE_RATE_LIMIT_REDIS_URL` to `''` (blank, not absent) so counters live in-process memory. Blank intentionally beats a `.env` file's own limits URL.
- **`RAISED_RATE_LIMIT_ENV_VARS`** (exported) — the complete list of every rate-limit env var the app exposes, excluding `NODE_MFA_CHALLENGE_MAX` (lifetime-based, not volume-based).
- **`SCRIPTED_RATE_LIMITS`** (exported) — a `Readonly<Record<string, string>>` combining all raised vars mapped to `SCRIPTED_MAX` plus `PRIVATE_COUNTERS`. This is the object the callers spread into their environment.
- **`DEMO_BANK_TRANSFER`** (exported) — fictional beneficiary/IBAN/BIC so `GET /payments/methods` can offer bank transfer in the `shop` scenario. Applied only where those vars are unset, so a real deployment's own values survive.

## Relationships

- **`scenarios/run-server.ts`** — primary consumer. One long-lived process serves the paired e2e suite; it applies `SCRIPTED_RATE_LIMITS` at startup so counters never hit shared Redis.
- **`scenarios/apply.ts`** — secondary consumer. Drives several hundred requests to build shop history before specs run. Guards against deployment via `isRelaxedEnvironment()`.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — asserts that `RAISED_RATE_LIMIT_ENV_VARS` remains exhaustive (i.e., no new budget is added to the app without being listed here).

## Notes

- **Deployment guard:** Both callers refuse to run in a deployment environment; this file is *never* meant for production.
- **Blank vs. absent Redis URL:** `NODE_RATE_LIMIT_REDIS_URL: ''` must be set before `dotenv` loads; an *unset* variable would lose to a `.env` entry, while a blank string wins and forces in-memory counters.
- **`NODE_MFA_CHALLENGE_MAX` intentionally excluded:** It is sized to a live challenge's lifetime, not request volume, and no scripted driver holds a challenge open long enough to trip it.
- **Payment-decline budgets** (`NODE_PAYMENT_DECLINE_*`, `NODE_PAYMENT_CONFIRM_RATE_LIMIT_MAX`) exist because `shop-history.ts` runs a dozen `checkoutAndPay` calls plus one declined card in a single process—well past the human 5-per-hour confirm budget.
- **`DEMO_BANK_TRANSFER` is fictional** (Italian IBAN, placeholder BIC). A deployment that sets its own bank-transfer vars in `.env` is unaffected because both callers only fill in unset variables.
