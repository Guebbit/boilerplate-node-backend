---
source: src/modules/orders/services/invoice.ts
sha256: 5cb8135b60b6a44b8c297f82a64627d91266f3a34a9e3fddc2c46cabf7ec500d
generated_at: 2026-09-27T15:14:19.563979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/invoice.ts

## Purpose

Renders an order's invoice as a PDF on demand — a synchronous, request-scoped view rather than a durable entity with its own lifecycle. A TTL-backed file cache and a single-flight guard in front of the Chromium render prevent redundant launches during bursts of requests for the same order.

## Key elements

- **`renderInvoicePdf(orderId)`** — Public entry point. Serves a cached PDF if fresh, otherwise renders fresh (EJS template → Chromium PDF) and caches the result. Returns `undefined` if the order does not exist. A `0` TTL bypasses disk entirely.
- **`deleteCachedInvoice(orderId)`** — Removes a single order's cached PDF (used by the hard-delete path). Never rejects; returns whether a file was actually deleted.
- **`reapOrphanedInvoices()`** — Sweeps cached files whose `orderId` no longer resolves to a live order row. Called by `scripts/ops/reap-invoices.ts`.
- **`reapExpiredInvoices()`** — Sweeps cached files (including stale `.tmp` remnants) older than the configured TTL. Called by the same ops script.
- **`renderFreshOnce`** (internal) — Single-flight wrapper around `renderFresh`; collapses concurrent misses for the same `orderId` into one Chromium launch.
- **`writeCache`** (internal) — Writes to a per-write random `.tmp` name then atomically `rename`s to the deterministic `<orderId>.pdf` path, avoiding truncated reads from interleaved concurrent writes.
- **`INVOICE_TEMPLATE`** — Points at `shared/templates/documents/orders.invoice.ejs`; every render (cached or not) uses this single template.

## Relationships

- **`src/infrastructure/adapters/pdf.ts`** — Calls `renderHtmlToPdf` to turn rendered HTML into A4 PDF bytes (Chromium launch).
- **`src/infrastructure/adapters/filesystem.ts`** — Uses `unlinkIfPresent` for all file deletions (single-file and reaper paths).
- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** — Falls back to `getDefaultLocale()` when the order has no item-level locale.
- **`src/modules/orders/config.ts`** — Reads `invoiceCachePath()` (cache directory) and `invoiceCacheTtlMinutes()` (TTL / opt-out).
- **`src/modules/orders/emails.ts`** — Imports `invoiceDocument` (builds the EJS data context) and the `InvoiceOrder` type.
- **`src/modules/orders/repository.ts`** — Reads the order via `findByIdRaw` for rendering; checks `existingIds` during orphan reaping.
- **`src/modules/orders/services/crud.ts`** — Hard-delete path calls `deleteCachedInvoice` as cleanup.
- **`src/modules/orders/services/notify.ts`** — Documented as a planned consumer: will attach a rendered invoice to the placed-order email.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** — Exercises the pairing/identity logic that this module's naming conventions depend on.

## Notes

- **Locale is frozen, not dynamic.** The render uses `items[0].locale` (the language product titles were resolved into at checkout), never the viewer's request locale. An invoice is a record of what was sold, in the language it was sold in.
- **TTL `0` disables the cache entirely.** The render streams straight from the buffer with no disk I/O — used in demos, tests, or deployments that opt out.
- **Single-flight is per-process only.** It does not coordinate across replicas; a second node may render the same invoice independently. This is intentional (analogous to nginx `proxy_cache_lock` / Varnish collapsing).
- **Temp-file cleanup is the reapers' job.** A `.tmp` file left by a crash between `writeFile` and `rename` is indistinguishable from a finished `.pdf` by name alone; both `reapOrphanedInvoices` and `reapExpiredInvoices` sweep it via `TEMP_INVOICE_PATTERN`.
- **`deleteCachedInvoice` is the only public delete-by-orderId.** The internal `deleteCacheFile` operates on bare filenames and is the primitive the reapers use — it can reach a stale `.tmp` that no `orderId` alone would resolve.
