---
source: shared/rules/schemas/log-redaction.generated.schema.json
sha256: 3f132716ce0d7748f5c0fdf85031a260e6198ec8815c3a18c10c97e0cd5fc388
generated_at: 2026-11-08T03:11:01.981098+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/log-redaction.generated.schema.json

## Purpose
JSON Schema (draft 2020-12) that validates the shape of a log-redaction configuration object. It enforces that four required string-array fields are present, non-empty, and that no extra properties are allowed, ensuring a single source of truth for what the logger must redact before writing to disk.

## Key elements
- **`sensitiveFields`** – Array of exact field names (e.g. `password`, `apiKey`) that must be scrubbed from log payloads. Requires ≥ 1 entry.
- **`sensitiveKeyFragments`** – Array of substrings to match against object *keys* (e.g. `"secret"`, `"token"`) so any key containing the fragment is redacted. Requires ≥ 1 entry.
- **`personalFields`** – Array of PII field names (e.g. `email`, `ssn`) subject to stricter redaction rules. Requires ≥ 1 entry.
- **`traceUrlSecrets`** – Array of secret patterns to strip from trace/URL strings (e.g. query-param tokens). Requires ≥ 1 entry.
- **`required` / `additionalProperties`** – All four properties are mandatory; any unknown key causes validation failure (`additionalProperties: false`).

## Relationships
- **`src/infrastructure/adapters/logger.ts`** – The logger adapter loads and validates its redaction configuration against this schema at startup. If the config object fails validation (missing field, empty array, extra key), the logger will reject the configuration or throw, preventing silent under-redaction.

## Notes
- All four arrays enforce `minItems: 1` and `minLength: 1` on every string, so an empty array or empty-string entry is invalid—configuration must explicitly list at least one value per category.
- The schema is purely structural; it does *not* prescribe *how* redaction is applied (replace, hash, drop). That behavior lives in the logger adapter.
- Because `additionalProperties` is `false`, adding a new redaction category requires both a schema change here and a matching code change in the logger.
