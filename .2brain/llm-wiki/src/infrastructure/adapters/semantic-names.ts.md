---
source: src/infrastructure/adapters/semantic-names.ts
sha256: 3205196bd71e4189b5ad276e28429c90118042079d492987c3dd57635ea5fcad
generated_at: 2026-10-14T07:49:14.528076+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/semantic-names.ts

## Purpose

Maps camelCase field names used in application log calls to their OpenTelemetry semantic-convention equivalents (or `app.*` names for fields with no spec standard), so that log lines shipped to Loki, SIEMs, or other collectors are queryable against the standard dashboards and alerts unchanged.

## Key elements

- **`SEMANTIC_LOG_NAMES`** (exported, `Readonly<Record<string, string>>`) — The canonical field-name → semantic-name mapping (e.g. `actorUserId → user.id`, `statusCode → http.response.status_code`). Fields without an OTel standard are namespaced under `app.*`.
- **`toSemanticNames(record)`** (exported) — Renames top-level keys in a log record to their semantic names. Special-cases `error` (expanded into `exception.*` attributes) and `actorRole` (wrapped into the `user.roles` array). Leaves nested objects and already-taken target keys untouched. Returns a new record; input is not mutated.
- **`isSerialisedError`** (internal) — Type guard: true for plain non-null, non-array objects (i.e. the shape `redactFormat` leaves under `error`).
- **`exceptionAttributes`** (internal) — Converts a serialised `Error` (or a bare string/number) into the OTel `exception.*` attribute set, preserving extra keys as `exception.details`.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — The consumer of this module's exports. This file is constrained to use only relative imports because `logger.ts` sits on Jest's `globalSetup` import chain; using absolute imports here would break that setup.
- **`tests/unit/infrastructure/adapters/semantic-names.test.ts`** — Unit tests covering the rename mapping, error expansion, and edge cases (already-taken keys, nested passthrough, `actorRole` wrapping).

## Notes

- **Top-level rename only.** Nested objects (`metadata`, `exception.cause`, etc.) pass through with their original shape; the caller is responsible for their internal naming.
- **Collision safety.** If a target name is already present in the record (e.g. the caller explicitly set `user.id`), the mapped field is left under its original key rather than overwriting the existing entry.
- **`traceId` / `spanId`** map to `trace_id` / `span_id` (not `trace.id`) to match what `@opentelemetry/instrumentation-winston` writes and what Grafana's Loki→Tempo link expects.
- **`actorRole`** is not in `SEMANTIC_LOG_NAMES`; it is handled as a special case in `toSemanticNames` to produce the list-valued `user.roles` key per the OTel convention.
- See `docs/tools/winston.md#field-names-in-the-log-line` for the broader naming policy.
