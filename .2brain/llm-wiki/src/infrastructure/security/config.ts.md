---
source: src/infrastructure/security/config.ts
source_sha256: 521dce4e05529af764ddc131a071d7beb0b7e62c93ed9ee5bb0db9e7c9ce3dfb
context_sha256: 096520e9f51704d8c1d6f4ebe1f7e5352b7c984920c0467fa629f08bb82412da
generated_at: 2026-11-22T03:08:25.820966+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/config.ts

## Purpose
Declares the configuration slices that the security helpers read: the pseudonymisation root secret, the PII field-encryption key ring, and the breached-password check switches. Each slice is built with `defineConfig` and the shared field builders.

## Key elements
- `pseudonymConfig` — config slice named `pseudonymisation`. It has one field, `NODE_PSEUDONYM_KEY`, a `secret` (min length 16, min 32 bytes, placeholder `your-pseudonym-key-here`, `productionOnly: true`). It is the root secret every HMAC pseudonym is derived from.
- `PII_ENCRYPTION_KEY_FIELD` — a `versionedKeyRing()` field definition. It is exported on its own so other modules can reuse the shape.
- `piiConfig` — config slice named `pii-encryption`. It exposes `NODE_PII_ENCRYPTION_KEY`, which uses `PII_ENCRYPTION_KEY_FIELD`.
- `breachedPasswordsConfig` — config slice named `breached-passwords`. Its fields are:
  - `NODE_PASSWORD_BREACH_LIST`: flag, default `true`.
  - `NODE_PASSWORD_BREACH_HIBP`: flag, default `false`.
  - `NODE_PASSWORD_BREACH_HIBP_TIMEOUT_MS`: int, default `1500`, min `1`.

## Relationships
- Imports `defineConfig` from `src/infrastructure/config/define.ts`. It imports `flag`, `int`, `secret` and `versionedKeyRing` from `src/infrastructure/config/fields.ts`.
- The slices are consumed by the security helpers: `pseudonymise.ts` (pseudonymisation), `pii-encryption.ts` (PII encryption) and `src/infrastructure/security/breached-passwords/index.ts` (breached-password ladder). The file's docs describe these slices as what those helpers read.
- `src/modules/users/config.ts` is the module that decides whether the PII key is required. It is expected to reuse `PII_ENCRYPTION_KEY_FIELD`.
- `src/app/config.ts` is a graph neighbor. This file does not show how the two interact.

## Notes
- It uses relative imports only, on purpose. `pseudonymise.ts` is on the logger's import chain, which jest's `globalSetup` loads outside path-alias resolution, so path aliases would break there.
- The PII key ring is shape-only here. Whether it is required is the `users` module's decision, so deleting that module also deletes the requirement.
- `NODE_PSEUDONYM_KEY` is `productionOnly`.
- The breached-password "ladder" is a bundled list first, then optionally Have I Been Pwned. The bundled list is on by default and HIBP is off.
- Ownership of configuration is documented in the "who owns what" section of the configuration operations docs (`docs/operate/`).
