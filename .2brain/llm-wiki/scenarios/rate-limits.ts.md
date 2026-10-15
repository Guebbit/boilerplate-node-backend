---
source: scenarios/rate-limits.ts
sha256: cc4af545df4d026188932cec7dc721a9e02501a5b38d4113d131eed811af39fb
generated_at: 2026-10-15T09:33:51.174427+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Provides elevated rate-limit environment variables and in-memory counter settings for scripted drivers (the e2e test server and the apply seeder). Without these, a burst of hundreds of requests from a single address trips every rung of the anti-automation ladder, and the resulting 429 lands on an unrelated next request, masquerading as a functional bug.

## Key elements

- **`SCRIPTED_MAX`** — constant (`'100000'`); the value every budget is raised to. Far above the suites' own `1000` because a single process accumulates counters across all specs within a 60-second window.
- **`PRIVATE_COUNTERS`** — sets `NODE_RATE_LIMIT_REDIS_URL` to `''` (empty string, not `undefined`) so rate-limit counters live in process memory only. The blank value deliberately beats a `.env` limits URL that an unset variable could not override.
- **`RAISED_RATE_LIMIT_ENV_VARS`** *(export)* — the exhaustive list of every rate-limit env var a scripted driver can trip. `tests/cross-cutting/rate-limit-budgets.test.ts` asserts this list stays complete. Excludes `NODE_MFA_CHALLENGE_MAX` (sized to challenge lifetime, not request volume).
- **`SCRIPTED_RATE_LIMITS`** *(export)* — `Readonly<Record<string, string>>`; all vars in `RAISED_RATE_LIMIT_ENV_VARS` mapped to `SCRIPTED_MAX`, spread with `PRIVATE_COUNTERS`.
- **`DEMO_BANK_TRANSFER`** *(export)* — fictional beneficiary/IBAN so `GET /payments/methods` offers bank transfer and the shop scenario's `order.awaitingTransfer` guarantee holds. Real deployments keep their own `.env` values because callers apply these only where nothing is set.

## Relationships

- **`scenarios/run-server.ts`** — consumer. Serves the paired e2e suite end-to-end from one process; applies `SCRIPTED_RATE_LIMITS` so accumulated counters across all specs don't 429.
- **`scenarios/apply.ts`** — consumer. Drives several hundred requests to build shop history; applies the same limits. Its first gate is `isRelaxedEnvironment()`, confirming it never runs against a real deployment.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — asserts that `RAISED_RATE_LIMIT_ENV_VARS` covers every rate-limit budget in the application, keeping the list exhaustive.

## Notes

- The four `NODE_PAYMENT_*` entries (confirm, decline, decline-block, intent) exist specifically because `shop-history.ts` runs a dozen `checkoutAndPay` cycles plus a declined-card case in one process; without them the flow throws on its own retry every run.
- `NODE_RATE_LIMIT_REDIS_URL: ''` uses an empty string rather than omitting the key — a blank value set before `dotenv` runs overrides the `.env` file's URL, whereas an unset variable would not.
- Never applied to a real deployment: `run-server.ts` binds loopback with throwaway secrets, and `apply.ts` gates on `isRelaxedEnvironment()`.
