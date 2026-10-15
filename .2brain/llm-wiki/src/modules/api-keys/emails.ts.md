---
source: src/modules/api-keys/emails.ts
sha256: 9b362bbcd16b7f8faee85c92b2fe80af94bc4687f4cbbbddd8ba679835dfa084
generated_at: 2026-10-15T10:20:22.913926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/emails.ts

## Purpose

Provides the resolved, human-readable copy for the two emails the API-keys module sends: a notification when a credential is minted, and a notification when credentials are revoked due to a possible compromise. Follows the same convention as `@modules/account/emails` — language is passed in as an argument, and the output is fully interpolated text ready for a template to render.

## Key elements

- **`apiKeyMintedEmail(locale, keyName, credential, expires)`** — Builds the "your key was created" email. Returns an `EmailContent` with template `api-keys.minted`. Carries no secret and no actionable link; `credential` is the public display id only.
- **`apiKeysRevokedEmail(locale, reason, credentials)`** — Builds the "your credentials were revoked" email. Returns an `EmailContent` with template `api-keys.revoked`. The body key is interpolated at runtime as `api-keys.email-revoked.body-${reason}`. `credentials` is joined into a comma-separated `list` field.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Source of the `EmailContent` return type both functions use; defines the shape the mailer adapter expects (`template`, `subject`, `data`).
- **`src/infrastructure/i18n/index.ts`** — Exports `translator`, which both functions call with the recipient's locale to obtain the translation function `t`.
- **`src/infrastructure/i18n/context.ts`** — Underlying context the translator operates on (indirect dependency through the i18n package).
- **`src/modules/account/index.ts`** — Re-exports the `SessionsRevokedReason` type used as the `reason` parameter of `apiKeysRevokedEmail`.
- **`src/modules/account/domain/revocation.ts`** — Original definition of `SessionsRevokedReason`; determines which i18n body key is selected.
- **`src/modules/api-keys/services/api-keys.ts`** — Service layer that invokes these email builders and passes the resulting `EmailContent` to the mailer.
- **`src/modules/api-keys/tests/unit/emails.test.ts`** — Unit tests for both exported functions.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Tests the email templates (`api-keys.minted`, `api-keys.revoked`) that these functions reference by name.

## Notes

- The `reason` parameter is used to construct an i18n key dynamically (`api-keys.email-revoked.body-${reason}`), so every valid `SessionsRevokedReason` value must have a corresponding translation key or the lookup will fail.
- Both functions are pure: they take arguments and return an `EmailContent` object without side effects (no sending, no logging).
- The `data` object always includes a `locale` field, presumably so the template renderer can set the document language.
