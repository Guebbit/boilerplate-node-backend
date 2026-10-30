---
source: src/infrastructure/config/shared-rules/password-hash.ts
sha256: 6817014cb231e822f6ec819b299deee23d27213761bcb861c56b1294b12bc2bf
generated_at: 2026-10-29T02:00:04.590402+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/password-hash.ts

## Purpose

Defines the Zod schema and inferred TypeScript type for `shared/rules/password-hash.yaml`, which stores the argon2id cost parameters (memory, passes, parallelism) used when generating new password hashes.

## Key elements

- **`passwordHashSchema`** — `z.strictObject` with three required positive-integer fields: `memoryKib` (KiB, argon2 `m`), `passes` (argon2 `t`), `parallelism` (argon2 `p`). Strict object means unknown keys are rejected.
- **`PasswordHashRules`** — `z.infer` type alias giving the parsed shape of the YAML file.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Collects this schema alongside other shared-rule schemas so they can be loaded and validated together.
- **`src/infrastructure/security/password-hash.ts`** — Consumes the validated `PasswordHashRules` values as the actual argon2id parameters at hash time.

## Notes

- The module docstring mandates **relative imports only** and points to `load.ts` for the rationale; follow that convention when adding imports here.
- `memoryKib` is in **KiB**, not MiB — the argon2 `m` parameter is interpreted accordingly by the security layer.
- Because the schema is `strictObject`, adding a field to the YAML without updating this schema will cause validation to fail.
