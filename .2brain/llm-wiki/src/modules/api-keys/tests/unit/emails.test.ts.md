---
source: src/modules/api-keys/tests/unit/emails.test.ts
sha256: 1563eea27c57f0158cecffc826f0796ccc5bf8beaac2fe3b3cb35da48575581c
generated_at: 2026-10-15T10:21:24.705217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/emails.test.ts

## Purpose
Unit tests that verify both API-key notice emails (minted and revoked) carry a complete, correctly-worded payload in the recipient's language, and that the revoked notice names the specific event that triggered the revocation.

## Key elements
- **`describe('the minted notice')`** — single test asserting `apiKeyMintedEmail` returns the correct template ID, subject, and all data fields (locale, pageMetaTitle, greeting, body, advice, non-empty footer) for a key named "partner" with id "abc123" and expiry "1 January 2031".
- **`describe('the revoked notice')`** — parameterised via `it.each` over three revocation reasons (`logout-all`, `password-reset`, `email-change-undo`). For each, asserts that `apiKeysRevokedEmail` produces the matching body sentence, lists the supplied keys, and includes the standard template, subject, advice, and non-empty footer.
- Both tests import from `../../emails` and operate on the English (`'en'`) locale.

## Relationships
- **`src/modules/api-keys/emails.ts`** — the sole dependency; provides the two functions under test (`apiKeyMintedEmail`, `apiKeysRevokedEmail`).

## Notes
- Tests hard-code English strings (subject, body, advice) rather than comparing against i18n helpers, so they will break if copy changes even in a different locale.
- The `footer` field is only asserted to be a non-empty string — its content is intentionally left flexible.
- The revoked test's `it.each` tuples pair each reason with its *expected* body sentence; adding a new revocation reason requires a new tuple here.
- Only the `'en'` locale is exercised; other locales are untested.
