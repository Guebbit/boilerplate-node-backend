---
source: src/modules/locales/tests/contract/api.contract.test.ts
sha256: 5e679811d5683dc116c0e2070fb2ea700cd89ea867d4df256d2136a57272f151
generated_at: 2026-10-15T10:47:16.055351+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/locales` API surface (list, per-locale dictionary, per-locale message tree, and language creation). The central invariant under guard is the **two-tier boundary**: a language existing in the database (client-side, downloadable) must never imply the API can serve its own copy in that language (server-side, file-based). The tests are written so that collapsing those tiers fails here rather than surfacing as a client bug.

## Key elements

- **`createEntry`** — local helper that POSTs a single key/value pair to `/locales/:tag/apps/:app/entries` and returns the new entry's id; throws on any non-201.
- **`describe('GET /locales')`** — asserts the public manifest matches `listSupportedLocales()`, reports `default`/`fallback` from i18n, shows database-only languages with `source: 'dynamic'` and only client apps, merges both tiers into one row with `source: 'both'`, exposes `entryCount`/`revision`, and hides inactive languages.
- **`describe('GET /locales/:locale')`** — asserts the returned `messages` contain both the shared JSON file (e.g. `it.json`) and at least one module-contributed namespace; 404s for unknown or database-only locales; path-traversal guard for encoded `..` / absolute-path attempts.
- **`describe('GET /locales/:locale/messages')`** — asserts the nested key tree a client merges, the `revision` field, empty-object for zero entries, public access, and 404 parity between inactive and unknown tags.
- **`describe('POST /locales')`** — asserts 201 on success, 409 on duplicate tag, 422 on invalid tag format and on whitespace-only `name`/`nativeName` (regression from a fuzz-suite finding), trimming of display names, and 401 for unauthenticated callers.

## Relationships

- **`tests/support/contract.ts`** — imported as `@tests/contract`; likely registers shared contract-test assertions or schema-match helpers that each "matches the contract" case relies on.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top to prepare a clean in-memory database for the suite.
- **`tests/support/http.ts`** — provides `api()` (HTTP client bound to the test server) and `authenticateAs()` (admin bearer token) used throughout.
- **`tests/support/ids.ts`** — exports `MISSING_ID`, used for negative-path assertions.
- **`src/modules/locales/tests/contract/support.ts`** — provides `createLanguage(bearer, overrides?)` and the `PORTUGUESE` payload constant shared with other contract tests in this directory.
- **`src/infrastructure/i18n/index.ts`** (re-exporting `catalog.ts` and `context.ts`) — source of `listSupportedLocales`, `getDefaultLocale`, `getFallbackLocale`, and the `translator` instance; the tests compare API responses against these values to pin the server-side tier.

## Notes

- The file imports `itTranslation` directly from `src/locales/it.json` (via a relative path) to compare the shared-key subset of the per-locale endpoint; module-contributed namespaces are asserted *by exclusion* from that set rather than by name, so the test stays valid as modules are added/removed.
- The whitespace-only `name`/`nativeName` case is a **regression test** for a fuzz-suite finding: JSON Schema cannot express "non-empty after trim," so the controller performs the check; the test documents *why* the check lives in the controller.
- Path-traversal cases use encoded sequences (`..%2F..%2Fpackage`, `%2Fetc%2Fpasswd`) because Express normalises literal `..` before routing; the test comments note this is the realistic attack shape.
- `MISSING_ID` is imported but may only be exercised in truncated portions of the file (e.g. negative-path tests for `PATCH`/`DELETE` endpoints not shown here).
- The suite is explicitly **public-read**: several tests assert 200 without an `Authorization` header, encoding the requirement that the locale manifest is available to unauthenticated clients.
