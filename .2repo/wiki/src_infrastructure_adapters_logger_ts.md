# src/infrastructure/adapters/logger.ts

## Purpose

Provides the application's single structured-logging pipeline built on Winston. It defines two distinct data-protection policies (credential redaction vs. personal-data hashing), serialises errors into log-safe shapes, and exposes a pre-configured `logger` instance that every other module imports for emitting structured log records to stdout.

## Key elements

- **`SENSITIVE_FIELDS`** (Set) — Field names (lowercased) whose values are always replaced with `[REDACTED]`. Exported so unit tests can assert each entry individually.
- **`PERSONAL_FIELDS`** (Set) — PII field names (email, ip, phone, etc.) treated under a *separate* policy: hashed, redacted, or left plain depending on `NODE_LOG_PERSONAL_FIELDS`.
- **`redactSensitiveFields(input)`** — Recursively walks an object/array, replacing sensitive keys with `[REDACTED]` and applying the personal-field mode to PII keys. Returns a **copy**; never mutates the input. Exported for unit testing.
- **`serializeError(error)`** — Converts a thrown `Error` (or any value) into a plain object suitable for `JSON.stringify`. Omit `stack` in production. Exported for unit testing.
- **`redactFormat`** — A Winston format *factory* (call `redactFormat()` to get the instance). Serialises errors then runs the redaction walk over caller-supplied metadata before a transport sees the record.
- **`resolveLogLevel()`** — Returns the effective Winston level: `NODE_LOG_LEVEL` if set, else `debug` / `info` by `NODE_ENV`. Exported for test assertions.
- **`resolveConsoleFormat()`** — Picks between a pretty ANSI terminal format (interactive TTY, non-production) and a single-line JSON format (pipes, containers, production). Exported for test assertions.
- **`logger`** — The main Winston `Logger` instance. Stdout-only transport (no file writes), ISO-8601 timestamps, `service` in `defaultMeta`, and the format pipeline above. This is what other modules import.

## Relationships

- **All listed graph neighbors** (`src/app.ts`, `src/app/error-handling.ts`, `src/app/security.ts`, `src/app/workers.ts`, `src/app/demo.ts`, `src/cluster.ts`, `src/infrastructure/adapters/cache.ts`, `src/infrastructure/adapters/demo-outbox.ts`, `src/infrastructure/adapters/email.worker.ts`, `src/infrastructure/adapters/filesystem.ts`, `db/cache-clear.ts`, `db/demo/index.ts`, `db/run-script.ts`, `scripts/reap-inactive-accounts.ts`, `scripts/reap-quarantine.ts`) consume the `logger` export (and potentially `redactSensitiveFields` / `serializeError` for direct use or testing). This file does not import any of them.
- **`tests/unit/infrastructure/adapters/logger.test.ts`** (referenced in comments) asserts `SENSITIVE_FIELDS`, `redactSensitiveFields`, `redactFormat`, `resolveLogLevel`, and `resolveConsoleFormat` against an environment matrix.

## Notes

- **Two separate redaction policies on purpose.** `SENSITIVE_FIELDS` → always `[REDACTED]`. `PERSONAL_FIELDS` → hash/redact/plain via `NODE_LOG_PERSONAL_FIELDS`. They must not be merged; a credential must never be "hashed-and-kept."
- **`redactFormat` is a factory.** You must call `redactFormat()` to obtain the format instance. Forgetting the call means the transform never runs and nothing is redacted in production.
- **`redactSensitiveFields` returns copies.** It is safe to pass live request/domain objects; the original is not mutated.
- **Default personal-field mode is `hash`**, not `plain`. The shipped default is the safer one because most deployments never revisit config.
- **Console is stdout-only** by design: containers own log rotation/collection, so no file transports are configured.
- **Format selection uses `process.stdout.isTTY`**, not `NODE_ENV` alone. A TTY gets pretty ANSI output; a pipe or container log file gets JSON regardless of environment (except production is always JSON).
- **Stack traces are stripped in production** (`NODE_ENV === 'production'`) to avoid leaking absolute paths and dependency internals into aggregated logs.
