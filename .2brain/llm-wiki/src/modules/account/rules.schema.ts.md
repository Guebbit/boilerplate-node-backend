---
source: src/modules/account/rules.schema.ts
sha256: 51f141fd14cbfe5488c4d52dde4d510c0cbcfd6c054f57b9c296343a08219677
generated_at: 2026-11-08T04:15:36.663811+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rules.schema.ts

## Purpose

Declares the Zod schema for the `account` module's section of `rules.yaml` and specifies what `npm run regenerate` should emit as `rules.generated.ts`. It covers the two-factor lockout thresholds and the delivered-code limits (digits, TTL, resend cadence, attempt ceiling).

## Key elements

- **`count`** (local, not exported) — Zod type alias for a positive integer; used by every numeric field in the schema.
- **`rulesSchema`** (exported) — `z.strictObject` describing the `twoFactor` branch of `rules.yaml` (lockout: `maxFailures`, `lockMs`; deliveredCodes: `digits`, `ttlMs`, `resendSeconds`, `maxAttempts`). Enforces no unknown keys.
- **`rulesGenerate`** (exported, typed as `GenerateSpec`) — Generation directive: writes `src/modules/account/rules.generated.ts` and exports a single verbatim field `twoFactor` as `twoFactorRules`.

## Relationships

- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — Provides the `GenerateSpec` type that `rulesGenerate` conforms to. The generator infrastructure reads this spec to know the output path, export name, and how to map the YAML field into the generated TypeScript module.

## Notes

- This file is *one of several* module-level schema files that together compose the full `rules.yaml` shape; each module owns only its own branch.
- The doc header states that the numeric values are also copied verbatim by a "PHP twin," so changing a value here has cross-runtime implications.
- Unit inconsistency: `lockMs` and `ttlMs` are in **milliseconds** while `resendSeconds` is in **seconds**. Both are positive integers but the time unit differs per field.
- The schema is `strict` at every level, so adding a new key to the YAML without updating this file will fail validation.
