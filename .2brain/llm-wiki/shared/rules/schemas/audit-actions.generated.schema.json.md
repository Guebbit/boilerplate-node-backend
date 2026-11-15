---
source: shared/rules/schemas/audit-actions.generated.schema.json
sha256: f0402e9554689eb70e19ea22cd7290efeb83849604f934a9915ac8c2f50573e0
generated_at: 2026-11-14T17:46:42.238885+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/audit-actions.generated.schema.json

## Purpose

A generated JSON Schema (draft 2020-12) that validates the shape of an "audit actions" payload. It enforces that the payload is a single object containing a non-empty `actions` array, where each entry pairs a namespaced security action identifier with a human-readable description.

## Key elements

- **Top-level object** — requires exactly one key, `actions`; no other properties allowed.
- **`actions` (array)** — `minItems: 1`; each element must conform to the item schema below.
- **`actions[].value`** — string constrained by the regex `^security(\.[a-z][\d_a-z]*){1,3}$`. This forces a `security.` prefix followed by 1–3 dot-separated segments, each beginning with a lowercase letter and continuing with lowercase alphanumerics or underscores.
- **`actions[].description`** — non-empty string (`minLength: 1`).
- **`actions[]` item** — both `value` and `description` are required; `additionalProperties: false` prevents unknown fields.

## Relationships

No graph neighbors are recorded for this file. It is a standalone schema artifact with no in-repo dependencies.

## Notes

- The `.generated.` segment in the filename indicates this schema is produced by a tool rather than hand-edited. Manual changes will be overwritten on the next generation run.
- The `value` pattern caps the hierarchy at three segments below `security.`. Adding a fourth segment (e.g. `security.a.b.c.d`) will fail validation.
- Both the top-level object and each array item set `additionalProperties: false`, so any extra keys are rejected — consumers must not include metadata fields outside the two defined properties.
