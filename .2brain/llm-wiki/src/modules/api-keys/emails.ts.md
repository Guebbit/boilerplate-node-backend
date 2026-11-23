---
source: src/modules/api-keys/emails.ts
source_sha256: fe33995eb13f968ab0a5e05a8f713dfc9767df94f585cc73980780562e0bc97d
context_sha256: 0fa59fa9480c8b517205239c7bc4e0ed8f5d57ebf8a3ea2491e019ecb6d97098
generated_at: 2026-11-22T04:21:21.207265+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/emails.ts

## Purpose
Builds the content of the two emails the api-keys module sends, as finished strings. Following the same rule as `@modules/account/emails`, the locale is passed in as an argument, the output is final text, and the mail template only interpolates it. The two mails are a notice to whoever just minted a credential, and a notice that their credentials were revoked because the account may be compromised.

## Key elements
- `KeysRevokedReason`: type, `SessionsRevokedReason | 'authenticator-removed'`. It says why a person's keys were revoked wholesale: their sessions were ended, or their staff authenticator app was removed.
- `apiKeyMintedEmail(locale, keyName, credential, expires)`: returns an `EmailContent` using the `api-keys.minted` template. It is sent as soon as a credential is created, so a stolen session that mints a key is not silent. The body interpolates the key name, the credential's public display id and the pre-formatted expiry. It carries no secret and no acting link.
- `apiKeysRevokedEmail(locale, reason, credentials)`: returns an `EmailContent` using the `api-keys.revoked` template. The body text is chosen by the translation key `api-keys.email-revoked.body-${reason}`. `credentials` (one "label and display id" line each) is joined with `", "` into `list`.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: supplies the `EmailContent` type that both functions return. The `template` names and `data` fields in the returned objects feed the mailer's templates, which `tests/unit/infrastructure/adapters/mailer-templates.test.ts` covers.
- `src/infrastructure/i18n/index.ts`: supplies `translator(locale)`, used to resolve every subject and body string.
- `src/modules/account/index.ts`: supplies the `SessionsRevokedReason` type, which `KeysRevokedReason` extends. The `revocation.ts` neighbor is in the same account domain.
- `src/modules/api-keys/services/api-keys.ts`: the service layer that sends these mails (inferred from the graph, not visible in this file).
- `src/modules/api-keys/tests/unit/emails.test.ts`: unit tests for these builders.

## Notes
- The functions only build content and send nothing. Callers pass `expires` already formatted and `locale` as the recipient's own locale.
- The `body-${reason}` key is built dynamically, so each `KeysRevokedReason` value needs a matching translation entry.
- `credential` is the public display id only, never the secret.
