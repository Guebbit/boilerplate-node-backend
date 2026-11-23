---
source: scripts/db/bootstrap-access.ts
source_sha256: bd4b7655476393e338ee6490e7b921da8a0c099019cededb312482ff2b065a57
context_sha256: fffa45f639355b957d8b03eebee8f3c0c86d8535010c2265be294a839f485ad1
generated_at: 2026-11-22T02:00:58.066407+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/db/bootstrap-access.ts

## Purpose
A deploy-time setup script (`npm run access:bootstrap`) that gives a fresh production database its shop by upserting a tenant keyed on the fixed `DEPLOYMENT_TENANT_ID`. Because it is an upsert, running it against an already-seeded database changes nothing, so it is safe in production. It should run before `app`/`cron` start (see the `setup` service in `compose.production.yaml`).

## Key elements
- `main` — connects via `startJob()`, calls `accessService.bootstrapAccess('Shop')`, then logs `Access model bootstrapped: shop "<id>".` for the operator's records.
- Top-level `void runScript(undefined, main, stopDatabase)` — runs `main` through the shared script wrapper, with `stopDatabase` as the cleanup step.

## Relationships
- `src/infrastructure/config/dotenv.ts` — imported first for its side effect of loading environment config.
- `src/infrastructure/runtime/mongoose-boot.ts` — imported for side effects before any model loads, since Mongoose defaults are read at schema build time.
- `src/infrastructure/runtime/database.ts` — supplies `startJob` (connect) and `stopDatabase` (teardown).
- `src/modules/access/index.ts` — supplies `accessService`, whose `bootstrapAccess` performs the upsert.
- `src/infrastructure/adapters/logger.ts` — supplies `logger`, used to report the resulting shop id.
- `scripts/run-script.ts` — supplies `runScript`, which runs the script and wraps it so failures don't reject.

## Notes
- Import order matters: `dotenv` and `mongoose-boot` must come before any model-loading imports.
- No `NODE_ENV` guard, unlike `scenario:apply` (`scenarios/apply.ts`), which refuses to run under production because it is not idempotent.
- Preset roles need no bootstrap: they are read from `shared/rules/authorization-roles.yaml` at import and never stored.
- The first argument to `runScript` is `undefined` because this is not a `docker/crontab` job.
- The `no-floating-promises` ESLint rule is disabled for the `runScript` call because `runScript` never rejects (failure is reported via `process.exitCode`).
