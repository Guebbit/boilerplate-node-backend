---
source: tests/unit/scripts/contracts/permission-vocabulary-render.test.ts
sha256: 771649a0ccd73a904670f3d1c2fe750fef3880a0f6310417c83caabc84b0456b
generated_at: 2026-11-08T10:34:11.274747+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/permission-vocabulary-render.test.ts

## Purpose

Unit tests for the `readPermissionVocabulary` and `renderPermissionVocabulary` pair. Verifies that a permission-vocabulary YAML document is parsed into a structured object with correct ordering and validation, and that that object renders to a deterministic TypeScript type-definition string.

## Key elements

- **`DOCUMENT`** — shared fixture: a small valid vocabulary (actions, scopes, stepUp tiers, rules, sets) used as the base for every test case.
- **`mapping(key, value)`** — tiny helper that formats a YAML key→list-of-scalar-mappings block.
- **`yamlOf(overrides?)`** — serializes `DOCUMENT` (merged with optional overrides) into the exact YAML string the reader consumes. Handles both flat string lists and object-lists (rules).
- **`describe('readPermissionVocabulary')`** — asserts:
  - Happy-path: every list returned in declared order; subjects in first-seen order; `ruleIds` derived as `action:Subject`.
  - A table of refusal cases (empty lists, duplicate actions/sets/rules, undeclared action/scope/stepUp reference) via `it.each`.
  - Edge rejections: empty string input, non-string entry in `actions`, rule missing `subject`.
- **`describe('renderPermissionVocabulary')`** — asserts:
  - Each vocabulary dimension emits a `const` array + `type … = (typeof …)[number]` in the expected order and format.
  - The `PERMISSION_PAIRS` map and the generic `ActionOn<S>` helper type appear.
  - **Determinism**: running the read→render pipeline twice yields byte-identical output.

## Relationships

- **`scripts/contracts/permission-vocabulary-render.ts`** — the module under test; supplies `readPermissionVocabulary` and `renderPermissionVocabulary`.

## Notes

- YAML serialization is hand-rolled (`yamlOf`, `mapping`) rather than using a YAML library; the format must match what the reader expects exactly (indentation, list-item syntax differ between scalar lists and object lists).
- Refusal messages are matched by **regex**, not exact string — the reader may prefix/suffix the message.
- The stepUp-tier refusal regex expects the tier name in double quotes (`"lunar"`), unlike action/scope rejections which use backticks — a convention baked into the implementation's error strings.
- The renderer test asserts exact multi-line strings including 4-space indentation inside array literals; a formatting change in the renderer will break these without changing semantics.
