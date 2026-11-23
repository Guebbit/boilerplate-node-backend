---
source: src/infrastructure/runtime/config.ts
source_sha256: 0b13a5fcb6dce5f712c3839963a87f671b1b35d18dec971e8ed83621c7780557
context_sha256: cde99fe97dd22e1494a3036bd0ee51cfbca0a9992329a282615c9c8488f56312
generated_at: 2026-11-22T03:05:51.168582+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/config.ts

## Purpose
Declares the process's own configuration: which environment it runs in, how it names and logs itself, where it listens, where its database is, and its tracing endpoint. It also defines the single "is this a relaxed (non-deployment) environment?" check that safety behaviours key off.

## Key elements
- `WORKER_ROLES` / `WorkerRole` — `'standard' | 'heavy'`; the value of `NODE_WORKER_ROLE`. `standard` takes light and external jobs, `heavy` takes heavy ones (see `src/infrastructure/adapters/job-kinds.ts`).
- `PERSONAL_FIELD_MODES` — `'hash' | 'redact' | 'plain'`; how personal fields appear in log lines.
- `nodeEnvironmentConfig` — `NODE_ENV` as a verbatim text field (no trimming, so a stray space stays a typo and stays strict).
- `loggingConfig` — `NODE_SERVICE_NAME` (default `api`), `NODE_LOG_LEVEL` (winston levels), `NODE_LOG_PERSONAL_FIELDS` (default `hash`).
- `serverConfig` — `NODE_PORT` (3000), `NODE_WORKER_PORT` (3010), `NODE_WORKER_ROLE` (`standard`), `NODE_HOST`, `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS` (15000), `NODE_SHUTDOWN_DELAY_MS` (0).
- `databaseConfig` — MongoDB: `NODE_DB_URI`, `NODE_DB_PASSWORD` (sensitive), host (`127.0.0.1`), port (27017), name (`boilerplate-node-backend`), `NODE_MONGO_MAX_TIME_MS` (5000).
- `stockConfig` — `NODE_LOW_STOCK_THRESHOLD` (default 5), the shared restock mark for `inventory`'s stock board.
- `tracingConfig` — OTLP endpoints, `NODE_OTEL_EXPORTER_OTLP_HEADERS` (sensitive, may be mounted as a `_FILE` secret), and `NODE_TRUSTED_INGRESS` flag (default `false`).
- `nodeEnvironment()` — raw `NODE_ENV`, or `undefined` when unset.
- `isTestEnvironment()` — true when `NODE_ENV === 'test'`; keeps suites from opening sockets or installing signal handlers.
- `isRelaxedEnvironment()` — true only when `NODE_ENV` is exactly `development` or `test`, via `isRelaxedIn`.

## Relationships
- Built on `src/infrastructure/config/define.ts` (`defineConfig`, `isRelaxedIn`) and `src/infrastructure/config/fields.ts` (`choice`, `flag`, `int`, `text`).
- Documents that `src/infrastructure/adapters/logger.ts` reads this file, and that `src/infrastructure/adapters/job-kinds.ts` defines which jobs map to each worker role.
- The other neighbors (`src/app.ts`, `src/app/config.ts`, `src/app/worker-process.ts`, `src/app/workers.ts`, `src/app/error-handling.ts`, `src/app/request-context.ts`, `src/app/development-doubles.ts`, `src/infrastructure/adapters/queue.ts`, `src/infrastructure/adapters/job-drain.ts`, `src/infrastructure/http/middlewares/cache.ts`, `scenarios/apply.ts`) are related through the dependency graph. They are likely consumers of these settings, but the file itself doesn't show how they use them.

## Notes
- Uses relative imports only: `src/infrastructure/adapters/logger.ts` is on jest's `globalSetup` import chain, where the `@infrastructure` alias does not resolve.
- `isRelaxedEnvironment` fails closed: an unset, `staging`, or mistyped `NODE_ENV` gets the strict behaviour. Protections it gates include `Secure` cookies, the seeder's refusal, production-only secrets, and keeping stack traces out of logs.
