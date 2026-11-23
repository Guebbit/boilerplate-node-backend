---
source: src/modules/sitemap/controllers/send-xml.ts
source_sha256: b39b0d769a8c77624159f806f88bda4d604d78bb671c806514f2222ca1b391c5
context_sha256: caf09b4a1f2247091236bf55ed3a23dc3c4ac3124296fbb19e233114afe22924
generated_at: 2026-11-22T07:48:39.528712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/sitemap/controllers/send-xml.ts

## Purpose
Shared helper that every sitemap controller uses to send its XML output. It streams a list of entries through an XML writer into the Express response and sets one-hour public caching.

## Key elements
- `sendXml(response, entries, writer): void` is the only export.
  - It sets the status to 200, the content type to `application/xml`, and `Cache-Control` to `public, max-age=3600`.
  - It then runs Node's `pipeline(Readable.from(entries), writer, response, cb)`.
  - `entries` is a `readonly (object | string)[]`.
  - `writer` is a `SitemapStream` or a `SitemapIndexStream` from the `sitemap` package, depending on the kind of file.
- `CACHE_CONTROL` is a private constant holding the caching header value. The comment says sitemaps change with the catalogue, not per request.

## Relationships
- `@infrastructure/adapters/logger` provides `logger`. It is used in the pipeline callback to `warn` with the message `sitemap stream aborted` and the error.
- The sitemap controllers `get-sitemap-index.ts`, `get-sitemap-pages.ts` and `get-sitemap-products.ts` are neighbors in the dependency graph. They are the intended callers, since the module doc calls this the one way every sitemap file leaves. The file itself does not show how they call it.

## Notes
- `pipeline` handles backpressure. It also destroys all streams if one fails or the client disconnects.
- Headers are sent before streaming starts, so a mid-stream failure cannot change the response status. The error callback only logs it.
- The function returns `void` and does not wait for the stream to finish. Errors are never thrown to the caller.
