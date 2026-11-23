---
source: shared/rules/schemas/log-redaction.generated.schema.json
source_sha256: 3f132716ce0d7748f5c0fdf85031a260e6198ec8815c3a18c10c97e0cd5fc388
context_sha256: d7762dbd6bbf8f62f813f3ec9baa0597b3773da5b811b36632daa4be31f4face
generated_at: 2026-11-22T02:27:51.733156+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/log-redaction.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that defines the shape of the log-redaction rules configuration. It validates that a rules document supplies the four lists used to decide which log data to redact, and it rejects anything else.

## Key elements
All four properties are required. Each one is an array with at least one item, and each item is a non-empty string.

- `sensitiveFields`: field names treated as sensitive.
- `sensitiveKeyFragments`: key-name fragments that mark a key as sensitive.
- `personalFields`: field names holding personal data.
- `traceUrlSecrets`: secret names relating to trace URLs.

The schema sets `additionalProperties: false`, so unknown keys are rejected.

## Relationships
- `src/infrastructure/adapters/logger.ts` is the related neighbor in the dependency graph. It is the logger adapter that this redaction rules shape applies to. The schema file contains only the structure, so the exact way the logger loads or uses these lists is not visible here.

## Notes
- The `.generated.` name indicates the file is produced by tooling. Edit the source it is generated from, not this file, or the changes will be overwritten. The generator is not identifiable from this content.
- The schema enforces only non-emptiness. It does not check for duplicates or for what the strings mean (for example, exact names versus fragments).
