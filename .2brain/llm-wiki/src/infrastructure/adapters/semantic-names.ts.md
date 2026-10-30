---
source: src/infrastructure/adapters/semantic-names.ts
sha256: 113c24077c8323c42d1c82320981450309e7572706564c2eff3764edade0e29d
generated_at: 2026-10-29T01:57:23.419629+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/semantic-names.ts

## Purpose

Renames camelCase field names in structured log records to their OpenTelemetry semantic-convention equivalents (e.g. `actorUserId` → `user.id`, `statusCode` → `http.response.status_code`) before the line is written to Loki, a SIEM, or any other collector. This lets dashboards and alerts authored against the standard work without modification.

## Key elements

- **`SEMANTIC_LOG_NAMES`** — `Readonly<Record<string, string>>` lookup table mapping code field names to log-line names. Sourced from the generated data in `semantic-log-names.generated.ts` (upstream: `shared/rules/semantic-log-names.yaml`).
- **`toSemanticNames(record)`** — Returns a new record with top-level keys renamed per the table. Special-cases:
  - `error` → expanded into `exception.*` attributes via the internal `exceptionAttributes` helper.
  - `actorRole` → `user.roles` (wrapped in a single-element array, matching the OTel convention).
  - A key is left unchanged if its semantic target name is already present in the record (caller's explicit value wins).
- **`exceptionAttributes(error)`** (private) — Decomposes a plain-object error into `exception.type`, `exception.message`, `exception.stacktrace`, `exception.cause`, and `exception.details` (any remaining own properties). Non-object values become a bare `exception.message` string.
- **`LogRecord`** (private type) — `Record<string, unknown>`, the shape of a log line before or after rename.

## Relationships

- **`semantic-log-names.generated.ts`** — Provides `semanticLogNameData`, the actual name-pairing table consumed by `SEMANTIC_LOG_NAMES`. Regenerated from `shared/rules/semantic-log-names.yaml`.
- **`object-guards.ts`** — Supplies `isPlainObject`, used by `exceptionAttributes` to distinguish structured error objects from primitives.
- **`logger.ts`** — The consumer that calls `toSemanticNames` on each record before writing. The file's header notes that `logger.ts` sits on Jest's `globalSetup` import chain, which is why this file uses only relative imports (no barrel re-exports).
- **`tests/unit/infrastructure/adapters/semantic-names.test.ts`** — Unit tests covering the rename, error expansion, and collision behavior.

## Notes

- **Top-level only.** Nested objects (e.g. `metadata`, `error.cause`) keep their internal key names; only the record's own keys are remapped.
- **Collision rule.** If a caller has already set a target name (e.g. explicitly writing `user.id`), the mapped value for `actorUserId` is silently dropped rather than overwriting it.
- **`actorRole` is singular in code, plural in the log line.** The OTel `user.roles` attribute expects a list; the adapter wraps the single value in `[value]`.
- **`traceId` / `spanId`** are mapped to `trace_id` / `span_id` (snake_case, not dotted) to match the OTel Logs Data Model and `@opentelemetry/instrumentation-winston`, so Grafana's Loki→Tempo correlation link works.
