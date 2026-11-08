---
source: src/modules/users/config.ts
sha256: 5cce8e2f3362ea09f120d36494505e4e01a64d7db5fc844781ba0b7357c66811
generated_at: 2026-11-08T08:43:40.672934+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/config.ts

## Purpose

Defines the `users` module's runtime configuration: the encryption key for personal fields and the two frontend links (contact + privacy) embedded in purchase-hold mail. It owns the *requirement* that the PII key be set, while the shape/validation lives in `infrastructure/security/config.ts`. Deleting this module removes that requirement.

## Key elements

- **`usersConfig`** – A `defineConfig` instance named `'users'` with three shape fields:
  - `NODE_PII_ENCRYPTION_KEY` – required text (min 16 chars / 32 bytes), placeholder `'your-pii-encryption-key-here'`. Wraps `PII_ENCRYPTION_KEY_FIELD` via `withPresence`.
  - `NODE_FRONTEND_LINK_CONTACT` – optional text, defaults to `FRONTEND_LINK_RULES.links.contact`.
  - `NODE_FRONTEND_LINK_PRIVACY` – optional text, defaults to `FRONTEND_LINK_RULES.links.privacy`.
- **`contactFrontendLink(locale: string): string`** – Builds a localized absolute URL to the paired frontend's contact page (GDPR Art. 22(3) "ask a person" path for purchase holds).
- **`privacyFrontendLink(locale: string): string`** – Builds a localized absolute URL to the paired frontend's privacy notice.

## Relationships

- **`infrastructure/config/define.ts`** – provides `defineConfig`, the function that produces the typed config object.
- **`infrastructure/config/fields.ts`** – provides `text` and `withPresence`, the field-shape primitives used in the shape definition.
- **`infrastructure/http/frontend-link.ts`** – provides `frontendLink` (origin + locale composition) and `FRONTEND_LINK_RULES` (the default route templates).
- **`infrastructure/security/config.ts`** – exports `PII_ENCRYPTION_KEY_FIELD`, the shape-only field definition that this module elevates to a *required* field.
- **`modules/users/module.ts`** – the module owner; deleting it removes this file and its requirements.
- **`modules/users/services/purchase-hold.ts`** – consumes `contactFrontendLink` / `privacyFrontendLink` when composing purchase-hold notifications.

## Notes

- The PII key is **shared with the `addresses` module**: both are in `group: foundation`, so neither deploys without the other. Requiring it here is sufficient for both.
- The shipped placeholder (`your-pii-encryption-key-here`) is recoverable by anyone with repo access. The min-length/min-bytes constraints exist to catch this, but the real guard is the presence requirement itself.
- `usersConfig()` is called at invocation time (not at import), so the two link helpers will throw if the key is unset—consistent with the "requirement lives here" design.
- Defaults for the frontend links come from the *frontend's own* route definitions (`tasks/routes.ts`), not a local constant.
