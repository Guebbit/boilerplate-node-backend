---
source: scenarios/rate-limits.ts
sha256: f99f2fd2b26449c90159f420ff90392be20f4afb39dd328cb48a41a6a925e7ae
generated_at: 2026-11-08T02:31:24.815911+00:00
model: ollama:qwen3.8:27b
---

# scenarios/rate-limits.ts

## Purpose

Provides the environment-variable overrides that let scripted callers (e2e suite server, shop-history seeder) bypass the app's per-rung anti-automation rate limits. Without these, a single address firing hundreds of requests in seconds gets a 429 on an unrelated request, making failures look like broken functionality rather than exhausted allowance.

## Key elements

- **`SCRIPTED_MAX`** (`'100000'`) — the value every budget is raised to; high enough for `run-server.ts` to serve an entire e2e spec suite in one 60-second window.
- **`PRIVATE_COUNTERS`** — sets `NODE_RATE_LIMIT_REDIS_URL` to `''` so counters live in process memory instead of shared Redis. Prevents the seeder from spending (or inheriting) a real visitor's allowance.
- **`RAISED_RATE_LIMIT_ENV_VARS`** (exported) — exhaustive list of every rate-limit env var in the app (kept complete by `tests/cross-cutting/rate-limit-budgets.test.ts`). Excludes `NODE_MFA_CHALLENGE_MAX` (sized to challenge lifetime, not request volume).
- **`SCRIPTED_RATE_LIMITS`** (exported) — `Record<string, string>` mapping every var in `RAISED_RATE_LIMIT_ENV_VARS` to `SCRIPTED_MAX`, merged with `PRIVATE_COUNTERS`. Ready to spread into `process.env`.
- **`DEMO_BANK_TRANSFER`** (exported) — fictional beneficiary/IBAN/BIC values so the `shop` scenario's `awaitingTransfer` flow can exercise bank-transfer checkout without real credentials.

## Relationships

- **`scenarios/run-server.ts`** — imports `SCRIPTED_RATE_LIMITS` (and `DEMO_BANK_TRANSFER`) and spreads them into its loopback server's environment before the e2e suite runs. It is the primary consumer whose counters accumulate across every spec in a single process.
- **`scenarios/apply.ts`** — imports the same exports; its first gate is `isRelaxedEnvironment()`, and it drives several hundred requests to build shop history. It applies the limits only where the variable is not already set, so a deployment's own `.env` values win.

## Notes

- `PRIVATE_COUNTERS` uses `''` (empty string) rather than `undefined` deliberately: an empty value set before `dotenv` runs overrides the `.env` file's Redis URL, whereas an unset variable would not.
- `DEMO_BANK_TRANSFER` values are fictional and only apply where the variable is unset; a deployment that supplies its own IBAN/BIC in `.env` is unaffected.
- The list in `RAISED_RATE_LIMIT_ENV_VARS` is enforced to stay complete by a cross-cutting test (`tests/cross-cutting/rate-limit-budgets.test.ts`), so adding a new rate-limit rung elsewhere requires updating this array.
- Neither caller is intended for deployment: `run-server.ts` binds loopback with throwaway secrets, and `apply.ts` checks `isRelaxedEnvironment()` first.
