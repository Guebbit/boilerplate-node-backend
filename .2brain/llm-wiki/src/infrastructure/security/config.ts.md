---
source: src/infrastructure/security/config.ts
sha256: 836f2612f3ed8226f9f0a6a9a03b91f8b4f8719e33fddf0ec97210fc7ff6f112
generated_at: 2026-11-08T03:48:34.201882+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/config.ts

## Purpose

Central shape definitions for the three security helper subsystems — pseudonymisation, PII field encryption, and breached-password checking. It declares *what* environment variables each helper expects (type, constraints, defaults) without providing values, so that consumer modules and the app-level config can wire real secrets in at their own layer.

## Key elements

- **`pseudonymConfig`** — Config shape (`pseudonymisation`) exposing `NODE_PSEUDONYM_KEY` as a `secret` (min 16 chars / 32 bytes, `productionOnly`). The root key from which all HMAC pseudonyms are derived.
- **`PII_ENCRYPTION_KEY_FIELD`** — A bare `versionedKeyRing()` field. Exported independently so that a *module* (currently `users`) can declare the requirement in its own config rather than this file hard-coding which modules need it.
- **`piiConfig`** — Config shape (`pii-encryption`) that slots `PII_ENCRYPTION_KEY_FIELD` under `NODE_PII_ENCRYPTION_KEY`. This is the slice the encryption helper reads.
- **`breachedPasswordsConfig`** — Config shape (`breached-passwords`) with three fields: `NODE_PASSWORD_BREACH_LIST` (flag, default `true`), `NODE_PASSWORD_BREACH_HIBP` (flag, default `false`), and `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS` (int, default `1500`, min `1`).

## Relationships

- **Imports** `defineConfig` from `../config/define` and the field helpers `flag`, `int`, `secret`, `versionedKeyRing` from `../config/fields` — all via **relative** paths (see Notes).
- **Consumed by** `src/infrastructure/security/pseudonymise.ts`, which reads the pseudonymisation key to derive HMAC pseudonyms.
- **Consumed by** `src/infrastructure/security/pii-encryption.ts`, which reads `piiConfig` for the encryption ring.
- **Consumed by** `src/infrastructure/security/breached-passwords/index.ts`, which reads `breachedPasswordsConfig` for its flag/timeout settings.
- **Referenced by** `src/modules/users/config.ts`: the users module is the entity that *requires* the PII encryption ring (per the in-file comment); removing the users module would remove that requirement.
- **Aggregated by** `src/app/config.ts` at the application level.

## Notes

- **Relative imports are mandatory here, not stylistic.** `pseudonymise.ts` sits on the logger's import chain, which jest's `globalSetup` loads *outside* path-alias resolution. Using an alias (e.g. `@/…`) would break the test bootstrap. Stick to relative paths in this file.
- `PII_ENCRYPTION_KEY_FIELD` is intentionally a standalone export, separate from `piiConfig`. This decouples "which field shape" from "which module requires it," so adding or removing a consumer module doesn't require editing this file.
- `NODE_PSEUDONYM_KEY` is `productionOnly: true`; it must not appear in `.env.development` or similar non-production env files.
