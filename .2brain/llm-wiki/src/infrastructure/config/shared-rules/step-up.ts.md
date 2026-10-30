---
source: src/infrastructure/config/shared-rules/step-up.ts
sha256: bd724a597299fe180ae59deaf260bddfb3029a086fc26e34f7beb6a5247fbb36
generated_at: 2026-10-29T02:00:40.444723+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/step-up.ts

## Purpose

Defines the Zod schema for the `stepUp:` block in `shared/authorization-keys.yaml`, specifying how recent a sign-in must be (in seconds) per security tier (`critical`, `sensitive`). It uses a loose object wrapper so it can extract only its slice from the full document without constraining keys owned by other modules (e.g. `kernel/permissions.ts`).

## Key elements

- **`stepUpWindowsSchema`** — `z.strictObject` with two required keys: `critical` (money/destructive actions) and `sensitive` (identity/sessions), each a positive integer of seconds.
- **`stepUpDocumentSchema`** — `z.looseObject({ stepUp: stepUpWindowsSchema })`; the entry-point schema that reads just the `stepUp` key from the YAML document while ignoring all other top-level keys.
- **`seconds`** (module-private) — `z.int().positive()` helper used by both tier fields.

## Relationships

- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Imports the exported schemas to generate machine-readable contract artifacts (e.g. JSON Schema) from the Zod definitions.
- **`tests/unit/infrastructure/config/ops-rules-schemas.test.ts`** — Exercises `stepUpWindowsSchema` and `stepUpDocumentSchema` against sample and edge-case inputs to lock down validation behavior.

## Notes

- The module uses **relative imports only**; see `src/infrastructure/config/shared-rules/load.ts` for the rationale (likely bundling/monorepo constraints).
- `stepUpDocumentSchema` is deliberately a **loose** object, while `stepUpWindowsSchema` is **strict**. Do not "fix" the outer object to strict — other keys in the YAML belong to `kernel/permissions.ts` and must pass through unvalidated here.
- Both tiers are required; there is no optional tier or fallback.
