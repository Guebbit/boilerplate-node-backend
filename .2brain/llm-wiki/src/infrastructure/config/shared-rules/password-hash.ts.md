---
source: src/infrastructure/config/shared-rules/password-hash.ts
sha256: 6817014cb231e822f6ec819b299deee23d27213761bcb861c56b1294b12bc2bf
generated_at: 2026-11-08T03:27:22.340749+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/password-hash.ts

## Purpose

Declares the Zod validation schema for the `shared/rules/password-hash.yaml` config file, which specifies the argon2id cost parameters (memory, passes, parallelism) used when creating new password hashes. This file is the *shape* of the config, not the hashing logic itself.

## Key elements

- **`passwordHashSchema`** (`z.strictObject`) — Validates that the YAML contains exactly three positive-integer keys: `memoryKib` (KiB, argon2id `m`), `passes` (iterations, `t`), and `parallelism` (lanes, `p`). `strictObject` rejects any extra keys.
- **`PasswordHashRules`** (type) — `z.infer` of the schema; the typed representation of a parsed `password-hash.yaml`.
- **`positive`** (local const) — Shared `z.int().positive()` helper used by all three fields.

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Imports `passwordHashSchema` (and the `PasswordHashRules` type) to register this rule under a key in the shared-rules registry, making it discoverable alongside other shared rule schemas.
- **`src/infrastructure/security/password-hash.ts`** — The security-side consumer that imports `PasswordHashRules` and applies the validated parameters (memoryKib / passes / parallelism) when invoking argon2id. This file never performs hashing; it only guarantees the shape of the inputs that hashing code expects.

## Notes

- The docblock states a **relative-imports-only** convention (see `src/infrastructure/config/shared-rules/load.ts` for the full rule). Do not use bare or package-style specifiers here.
- All three parameters are constrained to **positive integers** (≥ 1). A zero or negative value will fail schema validation at load time, not at hash time.
- `strictObject` means adding a new key to the YAML without updating this schema will cause a validation error, not a silent ignore.
