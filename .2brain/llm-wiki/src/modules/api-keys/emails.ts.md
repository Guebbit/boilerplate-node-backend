---
source: src/modules/api-keys/emails.ts
sha256: 3cf6c215c3055cebd1e1eb5c014d9cecd4bbdd1ad5612308aac5f9cc4cefdd51
generated_at: 2026-10-14T14:58:25.398392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/emails.ts

## Purpose

Produces the two transactional emails the API-keys module sends to a user: a notification when a credential is minted, and a notification when all of the account's credentials are revoked. Every string is resolved to finished text at call time via the i18n translator; the function's sole job is to assemble a typed `EmailContent` object for the mailer.

## Key elements

- **`apiKeyMintedEmail(locale, keyName, credential, expires)`** — Returns an `EmailContent` for template `api-keys.minted`. Interpolates the caller-chosen key name, the public display ID, and a pre-formatted expiry into the body. Carries no secret and no actionable link.
- **`apiKeysRevokedEmail(locale, reason, credentials)`** — Returns an `EmailContent` for template `api-keys.revoked`. The body i18n key is dynamic (`api-keys.email-revoked.body-${reason}`), so the i18n catalog must contain a distinct entry per `SessionsRevokedReason` value. Joins the caller-supplied `readonly string[]` of credential labels into a single comma-separated list.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides the `EmailContent` type that both functions return; the mailer adapter consumes that shape to render and dispatch.
- **`src/infrastructure/i18n/index.ts`** — Exports `translator(locale)`, the function used to resolve every string in both emails.
- **`src/modules/account/index.ts`** — Re-exports `SessionsRevokedReason`, the union type accepted by `apiKeysRevokedEmail`.
- **`src/modules/account/domain/revocation.ts`** — Likely origin of the `SessionsRevokedReason` values; each value maps to a dedicated i18n body key in this file.
- **`src/modules/api-keys/services/api-keys.ts`** — Upstream caller that formats the display ID / expiry strings and invokes these functions before handing the result to the mailer.
- **`src/modules/api-keys/tests/unit/emails.test.ts`** — Unit tests covering both email builders.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates that the `api-keys.minted` and `api-keys.revoked` templates render correctly against the data shape produced here.

## Notes

- **Dynamic body key in the revoked email.** Because the i18n key is built with a template literal (`body-${reason}`), adding a new `SessionsRevokedReason` variant *requires* a matching translation key; the build won't fail otherwise.
- **Caller pre-formats all values.** `credential`, `expires`, and each entry in `credentials` are already human-readable strings by the time they reach this file. No formatting logic lives here.
- **Mirrors `@modules/account/emails`.** The module doc explicitly states it follows the same conventions (locale-as-argument, finished-text output, template-only interpolation). Changes to one should be checked against the other.
