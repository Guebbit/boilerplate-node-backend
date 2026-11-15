---
source: src/kernel/middlewares/locale-preview.ts
sha256: fd3af33883535d9a18370203a75db4564be0f621ae982f89cbaf8882f8b4eadf
generated_at: 2026-11-14T18:22:19.188179+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/locale-preview.ts

## Purpose

Express middleware that lets an authenticated staff member preview product copy in a draft (switched-off) language. If the caller's first `Accept-Language` entry names a draft locale and the caller has draft-read permission, the request is re-bound to that locale for the downstream handlers; everyone else falls through untouched.

## Key elements

- **`previewDraftLanguage(request, response, next)`** — the sole export. Reads the best-preferred language via `request.acceptsLanguages().at(0)`, resolves it to a draft through `draftLocaleFor`, and verifies permission with `canPreviewDraftLanguages(request.caller)`. When all three conditions are met it:
  - creates a preview context (`createPreviewContext`),
  - overwrites `request.locale` and `request.t`,
  - sets the `Content-Language` response header,
  - calls `markDraftPreview(response)` to force `private, no-store`,
  - invokes `next()` inside `runWithLocaleContext(context, …)`.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — imports `markDraftPreview`, which stamps the response so the cache layer skips storage/serving of the draft content.
- **`src/infrastructure/i18n/index.ts`** (barrel) — imports `createPreviewContext`, `draftLocaleFor`, and `runWithLocaleContext`; these encapsulate the locale-switching and context-propagation mechanics.
- **`src/kernel/translation.ts`** — provides `canPreviewDraftLanguages`, the permission check that gates the preview path.
- **`src/modules/products/routes.ts` / `src/modules/example/routes.ts`** — mount `previewDraftLanguage` per router, positioned after the auth middleware and before the cache middleware.
- **`tests/unit/kernel/locale-preview.test.ts`** — unit tests covering the pass-through and re-bind paths.

## Notes

- Mounting order matters: it must run **after** auth (so the caller is available) and **before** `setCache` (so the cache key reflects the overridden locale).
- Only the **first** `Accept-Language` range is considered; a draft language appearing later in the list (e.g. at a lower `q` value) is intentionally ignored.
- When the draft check fails the middleware is a no-op `next()` — it never throws or short-circuits the request for non-preview callers.
- `request.locale === draft` is an early-exit guard: if the request is already bound to that locale, no re-binding or context swap occurs.
