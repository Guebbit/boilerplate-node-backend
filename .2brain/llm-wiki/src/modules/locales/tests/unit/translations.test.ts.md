---
source: src/modules/locales/tests/unit/translations.test.ts
source_sha256: a57ac1028701155e39a1fd003455832e3cea5055faf0ccb52c66386de9ee2812
context_sha256: 580443921f310eb8dabb75d72c699bb1a5c4da78c9e89145b87c005e3c67b9a5
generated_at: 2026-11-22T05:52:10.535024+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/translations.test.ts

## Purpose
Unit tests for `deriveSourceDigest`, the pure (no database) part of the translation write path. Anything that touches the `locales`/`translations` collections or the registry is covered separately by Mongo-driven tests in `src/modules/locales/tests/integration/translations.test.ts`.

## Key elements
- `describe('deriveSourceDigest')` contains four tests, each checking a property of the digest computed over a map of source fields (for example `{ title, description }`):
  - **Key order does not matter.** The same fields in a different key order produce the same digest.
  - **Value changes matter.** Editing a value (`'Cuccia'` to `'Cuccia grande'`) changes the digest.
  - **Added keys matter.** Adding a key changes the digest even when its value is an empty string (`description: ''`).
  - **Determinism.** Two calls with identical content, one using a spread copy, return equal digests.

## Relationships
- Imports `deriveSourceDigest` from `src/modules/locales/repository.ts` and tests it directly. It does not mock or exercise any other part of the repository.

## Notes
- The digest is compared only for equality or inequality. The tests never check its format or length.
- The unit tests do not cover how the digest is used to detect stale translations. Per the header comment, the write path is covered in the integration test.
