---
source: src/modules/api-keys/tests/unit/emails.test.ts
source_sha256: 1563eea27c57f0158cecffc826f0796ccc5bf8beaac2fe3b3cb35da48575581c
context_sha256: bd2283b9a120d973523db44692a78c808ad5f0dab95784cd98c980ae0058e0a0
generated_at: 2026-11-22T04:25:52.347863+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/api-keys/tests/unit/emails.test.ts

## Purpose
Unit tests for the two notice emails built by the api-keys module: the "minted" notice and the "revoked" notice. They check that every part of the content is present in the recipient's locale and that the revoked notice names the event that caused it.

## Key elements
- **`the minted notice` test**: calls `apiKeyMintedEmail('en', 'partner', 'abc123', '1 January 2031')`. It asserts:
  - template `api-keys.minted`
  - subject `An API key was created on your account`
  - `data` containing `locale`, `pageMetaTitle`, `greeting`, a `body` with the key name, public id and expiry date, and an `advice` line
  - a non-empty string `footer`
- **`the revoked notice` tests**: a parameterised `it.each` over three reasons, calling `apiKeysRevokedEmail('en', reason, ['a (1)', 'b (2)'])`. Each reason has its own expected body:
  - `logout-all`
  - `password-reset`
  - `email-change-undo`
  
  Each case asserts:
  - template `api-keys.revoked`
  - subject `Your API keys were revoked`
  - `pageMetaTitle` `API keys revoked`
  - `list` equal to `'a (1), b (2)'` (the keys joined with a comma and space)
  - an `advice` line
  - a non-empty `footer`

## Relationships
- Imports `apiKeyMintedEmail` and `apiKeysRevokedEmail` from `src/modules/api-keys/emails.ts`, the only code under test. The tests check the returned objects (`template`, `subject`, `data`) and nothing else.

## Notes
- Only the `'en'` locale is exercised, despite the module docstring's mention of the recipient's language.
- Most `data` fields are matched with `toMatchObject` against exact English strings, so copy changes in `emails.ts` will break these tests.
- The `footer` is only checked to be a non-empty string, not for its exact text.
