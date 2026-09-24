---
source: scenarios/rate-limits.ts
sha256: 46ddaee93efe7ea311384e739c99e49f96f7478ccc0628a606b725f7ea12ca54
generated_at: 2026-09-23T17:19:27.713267+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Module that supplies the full set of rate-limit environment variables a scripted caller (e2e test runner or shop-history seeder) needs, so that hundreds of same-origin requests in quick succession are not throttled by the app's per-rung anti-automation budgets. It also forces counters to stay in-process rather than in shared Redis, and provides fictional bank-transfer values for the demo checkout flow.

## Key elements

- **`RAISED_RATE_LIMIT_ENV_VAR_NAMES`** (exported) — exhaustive list of every rate-limit env var a scripted driver will trip. `NODE_MFA_CHALLENGE_MAX` is deliberately excluded (it bounds challenge lifetime, not request volume).
- **`SCRIPTED_RATE_LIMITS`** (exported) — `Readonly<Record<string, string>>` mapping every var in the list to `'100000'`, plus `NODE_RATE_LIMIT_REDIS_ENABLED: '0'`.
- **`DEMO_BANK_TRANSFER`** (exported) — two env vars (`NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN`) with fictional values so `GET /payments/methods` can offer bank transfer in the demo shop scenario.
- **`SCRIPTED_MAX`** (module-local) — the single value (`'100000'`) applied to every raised budget.
- **`PRIVATE_COUNTERS`** (module-local) — `{ NODE_RATE_LIMIT_REDIS_ENABLED: '0' }`; ensures counters live in memory, not in the deployment's Redis.

## Relationships

- **`scenarios/run-server.ts`** — consumes `SCRIPTED_RATE_LIMITS` as its process env. One long-lived process serves every e2e spec, so counters accumulate across all specs within the 60 s window; the 100 000 ceiling keeps it from self-throttling.
- **`scenarios/apply.ts`** — consumes `SCRIPTED_RATE_LIMITS` as its process env. Fires several hundred requests (including a dozen `checkoutAndPay` calls and a declined-card retry) before any spec starts; also applies `DEMO_BANK_TRANSFER` so the `order.awaitingTransfer` guarantee is satisfiable.
- **`tests/cross-cutting/rate-limit-budgets.test.ts`** — asserts that `RAISED_RATE_LIMIT_ENV_VARS` remains the complete set of rate-limit vars in the app; adding a new budget without updating this list breaks that test.

## Notes

- The 100 000 ceiling is far above the suite's own 1 000 threshold because `run-server.ts` is a single process whose counters never reset between specs.
- `PRIVATE_COUNTERS` is merged into `SCRIPTED_RATE_LIMITS` unconditionally; callers that *do* want shared Redis must override that key after applying this record.
- `DEMO_BANK_TRANSFER` values are explicitly fictional. Callers apply these vars only where the key is unset, so a real deployment's `.env` values are preserved.
- Both consumers refuse production (`run-server.ts` binds loopback with throwaway secrets; `apply.ts` gates on `NODE_ENV !== 'production'`). This module is never intended for a live deployment.
