# docs/reference/src-infrastructure.md

## Purpose

Reference catalog for the `src/infrastructure/` directory — the domain-agnostic substrate tier. It lists every file across the five subdirectories (`runtime/`, `adapters/`, `http/`, `persistence/`, `observability/`), gives a one-line description of each, and links to deeper tool docs. Read it to find which file owns a given concern before opening the file itself.

## Key elements

- **`runtime/`** — boot & shutdown: `otel-sdk.ts` (must be imported first for auto-instrumentation), `environment.ts` (hard-env validation), `database.ts` (Mongo connect/retry/stop), `server-lifecycle.ts` (signal handlers, drain, reverse-order teardown), `managed-connection.ts` (shared lifecycle for Redis/RabbitMQ; resolves `undefined` instead of rejecting).
- **`adapters/`** — the outside world; every adapter **fails open**: `cache.ts` (Redis byte store), `queue.ts` (RabbitMQ/AMQP), `logger.ts` (Winston), `mailer.ts` + `email.worker.ts` (SMTP + queued email), `pdf.ts` + `pdf.worker.ts` (Puppeteer rendering), `storage.ts` / `image-store.ts` / `image-signatures.ts` / `filesystem.ts` (upload pipeline), `demo-outbox.ts` (demo-profile email sink).
- **`http/`** — request in, response out: `request.ts` (transport-agnostic input read), `schemas.ts` (scalar decode, no validation), `response.ts` (uniform envelope), `errors.ts` (status-carrying types + `databaseErrorInterpreter`), `uploads.ts` (multipart read side), and `middlewares/` (`security.ts`, `locale.ts`, `cache.ts`, `request-logger.ts`, `route-flag.ts`).
- **`persistence/`** and **`observability/`** — mentioned in the overview and diagram; detailed tables are in the full file (this excerpt is truncated before those sections complete).

## Relationships

No graph neighbors are recorded for this file. It is a pure documentation/reference page with no runtime dependencies.

## Notes

- **Import-order constraint:** `otel-sdk.ts` must be the very first import in `src/app.ts`; any reorder silently disables auto-instrumentation. The doc flags this explicitly.
- **ESLint boundary:** `eslint.config.ts` enforces that nothing under `src/infrastructure/` imports from domain modules. Violations are caught statically, not at runtime.
- **Fail-open vs. fail-closed:** Adapters (cache, queue) degrade to no-op/miss; `managed-connection.ts` resolves `undefined` rather than rejecting. Callers must handle the absence — the adapter will not throw.
- **`image-store.ts` is the sole port** for `imageUrl` → filesystem path translation. All other code must go through it; this is a deliberate single-audit-point rule.
- **`filesystem.ts` `moveFile`:** exists because `rename()` cannot cross a device boundary (staging vs. public dirs are on different filesystems).
- **`schemas.ts` intentionally does not validate** — it only decodes scalars; rejection with a user-facing message is the schema's job downstream.
