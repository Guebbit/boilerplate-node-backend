---
source: src/modules/account/rules.schema.ts
generated_at: 2026-11-22T03:35:06.697441+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/rules.schema.ts

## Purpose
Defines the Zod schema for the account module's `rules.yaml` and the generation spec that tells `npm run regenerate` what to write from it. The file holds the two-factor lockout and delivered-code limits as data. These are numbers the PHP twin copies, so the schema keeps both sides on the same values.

## Key elements
- `rulesSchema`: a strict Zod object describing `rules.yaml`. Its top-level key is `twoFactor`, which has two groups:
  - `lockout`:
    - `maxFailures`: wrong codes before the account locks.
    - `lockMs`: lock duration in milliseconds.
  - `deliveredCodes`:
    - `digits`: digits in a delivered code.
    - `ttlMs`: how long a delivered code is accepted, in milliseconds.
    - `resendSeconds`: seconds between two deliveries of the same method.
    - `maxAttempts`: wrong guesses one code tolerates before it is burned.
- `rulesGenerate`: a `GenerateSpec` describing the generated output file, with the `out` path set to `rules.generated.ts` in the account module. It has one export, `twoFactorRules`, with shape `verbatim`, taken from the `twoFactor` field.
- `count` (internal, not exported): `z.int().positive()`, a positive whole number used for every leaf value.

## Relationships
- Imports the `GenerateSpec` type from `src/infrastructure/config/shared-rules/generate-spec.ts`. `rulesGenerate` is typed with it, so the spec's shape is checked at compile time.

## Notes
- Every object is a `z.strictObject`, so unknown keys in `rules.yaml` are rejected.
- All values must be positive integers. Time units differ by field: `lockMs` and `ttlMs` are milliseconds, while `resendSeconds` is seconds.
- The output named in `rulesGenerate.out` is generated from `rules.yaml`, so edit `rules.yaml` and regenerate rather than changing it by hand.
