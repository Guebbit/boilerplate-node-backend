---
source: src/modules/users/config.ts
sha256: e62dc6d5e935a3e27dd47f246cac311f9beec26e9a6af8c8e59d35149681fb3e
generated_at: 2026-10-15T12:06:27.488688+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/config.ts

## Purpose

Defines the `users` module's configuration schema. Its single responsibility is to **require** (via presence validation) the `NODE_PII_ENCRYPTION_KEY` environment variable that protects personal fields such as phone numbers. The shape of that key lives in the shared security adapter; this file owns the *requirement* so that deleting the `users` module removes the requirement.

## Key elements

- **`usersConfig`** (exported const) — The module's config object, built with `defineConfig`. Contains one shape field:
  - `NODE_PII_ENCRYPTION_KEY` — Wraps the shared `PII_ENCRYPTION_KEY_FIELD` with `withPresence`, enforcing `minLength: 16`, `minBytes: 32`, and a placeholder (`your-pii-encryption-key-here`).

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the builder used to construct `usersConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides `withPresence`, the validation wrapper that turns the shared field into a *required* one.
- **`src/infrastructure/security/config.ts`** — Provides `PII_ENCRYPTION_KEY_FIELD`, a shape-only adapter describing the key's format. This file adds the presence requirement on top of that shape.
- **`src/modules/users/module.ts`** — The owning module. Because this config is registered under `users`, removing the module removes the mandatory-key requirement.

## Notes

- The placeholder key is intentionally visible in the repo; the comment warns that any value shipped under it (e.g., a phone number) is recoverable by anyone with read access. The same failure mode and fix pattern apply to `NODE_TOTP_ENCRYPTION_KEY`.
- The key is shared with the `addresses` module. Both modules belong to `group: foundation`, so they are always deployed together and requiring the key here covers both.
- The requirement lives *here* (not in the security adapter) deliberately: the security adapter is shape-only and must not carry per-module enforcement.
