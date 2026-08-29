# src/infrastructure/adapters/logger.ts

## Purpose

Provides the application's structured logging layer built on Winston. It exposes a redaction-aware JSON logger (`logger`) for general use and a fixed-format audit logger (`auditLogger`) for compliance events, ensuring sensitive fields are stripped from every record before output.

## Key elements

- **`SENSITIVE_FIELDS`** — `Set<string>` of lowercase field names (passwords, tokens, keys, SSN, card data, etc.) that are always redacted. Exported for exhaustive per-entry unit testing.
- **`redactSensitiveFields(input)`** — Recursively walks objects/arrays and replaces any key matching `SENSITIVE_FIELDS` with the literal `[REDACTED]`. Returns copies; never mutates the input. Exported for unit testing.
- **`serializeError(error)`** — Converts an `Error` (or any thrown value) into a plain object with `name`/`message`/`stack`. Stack is omitted in production to avoid leaking filesystem paths.
- **`redactFormat`** — Winston format *factory* that serializes embedded `Error` values, then runs `redactSensitiveFields` over all caller-supplied metadata. Must be invoked (`redactFormat()`) to produce a format instance.
- **`resolveLogLevel()`** — Returns `NODE_LOG_LEVEL` if set, otherwise `info` in production and `debug` everywhere else.
- **`resolveConsoleFormat()`** — Returns `prettyFormat` (ANSI-coloured, single-line) when stdout is a TTY *and* not production; otherwise `baseFormat` (timestamp → redact → JSON). Chosen by TTY status, not `NODE_ENV`, to keep piped/container output parseable.
- **`logger`** — The primary app logger. Single `Console` transport on stdout. `defaultMeta.service` set from `NODE_SERVICE_NAME` (default `'api'`). Intended for container log-collection (Loki, CloudWatch, Datadog).
- **`auditLogger`** — Fixed `info` level, always JSON, adds `log_type: 'audit'` to `defaultMeta`. Cannot be silenced or reformatted by environment config. Fed by the audit/observability layer.

## Relationships

- **Consumers (all graph neighbors listed above)** — `src/app.ts`, `src/app/demo.ts`, `src/app/error-handling.ts`, `src/app/workers.ts`, `src/cluster.ts`, the other adapters (`cache`, `email.worker`, `filesystem`, `mailer`, `pdf.worker`, `queue`, `storage`), and the `db/` scripts (`cache-clear`, `demo/index`, `run-script`) import `logger` (and in some cases `auditLogger`) to emit structured log records. This file is the single logging entry point for all of them.

## Notes

- **Redaction is key-based, not value-based.** A secret nested under an innocuous key name (e.g. `data.user.pass`) will only be caught if the key itself is in `SENSITIVE_FIELDS`. Adding a new sensitive field requires updating the set *and* its test.
- **`redactFormat` is a factory.** Forgetting the trailing `()` when composing formats will silently pass the factory function where a format instance is expected.
- **Console transport only.** No file transports are configured; the platform (container runtime / log collector) owns rotation and storage. Adding a file transport inside the container will bloat the image layer.
- **`auditLogger` intentionally ignores `NODE_LOG_LEVEL` and TTY detection.** Its shape is a compliance contract—changing its format or level is a policy change, not a config tweak.
- **`resolveConsoleFormat` uses `process.stdout.isTTY`**, so `npm test` (piped) and `docker logs` both get JSON even in development, which is correct but may surprise anyone grepping dev logs for pretty output.
