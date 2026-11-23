---
source: src/infrastructure/adapters/semantic-names.ts
source_sha256: e744328ed5d1898c905e02b78390efd0142ce7609135c5dedd4680818a3901c4
context_sha256: fad688512892766cfda1dcb085564aa8d4de2d3195360ae813af6f672af37c20
generated_at: 2026-11-22T02:42:21.174419+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/semantic-names.ts

## Purpose
Translates the camelCase field names used in code for structured logging (`actorUserId`, `statusCode`) into OpenTelemetry semantic-convention names (`user.id`, `http.response.status_code`) on the emitted log line. This lets dashboards and alerts written against the standard work unchanged in Loki, a SIEM, or any other collector.

## Key elements
- `SEMANTIC_LOG_NAMES`: read-only map of code field name → log-line name, taken from the generated `semantic-log-names.generated` data (source table: `shared/rules/semantic-log-names.yaml`). It uses standard OpenTelemetry names where they exist and `app.*` where they don't. `traceId` and `spanId` map to the top-level `trace_id` and `span_id`.
- `toSemanticNames(record)`: exported. Takes a (redacted) record and returns a new record with renamed keys. Values are untouched.
  - `error` (when not `undefined`) is expanded into `exception.*` attributes.
  - `actorRole` becomes `user.roles`, wrapped as a one-element array.
  - Every other key is looked up in `SEMANTIC_LOG_NAMES` and falls back to its original name.
- `exceptionAttributes(error)`: internal. For a non-plain-object value it returns `exception.message: String(error)`. For a plain object it maps:
  - `name` → `exception.type`
  - `message` → `exception.message`
  - `stack` → `exception.stacktrace`
  - `cause` → `exception.cause`
  - any remaining properties → `exception.details`

## Relationships
- Imports `isPlainObject` from `../object-guards` to tell error objects from bare strings or numbers.
- The `logger.ts` neighbor sits on jest's `globalSetup` import chain, which is why this file uses relative imports only. The file does not say how `logger.ts` calls it, but its docs describe it as applying after redaction.
- `tests/unit/infrastructure/adapters/semantic-names.test.ts` is the unit test for this module.

## Notes
- Only top-level keys are renamed. Nested objects such as `metadata` or `error.cause` keep the call site's own shape.
- Despite the doc comment saying a field is left alone when its target name is already taken, the loop assigns without checking for collisions. A later key that maps to the same target overwrites an earlier one.
- Keep imports relative (no path aliases), because of the `globalSetup` constraint above.
- Edit the rename table in the YAML source, not in the generated file.
