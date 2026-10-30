---
source: src/modules/api-keys/emails.ts
sha256: fe33995eb13f968ab0a5e05a8f713dfc9767df94f585cc73980780562e0bc97d
generated_at: 2026-10-29T03:12:56.980963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/emails.ts

## Purpose
Defines the two email content builders for API-key lifecycle events — one sent when a credential is minted, one when credentials are revoked. Each function resolves i18n strings into a finished `EmailContent` object; the file itself never sends mail or touches secrets.

## Key elements
- **`KeysRevokedReason`** (type) — Union of `SessionsRevokedReason` (from the account module) and `'authenticator-removed'`, representing the possible triggers for a bulk revocation.
- **`apiKeyMintedEmail`** — Returns an `EmailContent` for template `api-keys.minted`. Accepts locale, key name, public display id, and pre-formatted expiry; interpolates only display values into the body.
- **`apiKeysRevokedEmail`** — Returns an `EmailContent` for template `api-keys.revoked`. Accepts locale, revocation reason, and a list of credential labels; selects the body string via a `body-${reason}` i18n key and joins the credential list into a single line.

## Relationships
- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type used as the return type of both builders.
- **`@infrastructure/i18n`** — Imports `translator` to produce the per-locale translation function (`t`) used inside every field.
- **`@modules/account`** — Imports `SessionsRevokedReason` to compose `KeysRevokedReason`.
- **`src/modules/api-keys/index.ts`** — Barrel file that re-exports this module's public surface to the rest of the codebase.
- **`src/modules/api-keys/services/api-keys.ts`** — Upstream caller that invokes these builders and passes the result to the mailer.
- **`src/modules/api-keys/tests/unit/emails.test.ts`** — Unit tests for both builders.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Verifies the mailer templates (`api-keys.minted`, `api-keys.revoked`) referenced by the `template` field.

## Notes
- The file is deliberately side-effect free: it only *builds* content; sending is the mailer adapter's job.
- The i18n convention here (and in the parallel `account/emails` file) is: language is passed in as a plain string argument, and the output is fully-resolved text — no deferred lookups at render time.
- `apiKeyMintedEmail` intentionally excludes any secret key material or action links; the credential parameter is a public display id only.
- The revoked email's body key is dynamic (`api-keys.email-revoked.body-${reason}`), so adding a new `KeysRevokedReason` member requires a matching i18n key or the body will be empty at runtime.
