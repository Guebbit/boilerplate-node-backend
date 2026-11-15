---
source: src/infrastructure/config/shared-rules/step-up.ts
sha256: 0315facf70a016e92e2fa221c6316fdd608f7eaa5bbfa33b2d1bc6fea9800139
generated_at: 2026-11-14T17:59:16.545562+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/step-up.ts

## Purpose

Defines a Zod schema that validates the `stepUp:` block inside `shared/authorization-keys.generated.yaml`. The block specifies, in seconds, how recent a sign-in must be for each authorization tier (`critical`, `sensitive`). It is deliberately a "loose" wrapper so that only this slice is asserted here while the remainder of the document stays under `kernel/permissions.ts`.

## Key elements

- **`stepUpDocumentSchema`** (exported) — `z.looseObject({ stepUp: stepUpWindowsSchema })`. The public entry point; parses the full YAML document but only enforces the shape of the `stepUp` key.
- **`stepUpWindowsSchema`** (internal) — `z.strictObject` with two keys:
  - `critical` — positive integer (seconds); money and destructive actions.
  - `sensitive` — positive integer (seconds); identity and sessions.
- **`seconds`** (internal) — `z.int().positive()`, the shared type for both tier values.

## Relationships

- **`scripts/contracts/generate-shared-rule-schemas.ts`** — consumes or generates contract artifacts that must conform to the shape declared here; this file is the runtime schema the generated YAML is validated against.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — unit-tests this schema, asserting that valid and invalid `stepUp` payloads parse/reject as expected.

## Notes

- The schema is `z.looseObject` at the top level (tolerates extra keys) but `z.strictObject` for the inner `stepUp` object (rejects unknown tiers). Do not add a new tier without updating both this schema and the generated YAML.
- The module comment mandates **relative imports only** (see `src/infrastructure/config/shared-rules/load.ts`). Avoid adding bare/absolute specifiers.
- Values are in **seconds**, not milliseconds.
