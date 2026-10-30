---
source: src/modules/users/config.ts
sha256: da7690342bf9e2603160cc09c54e86729c7d09e370967db7b2778d22f792178c
generated_at: 2026-10-29T06:10:51.094196+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/config.ts

## Purpose
Declares the `users` module's runtime configuration: the PII encryption key under which personal fields are stored, and the two frontend links (contact and privacy) embedded in purchase-hold emails. It also exposes helper functions that turn those link fields into locale-aware URLs.

## Key elements
- **`usersConfig`** – The `defineConfig` object (name: `'users'`). Contains three shape fields:
  - `NODE_PII_ENCRYPTION_KEY` – Required (`withPresence`), min 16 chars / 32 bytes, default placeholder. Backs the `PII_ENCRYPTION_KEY_FIELD` from the security adapter.
  - `NODE_FRONTEND_LINK_CONTACT` – Text field defaulting to `FRONTEND_LINK_RULES.links.contact`.
  - `NODE_FRONTEND_LINK_PRIVACY` – Text field defaulting to `FRONTEND_LINK_RULES.links.privacy`.
- **`contactFrontendLink(locale: string): string`** – Resolves the contact link for a given locale via `frontendLink`.
- **`privacyFrontendLink(locale: string): string`** – Resolves the privacy-notice link for a given locale via `frontendLink`.

## Relationships
- **`@infrastructure/config/define`** – Provides `defineConfig`, the builder used to declare `usersConfig`.
- **`@infrastructure/config/fields`** – Provides `text` and `withPresence` field constructors used inside the shape.
- **`@infrastructure/http/frontend-link`** – Provides `frontendLink` (origin + locale resolution) and `FRONTEND_LINK_RULES` (default route templates).
- **`@infrastructure/security/config`** – Supplies `PII_ENCRYPTION_KEY_FIELD`, the shape-only adapter for the encryption key. This file owns the *presence requirement*; the adapter only defines the shape.
- **`src/modules/users/module.ts`** – Parent module that registers this config; deleting the module removes the key requirement.
- **`src/modules/users/services/purchase-hold.ts`** – Consumes `contactFrontendLink` / `privacyFrontendLink` when composing the purchase-hold email (GDPR Art. 22(3) disclosure).

## Notes
- The PII encryption key is **shared with the `addresses` module** (both are `group: foundation`). Neither is deployed without the other, so the presence check here covers both.
- The shipped placeholder key (`'your-pii-encryption-key-here'`) is recoverable by anyone with read access to the repo — same failure shape as `NODE_TOTP_ENCRYPTION_KEY`. Ensure a real value is set in every environment.
- `frontendLink` appends origin and locale on top of the default route template; the defaults themselves come from the frontend's `tickets/routes.ts`, not from this file.
