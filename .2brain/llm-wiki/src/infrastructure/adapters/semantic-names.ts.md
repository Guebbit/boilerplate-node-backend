---
source: src/infrastructure/adapters/semantic-names.ts
sha256: 113c24077c8323c42d1c82320981450309e7572706564c2eff3764edade0e29d
generated_at: 2026-11-08T03:23:38.149098+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/semantic-names.ts

## Purpose

Transforms the camelCase field names used in code (`actorUserId`, `statusCode`) into OpenTelemetry semantic-convention names (`user.id`, `http.response.status_code`) on structured log records before they reach Loki or a SIEM. This lets dashboards and alerts written against the OTel spec work without modification.

## Key elements

- **`SEMANTIC_LOG_NAMES`** (exported, readonly) — The field-name mapping table (code name → log-line name). Sourced from `./semantic-log-names.generated`, which is generated from `shared/rules/semantic-log-names.yaml`.
- **`toSemanticNames(record)`** (exported) — Returns a new record with every top-level key renamed via `SEMANTIC_LOG_NAMES`. Special-cases two keys:
  - `error` → decomposed into `exception.*` attributes (type, message, stacktrace, cause, details).
  - `actorRole` → `user.roles` wrapped in a single-element array (the convention expects a list).
- **`exceptionAttributes(error)`** (private) — Maps a single error value to the `exception.*` attribute set. Non-plain-object values become `{ 'exception.message': String(value) }`.
- **`LogRecord`** (private type) — `Record<string, unknown>`, the shape of a log record before or after the rename.

## Relationships

- **`src/infrastructure/object-guards.ts`** — Imports `isPlainObject`, used to distinguish a structured error object from a bare string/number when building `exception.*` attributes.
- **`src/infrastructure/adapters/logger.ts`** — Sits on jest's `globalSetup` import chain; this is why this file is restricted to relative imports only (no barrel or absolute paths).
- **`tests/unit/infrastructure/adapters/semantic-names.test.ts`** — Unit tests exercising `toSemanticNames` and the exception-mapping logic.

## Notes

- **Top-level only.** Nested objects (e.g. `metadata`, fields inside `error.cause`) are passed through untouched; renaming is the call site's responsibility.
- **Collision guard.** If a key's semantic target is already present in the record, the original key is kept as-is rather than overwriting the caller's explicit value.
- **`trace_id` / `span_id`** are intentionally not dotted: the OTel Logs Data Model places trace context at the record top level, and `@opentelemetry/instrumentation-winston` writes exactly those keys. Grafana's Loki→Tempo link depends on the underscored names.
- **Custom (non-OTel) fields** are namespaced under `app.*` per the spec's guidance that producers must not squat on standard attribute names.
