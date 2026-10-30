---
source: shared/rules/schemas/log-redaction.schema.json
sha256: 3f132716ce0d7748f5c0fdf85031a260e6198ec8815c3a18c10c97e0cd5fc388
generated_at: 2026-10-29T01:48:36.431699+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/log-redaction.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the log-redaction configuration object used by the application logger. It ensures any redaction config supplies all four required field lists and rejects unknown keys, so the logger never runs with a partially specified or malformed redaction rule set.

## Key elements

- **`sensitiveFields`** (required, `string[]`, ≥ 1 item, each ≥ 1 char) – exact top-level field names that must be masked before a log line is emitted.
- **`sensitiveKeyFragments`** (required, same constraints) – substring patterns matched against object keys (at any nesting depth) to identify values that should be redacted.
- **`personalFields`** (required, same constraints) – field names containing personal/PII data that receive a distinct redaction treatment.
- **`traceUrlSecrets`** (required, same constraints) – secret tokens (API keys, signatures, etc.) to strip or mask from trace URLs.
- **`additionalProperties: false`** – any key not listed above causes a validation failure, keeping the config surface closed.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – the sole consumer. It loads and validates its redaction configuration against this schema at startup, then applies the four field lists when formatting log output.

## Notes

- All four properties are simultaneously required; you cannot omit an unused category. Provide at least one entry per array.
- Because `additionalProperties` is `false`, adding a new redaction category (e.g. `headerFields`) requires updating this schema **and** the logger implementation in tandem.
- The schema enforces shape only—it does not constrain the *semantics* of the strings (e.g. whether a key fragment actually matches a known field). Validation is purely structural.
