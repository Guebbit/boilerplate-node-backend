---
source: src/modules/sitemap/controllers/send-xml.ts
sha256: b39b0d769a8c77624159f806f88bda4d604d78bb671c806514f2222ca1b391c5
generated_at: 2026-10-29T05:53:36.514690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/send-xml.ts

## Purpose

Single shared output path for every sitemap file. Given a set of entries and the appropriate `sitemap` XML stream writer, it streams the result into an Express response with a 1-hour public cache header, guaranteeing consistent headers, backpressure handling, and cleanup across all sitemap endpoints.

## Key elements

- **`sendXml`** (exported) — The sole export. Accepts an Express `Response`, a readonly array of entries, and a `SitemapStream | SitemapIndexStream` writer. Sets `200`, `Content-Type: application/xml`, and `Cache-Control: public, max-age=3600`, then pipes `Readable.from(entries) → writer → response` via Node's `pipeline`. On stream error (which can only happen after headers are flushed) it logs a warning.
- **`CACHE_CONTROL`** — Module-level constant (`'public, max-age=3600'`) applied to every response. Sitemaps change with catalogue updates, not per-request, so a fixed 1-hour TTL is used.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports the shared `logger`; used in the `pipeline` callback to record stream-abort errors.
- **`src/modules/sitemap/controllers/get-sitemap-index.ts`** — Calls `sendXml` with a `SitemapIndexStream` writer to produce the top-level sitemap index file.
- **`src/modules/sitemap/controllers/get-sitemap-pages.ts`** — Calls `sendXml` with a `SitemapStream` writer for the pages sitemap.
- **`src/modules/sitemap/controllers/get-sitemap-products.ts`** — Calls `sendXml` with a `SitemapStream` writer for the products sitemap.

## Notes

- `Readable.from(entries)` wraps a static array in a stream so it composes with the `sitemap` writer (which expects a `Readable`). No actual backpressure benefit for in-memory arrays, but the pattern keeps all three call-sites identical.
- The `pipeline` callback fires only after headers have been sent, so error recovery is limited to logging — this is intentional and documented in the inline comment.
- `entries` is typed as `readonly (object | string)[]`, accepting both the shape `SitemapStream` writes (`{ url, lastmod, … }`) and the simpler index format.
