# src/infrastructure/adapters/logger.ts

## Purpose

Central structured-logging setup built on Winston. It defines the redaction pipeline, format selection (JSON vs. human-readable), log-level resolution, and exposes two ready-to-use logger instances (`logger` and `auditLogger`) that every other module in the codebase imports for emitting log records.

## Key elements

- **`SENSITIVE_FIELDS`** — `Set` of lowercase field names (password, token, ssn, etc.) that must never appear in log output. Exported for exhaustive unit-test assertion.
- **`redactSensitiveFields(input)`** — Recursively walks objects/arrays and replaces any key in `SENSITIVE_FIELDS` with `[REDACTED]`. Returns copies; never mutates the input.
- **`serializeError(error)`** — Converts a thrown `Error` (or arbitrary value) into a plain serializable object. Omits `stack` in production to prevent path/internals leakage.
- **`redactFormat`** — Winston format *factory* (must be called as `redactFormat()`). Serializes `rest.error` then applies `redactSensitiveFields` to all caller-supplied metadata before returning the record.
- **`resolveLogLevel()`** — Returns `NODE_LOG_LEVEL` if set; otherwise `info` in production, `debug` locally.
- **`baseFormat`** (internal) — Pipeline: ISO-8601 timestamp → redact → `json()`. One-line-per-record output for log collectors.
- **`prettyFormat`** (internal) — Same pipeline up to redaction, then `colorize` + a `printf` layout for terminal reading.
- **`resolveConsoleFormat()`** — Chooses `prettyFormat` when stdout is a TTY and env is non-production; `baseFormat` (JSON) in all other cases including production.
- **`logger`** — Primary application logger. Console transport to stdout only. Default meta includes `service` (from `NODE_SERVICE_NAME`, default `"api"`).
- **`auditLogger`** — Dedicated compliance/audit stream. Hard-coded `info` level and JSON format regardless of environment. Adds `log_type: 'audit'` to every record. Fed by `@infrastructure/observability/audit`.

## Relationships

- All other modules in the dependency graph (`src/app.ts`, `src/app/error-handling.ts`, `src/app/workers.ts`, `src/app/demo.ts`, `src/cluster.ts`, `src/infrastructure/adapters/cache.ts`, `src/infrastructure/adapters/email.worker.ts`, `src/infrastructure/adapters/filesystem.ts`, `src/infrastructure/adapters/image.worker.ts`, `src/infrastructure/adapters/mailer.ts`, `db/cache-clear.ts`, `db/demo/index.ts`, `db/run-script.ts`, `scripts/backfill-image-thumbnails.ts`, `scripts/reap-quarantine.ts`) import `logger` (and where applicable `auditLogger`) from this module to emit log records.
- The file itself depends only on the `winston` package.

## Notes

- `redactFormat` is a **factory** (a `winston.format(fn)` wrapper). It must be invoked (`redactFormat()`) before being placed in a `format.combine(...)` chain — passing the bare function will silently skip redaction.
- `resolveConsoleFormat` keys off `process.stdout.isTTY`, **not** `NODE_ENV` alone. A non-TTY stdout (pipe, container log file) always yields JSON, even in dev. This is deliberate: log collectors (Loki, CloudWatch, Datadog) require stable one-line JSON.
- `redactSensitiveFields` is case-insensitive via lowercase comparison but does **not** redact values that merely contain a sensitive string (e.g. a message body) — only keys that match.
- The `auditLogger` level is intentionally not env-driven; `NODE_LOG_LEVEL` cannot silence or elevate it.
- Only the `Console` transport is registered (stdout). File transports are deliberately absent: container platforms own log collection and rotation.
