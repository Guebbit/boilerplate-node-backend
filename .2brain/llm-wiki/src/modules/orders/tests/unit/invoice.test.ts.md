---
source: src/modules/orders/tests/unit/invoice.test.ts
sha256: e4265612562a95fe3b50f7e5e1a32cff02526bc99f2216181dff8e85a9cffad5
generated_at: 2026-09-23T19:13:59.168158+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/invoice.test.ts

## Purpose

Unit tests for the invoice-rendering service (`services/invoice.ts`). Covers locale-frozen rendering, the not-found and failed-render paths, the TTL disk cache (hit, miss, expiry, negative-case), single-flight collapsing of concurrent misses, and the two reap sweeps. A final describe block (historically co-located here) exercises the upload chain's locale re-entry after multer consumes the stream.

## Key elements

- **`escaped(value)`** — HTML-escapes a string to mirror EJS `<%= %>` output; used in every `toContain` expectation so test strings match what the template actually emits.
- **`renderHtmlToPdfMock`** — Jest mock for `@infrastructure/adapters/pdf.renderHtmlToPdf`; resolves to a `Buffer` by default, rejects on demand.
- **`findByIdRawMock` / `existingIdsMock`** — Jest mocks for `orderRepository` methods; the primary way tests shape the order under test.
- **`ttlMinutesMock`** — Stand-in for `invoiceCacheTtlMinutes()`; defaults to `0` (matching `NODE_ENV=test`) and is overridden to `5` only inside the TTL-cache describe block.
- **`renderedHtml()`** — Reads the first argument passed to `renderHtmlToPdfMock` so tests can assert on the HTML handed to the (mocked) PDF engine.
- **`orderFixture(locale?)`** — Returns a minimal order shape (`items: [{ product, quantity, locale }]`) for `findByIdRaw` to resolve.
- **`fileExists(target)`** — `stat`-based boolean check used to prove cache writes/deletes landed on disk.
- **`withCacheRoot()`** — `beforeEach`/`afterEach` pair that creates a `mkdtemp` directory, sets `NODE_INVOICE_CACHE_PATH`, and tears it down. Exposes `root()` and `pathFor(orderId)`.
- **Describe: "renders in its OWN frozen locale"** — Italian vs English rendering, ambient-locale independence, empty-items fallback, title interpolation, null-order → `undefined`, render rejection propagation, and the TTL-0 no-disk-write guarantee.
- **Describe: "single-flight"** — Two concurrent misses for the same order produce exactly one render; different orders render independently; a settled render does not block a subsequent call.
- **Describe: "the TTL cache"** — Fresh hit short-circuits DB + Chromium; miss writes a file; expired (backdated via `utimes`) file is re-rendered; null order writes nothing. _(Further cases truncated.)_

## Relationships

- **`src/infrastructure/i18n/index.ts`** (barrel) — Import source for `runWithLocale`, `getLocaleContext`, `getDefaultLocale`; the test uses `runWithLocale('en', …)` to prove the order's frozen locale overrides the ambient one, and `getDefaultLocale()` for the empty-items fallback assertion.
- **`src/infrastructure/i18n/context.ts`** — Implementation of the locale-context functions imported above.
- **`src/infrastructure/i18n/catalog.ts`** — Provides the locale resolution the renderer depends on; the test's `en.json` / `it.json` imports and `escaped(itOrders.orders.invoice.title)` assertions verify the catalog values actually reach the rendered HTML.
- **`tests/support/stub.ts`** — Source of the `asStub` helper (imported at top; used in the truncated portion of the file).

## Notes

- **TTL mock is load-bearing.** `invoiceCacheTtlMinutes()` is forced to `0` under `NODE_ENV=test` by design (asserted separately in `config.test.ts`). Without the `ttlMinutesMock` override, the cache-specific tests would never exercise the non-zero branch. Every describe block except the TTL one relies on the default `0`.
- **`invoiceCachePath()` is intentionally _not_ mocked.** The cache directory is controlled purely by the `NODE_INVOICE_CACHE_PATH` env var set in `withCacheRoot()`, keeping the path-resolution logic under test.
- **Single-flight test runs at TTL 0.** The comment explains: at TTL 0, `renderInvoicePdf` reaches `renderFreshOnce` synchronously with no `readCached` `stat` gap, making two back-to-back calls deterministic rather than racing real filesystem calls.
- **Dynamic `await import('../../services/invoice')`** inside each test resets the module's in-memory state (single-flight map, etc.) between cases.
- **EJS escaping.** The `escaped()` helper is not a shortcut — it mirrors the exact `<%= %>` escape set (`&`, `<`, `>`, `"`, `'`). Loosening the template to `<%- %>` is explicitly rejected.
- **Historical co-location.** The final describe block (upload-chain locale re-entry) is unrelated to invoice rendering and lives here for historical reasons, per the file-header comment.
