---
source: src/infrastructure/config/shared-rules/step-up.ts
source_sha256: 0315facf70a016e92e2fa221c6316fdd608f7eaa5bbfa33b2d1bc6fea9800139
context_sha256: 0a1807d38082bd6322a1ed3ac98315164822dff4e82009372f876ec3ecf4d483
generated_at: 2026-11-22T02:46:52.181415+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/step-up.ts

## Purpose
Defines the Zod schema for the `stepUp:` block of `shared/authorization-keys.generated.yaml`. That block states, per tier, how recent a sign-in must be (in seconds) before a sensitive action is allowed. The file validates only this slice of the YAML document; the rest of the document belongs to `src/kernel/permissions.ts`.

## Key elements
- `seconds` (private): `z.int().positive()`, a positive whole number of seconds.
- `stepUpWindowsSchema` (private): a `z.strictObject` with exactly two tiers, both `seconds`:
  - `critical`: money and destructive actions.
  - `sensitive`: identity and sessions.
- `stepUpDocumentSchema` (exported): `z.looseObject({ stepUp: stepUpWindowsSchema })`. It requires a `stepUp` key and ignores all other top-level keys.

## Relationships
- `scripts/contracts/generate-shared-rule-schemas.ts` is a graph neighbor of this file. The file itself does not show how the script uses it.
- `tests/unit/infrastructure/config/ops-rules-schemas.test.ts` is a graph neighbor and covers the shared-rule schemas. The file itself does not show what it asserts.

## Notes
- The inner `stepUp` object is strict, so an unknown tier name or a missing tier fails validation. The outer document is loose, so unrelated keys pass through.
- Values must be integers greater than zero. Zero, negative numbers, and fractions are rejected.
- Adding a new tier means adding a key to `stepUpWindowsSchema`.
- The module doc states that imports in this file must be relative only, referring to `load.ts` in the same directory for the rationale.
