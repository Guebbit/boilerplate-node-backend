---
source: shared/rules/schemas/audit-actions.schema.json
sha256: ed7d1f6c668147e1851b2873edb025aa393e2ff11ed4b00294cb53d1a719ade4
generated_at: 2026-11-08T03:10:15.292842+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/audit-actions.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates audit-action configuration objects. It enforces a strict shape for a list of security-scoped action entries, each carrying a namespaced identifier and a human-readable description.

## Key elements

- **Top-level object** — Requires exactly one property, `actions`. No additional properties allowed.
- **`actions` array** — Must contain at least one item (`minItems: 1`).
- **`actions[].value`** — String constrained by the pattern `^security(\.[a-z_]+)+$`; must be a dot-separated namespaced identifier under the `security` root (e.g., `security.read_files`).
- **`actions[].description`** — Non-empty string (`minLength: 1`).
- **Per-item `required`** — Both `value` and `description` are mandatory; `additionalProperties: false` prevents any extra keys on individual items.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- The schema is fully closed at every level (`additionalProperties: false`), so any typo'd key will fail validation rather than being silently ignored.
- The `value` pattern requires at least one dot segment after `security` (e.g., `security.a_b` is valid; bare `security` is not), and all segments must be lowercase alphanumeric with underscores only.
- Consumers of this schema should import the `$schema` URI or reference this file by path; there is no `$id` defined here.
