---
source: shared/rules/schemas/audit-actions.generated.schema.json
source_sha256: f0402e9554689eb70e19ea22cd7290efeb83849604f934a9915ac8c2f50573e0
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:26:58.995436+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/audit-actions.generated.schema.json

## Purpose
A JSON Schema (draft 2020-12) describing the shape of a generated list of audit actions. The filename's `.generated` marker suggests it is produced by tooling rather than hand-edited. It validates that each action has a namespaced identifier and a human-readable description.

## Key elements
- **Root object**: requires a single `actions` property; no additional properties are allowed.
- **`actions`**: an array with at least one item (`minItems: 1`).
- **Action item**: an object with exactly two required fields, `value` and `description`; `additionalProperties` is `false`.
  - **`value`**: a string matching `^security(\.[a-z][\d_a-z]*){1,3}$`. It must start with `security`, followed by 1–3 dot-separated segments. Each segment starts with a lowercase letter and may then contain lowercase letters, digits, or underscores.
  - **`description`**: a non-empty string (`minLength: 1`).

## Relationships
No graph neighbors are recorded, so no dependencies on or from other files are visible here.

## Notes
- Every action must be under the `security.` namespace. Values like `audit.foo` or `security` alone fail validation.
- Segment depth is capped at 3 below `security`, so `security.a.b.c.d` is invalid.
- Uppercase letters and hyphens are not allowed in segments.
- Since the file appears to be generated, changes should be made in the generator rather than here.
