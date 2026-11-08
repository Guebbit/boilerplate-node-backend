---
source: src/modules/api-keys/tests/unit/emails.test.ts
sha256: 1563eea27c57f0158cecffc826f0796ccc5bf8beaac2fe3b3cb35da48575581c
generated_at: 2026-11-08T05:07:02.074806+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/emails.test.ts

## Purpose

Unit tests that verify the two API-key notification emails (`minted` and `revoked`) are fully populated with the correct content for the recipient's language, and that the revoked notice explicitly names the security event that triggered the revocation.

## Key elements

- **`describe('the minted notice')`** — single test calling `apiKeyMintedEmail('en', …)` and asserting the template name (`api-keys.minted`), subject line, and every field in `mail.data` (locale, pageMetaTitle, greeting, body, advice, non-empty footer).
- **`describe('the revoked notice')`** — `it.each` over three revocation reasons (`logout-all`, `password-reset`, `email-change-undo`), calling `apiKeysRevokedEmail('en', reason, keys[])` and asserting the reason-specific body string, the comma-joined `list`, template name (`api-keys.revoked`), subject, and non-empty footer.
- **Imports** — `apiKeyMintedEmail`, `apiKeysRevokedEmail` from `../../emails`.

## Relationships

- **`src/modules/api-keys/emails.ts`** — the sole subject under test; this file imports and invokes both exported email builders, asserting on the shape and content of the objects they return.

## Notes

- Only the `'en'` locale is exercised here; no i18n matrix test is present in this file.
- Assertions use `toMatchObject` (partial structural match) for `mail.data` rather than deep equality, so extra fields in the data object won't cause failures.
- The footer is checked only for being a non-empty string; its exact copy is not asserted.
- The module doc comment states the two invariants under test verbatim (full content in the recipient's language; revoked notice names the event), serving as an informal spec alongside the test cases.
