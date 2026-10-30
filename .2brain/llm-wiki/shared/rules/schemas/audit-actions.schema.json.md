---
source: shared/rules/schemas/audit-actions.schema.json
sha256: ed7d1f6c668147e1851b2873edb025aa393e2ff11ed4b00294cb53d1a719ade4
generated_at: 2026-10-29T01:47:57.786746+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/audit-actions.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the structure of audit-action rule definitions. It enforces that every action entry carries a namespaced `security.*` identifier and a human-readable description, ensuring a consistent vocabulary across audit rules in the shared rules directory.

## Key elements

- **Root object** — requires exactly one key, `actions`, and disallows any other top-level properties (`additionalProperties: false`).
- **`actions` array** — must contain at least one item (`minItems: 1`); each item is a strict object.
- **`actions[].value`** — string constrained by the regex `^security(\.[a-z_]+)+$`, enforcing a dotted hierarchical namespace (e.g. `security.data.exfiltration`) composed of lowercase letters and underscores after the `security` root.
- **`actions[].description`** — non-empty string (`minLength: 1`) providing a human-readable label for the action.
- **`actions[].additionalProperties: false`** — no extra fields permitted on individual action entries.

## Relationships

No dependency-graph neighbors were identified. This file is a standalone schema definition; it is consumed by whatever validation tooling or rule loader references it by path.

## Notes

- The `value` pattern requires **at least one** dot-segment after `security` (the `+` on the group), so a bare `"security"` string is **invalid**.
- Both levels of the object (root and each array item) close off with `additionalProperties: false`, so any typo'd key will fail validation.
- The schema does not define `$id` or `title`; consumers must reference it by file path.
- Because `minItems` is 1, an empty `actions` array is rejected — a rule file must declare at least one action.
