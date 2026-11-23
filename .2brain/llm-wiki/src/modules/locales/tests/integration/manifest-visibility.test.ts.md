---
source: src/modules/locales/tests/integration/manifest-visibility.test.ts
source_sha256: 7bacd2cac735f73499c4ee459538c134e2752a928703cfe66fad9ec3b903b956
context_sha256: 7bb92d9ce30aa802a840434711caa5d5edd1dcb37b5eb906de540acba6b3a56e
generated_at: 2026-11-22T05:50:08.674115+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/integration/manifest-visibility.test.ts

## Purpose
Integration test for `GET /locales` covering who the manifest offers a switched-off language to. A language with a deployed dictionary file is always among the supported ones, so dropping a switched-off row in the scoped read was not enough: the file-backed language still came back as `active: true`. The test asserts that every caller now sees it as `active: false`, so a client bundling the language itself can stop offering it, and that activating it flips it back to `true`.

## Key elements
- `setupTestDb()` — called at module level to prepare the test database.
- `manifestTags(bearer?)` — helper that calls `GET /locales` (optionally with an `Authorization` header), asserts status 200, and returns `[tag, active]` pairs from `response.body.locales`.
- Test: lists `it` as `['it', false]` for both an anonymous visitor and an admin, while `['en', true]` is present for the visitor.
- Test: after `POST /locales/it/activate` as admin (status 200), a visitor sees `['it', true]`.
- Test: a file-backed language with no row at all (`it`) is still listed as `['it', true]`.

## Relationships
- `../factories` — `givenLocale('it', { active: false })` creates the switched-off locale row.
- `tests/support/http.ts` — provides `api()` (HTTP request client) and `authenticateAs('admin')` (returns a `bearer` token).
- `tests/support/setup-test-db.ts` — provides `setupTestDb`, imported via the `@tests/setup-test-db` alias.

## Notes
- The tests rely on `it` having a deployed dictionary file and `en` being listed as active; neither is created in the test itself.
- The header comment also states that the sitemap, which lists only active languages, leaves the switched-off one out. This test does not exercise the sitemap.
