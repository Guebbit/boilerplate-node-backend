---
source: src/infrastructure/config/shared-rules/password-hash.ts
generated_at: 2026-11-22T02:46:04.801782+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/password-hash.ts

## Purpose
Defines the Zod schema for the shared rules YAML file for password hashing (`password-hash.yaml` under `shared/rules/`), which holds the argon2id cost parameters used for every newly created password hash. It only describes and validates the shape of that config; it contains no hashing logic.

## Key elements
- `passwordHashSchema`: a `z.strictObject` (unknown keys are rejected) with three required fields:
  - `memoryKib`: memory cost in KiB (argon2 `m`).
  - `passes`: number of passes over the memory (argon2 `t`).
  - `parallelism`: number of lanes (argon2 `p`).
- `positive` (module-private): `z.int().positive()`, a positive whole number, used by all three fields.

## Relationships
- `src/infrastructure/config/shared-rules/registry.ts`: a sibling in the shared-rules config area. Presumably it registers this schema alongside the other rule schemas, but that isn't visible in this file.
- `src/infrastructure/security/password-hash.ts`: the security-side counterpart. It likely consumes these cost values when hashing, but this file doesn't show that.

## Notes
- The module doc says to use relative imports only, because of how `src/infrastructure/config/shared-rules/load.ts` loads these schema files. Don't add aliased imports here.
- Because the schema is strict, adding a new key to the YAML requires adding it here as well.
