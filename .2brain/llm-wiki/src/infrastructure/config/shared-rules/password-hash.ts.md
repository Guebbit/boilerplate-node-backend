---
source: src/infrastructure/config/shared-rules/password-hash.ts
sha256: eac81f34e9a4cab4ba6135dadbd29e6ea9f740a23d6f10cde2773dd5a78f5e6b
generated_at: 2026-11-14T17:58:26.863022+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/password-hash.ts

## Purpose

Defines the Zod validation schema for the `shared/rules/password-hash.yaml` config file. The YAML holds the argon2id cost parameters (`memoryKib`, `passes`, `parallelism`) that every new password hash is produced with, and this schema enforces their shape at load time.

## Key elements

- **`positive`** – Internal Zod helper (`z.int().positive()`); reused for all three fields. Not exported.
- **`passwordHashSchema`** (exported) – A `z.strictObject` requiring exactly three keys:
  - `memoryKib` – argon2id memory cost in KiB (`m`).
  - `passes` – number of passes over that memory (`t`).
  - `parallelism` – lane count (`p`).

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** – Imports `passwordHashSchema` so the registry can include it when loading and validating all shared-rule YAML files together.
- **`src/infrastructure/security/password-hash.ts`** – Consumes the parsed, validated values from this schema at runtime to configure its argon2id hashing calls.

## Notes

- The file header comment states that **only relative imports** are permitted here; see `src/infrastructure/config/shared-rules/load.ts` for the convention's rationale.
- The schema is `strictObject`, so any extra keys in the YAML (typos, deprecated fields) will cause a validation failure rather than being silently ignored.
- The module is documented with `@module` — it has no runtime side-effects beyond the schema definition.
