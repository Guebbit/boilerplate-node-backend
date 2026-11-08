---
source: src/modules/api-keys/emails.ts
sha256: fe33995eb13f968ab0a5e05a8f713dfc9767df94f585cc73980780562e0bc97d
generated_at: 2026-11-08T05:02:24.937567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/emails.ts

## Purpose

Resolves the finished, localized text for the two emails the API-keys module sends: one when a credential is minted (to alert the owner of a potentially stolen session) and one when credentials are revoked wholesale (to tell the owner what stopped working). Functions return fully interpolated strings; they never render HTML themselves.

## Key elements

- **`KeysRevokedReason`** (type) — Union of `SessionsRevokedReason` and the literal `'authenticator-removed'`; determines which i18n body copy the revocation email uses.
- **`apiKeyMintedEmail(locale, keyName, credential, expires)`** — Returns an `EmailContent` object (template `api-keys.minted`) carrying subject, greeting, body, advice, and footer, all translated via the provided locale.
- **`apiKeysRevokedEmail(locale, reason, credentials)`** — Returns an `EmailContent` object (template `api-keys.revoked`) whose body is selected per-reason (`api-keys.email-revoked.body-${reason}`) and includes a comma-joined list of revoked credential labels.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Imports `translator` to produce a locale-bound `t` function for every string in the email.
- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` type that both exported functions return; the `template` field references a handlebars template owned by that adapter.
- **`src/modules/account/index.ts`** — Source of the `SessionsRevokedReason` type (itself defined in `domain/revocation.ts`) used to form `KeysRevokedReason`.
- **`src/modules/api-keys/services/api-keys.ts`** — The service layer that calls `apiKeyMintedEmail` / `apiKeysRevokedEmail` when the corresponding domain events occur.
- **`src/modules/api-keys/tests/unit/emails.test.ts`** — Unit tests exercising both functions' output shape and i18n interpolation.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates the handlebars templates (`api-keys.minted`, `api-keys.revoked`) that consume the `data` fields produced here.

## Notes

- The module follows the same convention as `@modules/account/emails`: language is a parameter, output is finished text; templates only interpolate the provided values.
- `apiKeyMintedEmail` deliberately carries **no secret and no actionable link** — only the caller-chosen label and a public display id.
- The revocation email's body key is dynamic (`body-${reason}`); adding a new `KeysRevokedReason` member requires a matching i18n key or the call will fail at runtime.
- `credentials` in the revocation email is pre-joined to a comma-separated string by the caller; the function does not iterate or format them.
