---
source: src/modules/account/rules.schema.ts
sha256: 51f141fd14cbfe5488c4d52dde4d510c0cbcfd6c054f57b9c296343a08219677
generated_at: 2026-10-29T02:39:25.716503+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rules.schema.ts

## Purpose

Defines the Zod schema that validates `rules.yaml` for the account module (two-factor lockout and delivered-code limits), and declares the `GenerateSpec` consumed by `npm run regenerate` to produce `rules.generated.ts`. These numeric values are copied verbatim into the PHP twin as data.

## Key elements

- **`count`** (local) — `z.int().positive()` helper reused for every numeric field.
- **`rulesSchema`** (exported) — `z.strictObject` describing the `rules.yaml` shape: `twoFactor.lockout` (`maxFailures`, `lockMs`) and `twoFactor.deliveredCodes` (`digits`, `ttlMs`, `resendSeconds`, `maxAttempts`).
- **`rulesGenerate`** (exported, typed as `GenerateSpec`) — Instructs the code generator to emit `src/modules/account/rules.generated.ts` exporting `twoFactorRules` (verbatim copy of the `twoFactor` field).

## Relationships

- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — Provides the `GenerateSpec` type that `rulesGenerate` implements. The infrastructure generator reads this object at build time to know the output path, export names, and field to lift.

## Notes

- All numeric fields use the shared `count` constraint (positive integer); time fields are in **milliseconds** (`lockMs`, `ttlMs`) while `resendSeconds` is in **seconds** — mixed units are intentional.
- The schema is `strictObject` at every level: unknown keys in `rules.yaml` will fail validation.
- This file contains no runtime logic; it is purely a shape definition + generation manifest. The actual values live in `rules.yaml` and the typed constants in `rules.generated.ts`.
