---
source: src/infrastructure/security/config.ts
sha256: 836f2612f3ed8226f9f0a6a9a03b91f8b4f8719e33fddf0ec97210fc7ff6f112
generated_at: 2026-10-14T08:16:01.112052+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/config.ts

## Purpose

Declares the environment-variable schemas that the security helpers read at runtime: the pseudonymisation root key, the PII field-encryption key ring, and the breached-password checking ladder. It exists as a single import point so consumers never re-declare these shapes.

## Key elements

- **`pseudonymConfig`** – `defineConfig` block for `pseudonymisation`. Requires `NODE_PSEUDONYM_KEY` (secret, ≥ 16 chars / 32 bytes, `productionOnly`). Used as the HMAC root for every pseudonym.
- **`PII_ENCRYPTION_KEY_FIELD`** – A bare `versionedKeyRing()` field. Exported separately so that a consuming module (e.g. `users`) can opt in by referencing it in its own config; deleting that module removes the requirement without touching this file.
- **`piiConfig`** – `defineConfig` block for `pii-encryption`. Reads `NODE_PII_ENCRYPTION_KEY` via `PII_ENCRYPTION_KEY_FIELD`. This is the slice the encryption helper loads.
- **`breachedPasswordsConfig`** – `defineConfig` block for `breached-passwords`. Three knobs: `NODE_PASSWORD_BREACH_LIST` (flag, default `true`), `NODE_PASSWORD_BREACH_HIBP` (flag, default `false`), and `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS` (int, default 1500, min 1).

## Relationships

- **`src/infrastructure/config/define.ts`** → provides `defineConfig`, the builder used by every export here.
- **`src/infrastructure/config/fields.ts`** → provides the field constructors `flag`, `int`, `secret`, and `versionedKeyRing`.
- **`src/infrastructure/security/pseudonymise.ts`** → reads `pseudonymConfig` to obtain the HMAC root.
- **`src/infrastructure/security/pii-encryption.ts`** → reads `piiConfig` to obtain the encryption key ring.
- **`src/infrastructure/security/breached-passwords/index.ts`** → reads `breachedPasswordsConfig` to decide which checks to run and their timeout.
- **`src/modules/users/config.ts`** → references `PII_ENCRYPTION_KEY_FIELD` to declare that the `users` module requires PII encryption; removing that reference (or the module) drops the key-ring requirement.
- **`src/app/config.ts`** → composes the exported config blocks into the application-level configuration object.

## Notes

- **Relative imports are mandatory here.** `pseudonymise.ts` sits on the logger's import chain, which Jest's `globalSetup` loads *before* path-alias resolution is available. Using an alias (`@/…`) in this file would break that bootstrap path. Do not "clean up" the imports to use aliases.
- `PII_ENCRYPTION_KEY_FIELD` is intentionally **shape-only** (no `defineConfig` wrapper). The decision of *whether* the key is required is delegated to the consuming module's config, keeping this file module-agnostic.
