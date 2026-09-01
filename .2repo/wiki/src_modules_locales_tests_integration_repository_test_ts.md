# src/modules/locales/tests/integration/repository.test.ts

## Purpose

Integration tests for the locale repository and service write paths, run against a real MongoDB instance. They verify behaviors that an in-memory fake would satisfy by construction: the revision counter moving (and moving exactly once) on each write path, cascade deletion across two collections, import semantics (replace vs. merge), and key-collision rules. No HTTP or auth is involved.

## Key elements

- **`givenLanguage`** – helper that creates a locale via `localeRepository.create` and optionally seeds entries via `localeMessageRepository.create`. Returns the created language document.
- **`givenEntry`** – helper that writes a single entry for a specific tenant, bypassing the service layer.
- **`revisionOf`** – reads the current `revision` counter for a language tag; returns `-1` if the language is absent.
- **`describe('the revision counter')`** – six tests asserting the revision increments on add / edit / remove / import, does *not* increment on read, and does not leak into sibling languages.
- **`describe('importEntries')`** – tests for the `counts` return shape, `replace: true` deleting un-named rows, `replace: false` preserving them, empty-replace emptying the language, and cross-language isolation.
- **`describe('deleting a language')`** – tests that an active language is refused (409) with no side-effects, an inactive one cascades its entries, other languages are untouched, and an unknown tag yields 404.
- **`describe('readMessages')`** – verifies the nested-key tree shape and revision stamp in the response, and that an inactive language returns 404 indistinguishably from an unknown tag.
- **`describe('createEntry')`** – collision (409), prefix-ancestor collision (409), unsafe key like `__proto__.*` (422), and a non-ancestor shared prefix (`cart.title` vs `cart.titlebar`) which is allowed.
- **`describe('importEntries, through the service')`** – batch self-collision rejection (file truncated at this point).

## Relationships

- **`@modules/locales/fixtures`** – provides `makeLocale` and `makeLocaleEntry` factory functions used by every helper in this file.
- **`@modules/locales/repository`** – the primary SUT; `localeRepository` and `localeMessageRepository` are exercised directly for most cases.
- **`@modules/locales/services`** – `localeService` is used for service-level paths: `readMessages`, `searchEntries`, `deleteLanguage`, `createEntry`, `importEntries`.
- **`@modules/locales/model`** – `LocaleDocument` type imported for typing (visible in the import list).
- **`../unit/tenants.fixture`** – supplies the `BACKEND` / `FRONTEND` tenant string constants used throughout.
- **`@tests/setup-test-db`** – `setupTestDb()` is invoked at module top-level to provision a real Mongo before any test runs.

## Notes

- The file header calls these "unit tests in this repo's sense" despite living under `tests/integration/` — the distinction is the real-DB requirement, not HTTP or auth.
- `setupTestDb()` runs at import time (module scope), not inside a `beforeAll` hook.
- The revision-counter tests are deliberately split one-per-write-path so a regression in any single path is isolated; a single "writing bumps it" test would mask which path forgot.
- The replace/merge pair in `importEntries` is asserted as two adjacent tests on purpose: either assertion alone would still pass against an implementation that ignores the `replace` flag.
- The inactive-language 404 in `readMessages` is a security-adjacent assertion: the response must be byte-identical to an unknown tag so an anonymous caller cannot probe which drafts exist.
- The `__proto__.*` key returns **422** (not 409) intentionally — a collision says "something else is there," an unsafe key says "the key itself is broken," and the client must fix them differently.
