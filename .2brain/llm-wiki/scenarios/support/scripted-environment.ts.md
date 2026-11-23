---
source: scenarios/support/scripted-environment.ts
source_sha256: 986dbc1f8138f60d3ad94f9dea1dc0643b496d7e49e687dcf0488269876fae4c
context_sha256: 60d466b98f23868a6f63b506aaa19d541e2f1e95173837eacf161b779666b06e
generated_at: 2026-11-22T01:49:12.426546+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/scripted-environment.ts

## Purpose
Establishes the environment a seed script runs under, as a side effect of being imported. It exists as a separate module because ES imports are hoisted: statements in `apply.ts` would run after every static import had loaded, but the rate-limit middleware builds its limiters at import time from the environment as it is then. Imported right after dotenv and before anything else, this module runs first, so everything that reads the environment while loading sees the overrides.

## Key elements
- `deploymentRateLimitRedisUrl` (exported) – the deployment's `limits` Redis URL from `limitsRedisUrl()`, captured before the overrides blank it. This lets `--reset` still clear counters that a reseed leaves behind.
- `installEnvironment(SCRIPTED_RATE_LIMITS)` – overrides `.env` with raised budgets, and switches the limiter to in-memory counting for this process.
- `installEnvironment({ NODE_MAIL_TRANSPORT: 'log' })` – overrides `.env` so order confirmation mails are rendered (a broken template still fails) but no socket is opened.
- `installEnvironment({ NODE_RABBITMQ_ENABLED: '0' })` – disables the broker so email jobs run inline through the `log` transport rather than being published to a live backend's consumer.
- `installEnvironment(...)` with `DEMO_BANK_TRANSFER` – applied only for keys where `currentEnvironment()` is `undefined`, so a deployment's own beneficiary is kept.

## Relationships
- `@infrastructure/config/store`: supplies `installEnvironment` and `currentEnvironment`, used to apply and inspect the overrides.
- `@infrastructure/adapters/limits-redis`: supplies `limitsRedisUrl`, read before the limiter override is installed.
- `@scenarios/rate-limits`: supplies `SCRIPTED_RATE_LIMITS` and `DEMO_BANK_TRANSFER`.
- `scenarios/apply.ts`: the importer. The comments say `apply.ts` refuses production, which is why the overrides are considered safe. They also say the module must be imported right after dotenv and before `@scenarios/index`.

## Notes
- Import order matters. Moving this import later would let the rate-limit middleware build its limiters from the unmodified environment.
- Budgets, mail transport and broker are forced and override `.env`. Only the bank-transfer defaults are fill-if-unset.
- `deploymentRateLimitRedisUrl` must be evaluated before `installEnvironment(SCRIPTED_RATE_LIMITS)`. Its declaration order in the file guarantees this.
