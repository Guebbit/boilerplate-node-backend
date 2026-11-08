---
source: src/modules/sitemap/controllers/send-xml.ts
sha256: b39b0d769a8c77624159f806f88bda4d604d78bb671c806514f2222ca1b391c5
generated_at: 2026-11-08T08:22:18.617136+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/controllers/send-xml.ts

## Purpose

Single egress point for all sitemap files. Converts a collection of entries into a streamed XML response on Express, applying the correct content type and a shared cache policy, so that individual sitemap controllers (index, pages, products) don't each re-implement response plumbing.

## Key elements

- **`sendXml(response, entries, writer)`** — The sole export. Sets `200`, `application/xml`, and `Cache-Control: public, max-age=3600`, then pipes `entries` (via `Readable.from`) through the provided `sitemap`-package XML stream (`SitemapStream` or `SitemapIndexStream`) into the Express `response` using Node's `pipeline`.
- **`CACHE_CONTROL`** — Module-level constant (`'public, max-age=3600'`) encoding the one-hour public-cache contract for all sitemap outputs.
- **Error callback** — Because headers are already sent when a mid-stream error occurs, the only recovery is a `logger.warn` with the error object; no status override is possible.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `logger`; the only runtime dependency outside `node:stream` and the `sitemap` types. Used exclusively in the pipeline error callback.
- **`get-sitemap-index.ts` / `get-sitemap-pages.ts` / `get-sitemap-products.ts`** — Callers. Each builds its own `SitemapIndexStream` or `SitemapStream`, assembles the entry list, then delegates the actual write to `sendXml`. This file is the shared "last mile" they all converge on.

## Notes

- `entries` is typed `readonly (object | string)[]`, intentionally loose so it works with both index entries (URLs) and full page/product objects without a shared interface.
- The function returns `void` and does **not** return a Promise or call `response.end` itself; `pipeline` handles stream finalisation. Callers should not double-close the response.
- The hour-long cache is a deliberate choice (sitemap content changes with catalogue sync, not per-request) — do not shorten it without understanding the sync cadence.
