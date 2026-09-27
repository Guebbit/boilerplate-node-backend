---
source: src/modules/orders/tests/unit/invoice.test.ts
sha256: a1582d2754dcfe9fca2d41941070c607822494adc029233d4e56f5f043d77558
generated_at: 2026-09-27T15:21:33.095744+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/invoice.test.ts

## Purpose

Unit tests for the invoice PDF render pipeline (`services/invoice.ts`). Covers locale-frozen rendering, the not-found and failed-render paths, the TTL disk cache, single-flight deduplication, and the two reap sweeps (`reapOrphanedInvoices` / `reapExpiredInvoices`). A trailing describe block also pins an unrelated historical concern: the upload chain re-entering the request locale after multer consumes the stream mid-request.

## Key elements

- **`escaped(value)`** — local helper that replicates EJS `<%= %>` HTML-escaping so test expectations match what the template actually emits.
- **`renderHtmlToPdfMock` / `findByIdRawMock` / `existingIdsMock`** — module-level Jest mocks for the PDF adapter and the order repository, set up via `jest.mock` factories.
- **`ttlMinutesMock`** — mocks `invoiceCacheTtlMinutes()` (returns `0` by default to mirror the real test-env rule); individual blocks override it to `5` to reach the non-zero cache branch.
- **`orderFixture(locale?)`** — minimal order shape (`items: [{ product, quantity, locale }]`) returned by the repository mock.
- **`withCacheRoot()`** — `beforeEach`/`afterEach` helper that creates a `mkdtemp` directory, points `NODE_INVOICE_CACHE_PATH` at it, and tears it down. Exposes `root()` and `pathFor(orderId)`.
- **`describe` blocks** — frozen-locale rendering, single-flight collapse, TTL cache (hit / miss / expiry / not-found / atomic-write), and the multer-locale re-entry case.

## Relationships

- **`@infrastructure/i18n`** (via `index.ts` barrel → `context.ts`): imports `runWithLocale`, `getLocaleContext`, `getDefaultLocale`. Tests call `runWithLocale('en', …)` to verify the ambient locale is ignored in favor of the order's frozen locale, and assert `<html lang="…">` against `getDefaultLocale()`.
- **`@infrastructure/i18n`** (via `catalog.ts` / locale JSON): imports `enOrders` and `itOrders` from `../../locales/*.json` to build expected strings for `escaped()` comparisons.
- **`tests/support/file-sandbox.ts`**: imports `fileExists` to assert whether a cache file is present or absent on disk without reading its content.
- **`tests/support/stub.ts`**: imports `asStub` (used in the truncated trailing section for the multer/locale re-entry test).

## Notes

- **TTL is always `0` in a real test run** (enforced by `NODE_ENV=test`, asserted separately in `config.test.ts`). The only way to exercise the non-zero cache branch is the `ttlMinutesMock` override; every block other than the cache `describe` keeps it at `0`.
- **EJS escaping is intentional.** Templates use `<%= %>` (escaped) for user-supplied titles. Test expectations must run through `escaped()`; do not "fix" this by switching templates to `<%- %>`.
- **Single-flight test deliberately runs at TTL 0.** This forces the synchronous `renderFreshOnce` path with no `readCached`/`stat` gap, making two back-to-back calls deterministic rather than racing two real filesystem `stat` calls.
- **`NODE_INVOICE_CACHE_PATH`** (not a code-level constant) controls the cache directory per block. `withCacheRoot()` saves and restores the env var; `invoiceCachePath()` itself is left unmocked.
- **Atomic-write pinning.** The TTL-cache block includes a test (partially truncated) that verifies the cache write lands under the final name via `rename` rather than a direct `writeFile`, preventing a concurrent reader from seeing a truncated file.
- **The trailing describe block is a historical holdover.** It tests the upload/locale chain, not invoice rendering, but lives in this file by convention rather than by concern.
