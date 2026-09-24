---
source: src/modules/orders/services/invoice.ts
sha256: e36ed43b89e2d054510f4bbedc629e392a6cb794bf71d8dcf41c43de00ba6162
generated_at: 2026-09-23T19:07:30.385343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/invoice.ts

## Purpose

Renders an order's invoice as a PDF on demand — a synchronous, request-scoped view, not a durable document with its own lifecycle. A disk-backed TTL cache and a per-process single-flight map in front of the Chromium render ensure a burst of requests for the same order costs one launch, not one per request. Also owns the cache's lifecycle: per-file deletion, orphan reaping, and TTL-based expiration.

## Key elements

- **`renderInvoicePdf(orderId)`** — Public entry point. Serves a cached PDF if fresh, otherwise renders via `renderFreshOnce` and writes the cache. TTL ≤ 0 skips disk entirely. Returns `undefined` for a missing order.
- **`deleteCachedInvoice(orderId)`** — Public. Removes one cached PDF by orderId. Never rejects; returns a boolean.
- **`reapOrphanedInvoices()`** — Public. Sweeps the cache directory, queries the repository for which orderIds still exist, and deletes files whose order is gone (including stale `.tmp` files).
- **`reapExpiredInvoices()`** — Public. Deletes every cached file whose mtime exceeds `invoiceCacheTtlMinutes()`.
- **`renderFresh(orderId)`** — Internal. DB read → EJS template → `renderHtmlToPdf` (Chromium). Does not touch the cache.
- **`renderFreshOnce(orderId)`** — Internal. Single-flight wrapper: concurrent callers for the same orderId share one render promise. Entry removed from the map on settle.
- **`readCached` / `writeCache`** — Internal. Disk-cache read (mtime vs. TTL) and atomic write (temp name → `rename`).
- **`ORDER_ID_PATTERN` / `TEMP_INVOICE_PATTERN`** — Regexes that identify valid cache filenames (24-hex ObjectId `.pdf` / `.tmp`).
- **`inFlightRenders`** — Module-level `Map<string, Promise<…>>` backing single-flight.
- **`invoicePdfPath(orderId)`** — Deterministic path under `invoiceCachePath()`.

## Relationships

- **`@infrastructure/adapters/pdf`** — `renderHtmlToPdf` performs the actual HTML→PDF (Chromium) conversion.
- **`@infrastructure/adapters/filesystem`** — `unlinkIfPresent` provides the safe, non-throwing file deletion used by `deleteCachedInvoice` and the reapers.
- **`@infrastructure/i18n`** — `getDefaultLocale` is the fallback when an order's items carry no locale.
- **`src/modules/orders/repository.ts`** — `orderRepository.findByIdRaw` supplies the order row; `orderRepository.existingIds` lets `reapOrphanedInvoices` check which orders are still alive.
- **`src/modules/orders/emails.ts`** — Provides `invoiceDocument` (builds the template data object) and the `InvoiceOrder` type.
- **`src/modules/orders/config.ts`** — `invoiceCachePath` (cache root) and `invoiceCacheTtlMinutes` (TTL; 0 disables caching).
- **`src/modules/orders/services/crud.ts`** — Its line-rewrite / hard-delete paths call `deleteCachedInvoice` to invalidate the cache.
- **`src/modules/orders/services/notify.ts`** — Documented in the module header as an upcoming consumer that will attach a rendered invoice to the placed-order email.
- **`src/modules/orders/services/index.ts`** — Barrel; re-exports the public functions of this module.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Unit test that exercises the pairing / identity logic surfaced by this module's exports.

## Notes

- **Locale is frozen, not dynamic.** The render locale comes from `items[0].locale` (the language product titles were resolved into at checkout), never from the viewer's request locale. An invoice records what was sold, in the language it was sold in.
- **TTL 0 = no disk.** When `invoiceCacheTtlMinutes()` returns 0 (demo, test, opt-out), the code path bypasses `readCached`/`writeCache` entirely and streams the buffer directly.
- **Atomic write via temp + rename.** `writeCache` writes to `<orderId>.<32-hex>.tmp` then `rename`s onto the final path. This prevents a concurrent reader from streaming a truncated PDF. A crash between the two steps leaves the `.tmp` behind; both reapers sweep it.
- **Single-flight is per-process only.** It collapses concurrent misses within one Node process. A second replica rendering the same invoice once is considered acceptable.
- **Reapers are additive, not destructive to foreign files.** Any filename that matches neither `ORDER_ID_PATTERN` nor `TEMP_INVOICE_PATTERN` is skipped, avoiding a `toObjectId` throw on unknown entries.
- **`deleteCachedInvoice` never rejects.** A missing file is indistinguishable from a successful no-op; callers should not branch on failure.
