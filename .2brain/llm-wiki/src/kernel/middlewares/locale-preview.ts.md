---
source: src/kernel/middlewares/locale-preview.ts
generated_at: 2026-11-22T03:13:16.243112+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/middlewares/locale-preview.ts

## Purpose
Express middleware that lets staff preview a draft (switched-off) language's product text. When the caller's first `Accept-Language` choice is a draft language and they are allowed to read drafts, the request is re-bound to that language and the response is marked uncacheable. Everyone else keeps the live locale already chosen earlier, with no error.

## Key elements
- `previewDraftLanguage(request, response, next)`: the only export. Steps:
  - Resolves the first `Accept-Language` range (`request.acceptsLanguages().at(0)`) to a draft locale via `draftLocaleFor`.
  - Calls `next()` unchanged if there is no draft, if `request.locale` already equals it, or if `canPreviewDraftLanguages(request.caller)` is false.
  - Otherwise builds a context with `createPreviewContext(draft)` and sets `request.locale` and `request.t` from it.
  - Sets the `Content-Language` header to the draft and calls `markDraftPreview(response)`.
  - Calls `next` inside `runWithLocaleContext(context, next)`, so downstream code runs under the preview locale context.

## Relationships
- `src/infrastructure/i18n/index.ts` (and its `context.ts` / `served.ts` modules): supplies `draftLocaleFor`, `createPreviewContext` and `runWithLocaleContext`.
- `src/kernel/translation.ts`: supplies `canPreviewDraftLanguages`, the permission check (`display:Locale`, asked through the translation port).
- `src/infrastructure/http/middlewares/cache.ts`: supplies `markDraftPreview`, which makes the answer `private, no-store`. `setCache` builds its key from `request.locale`, so this middleware must run before it.
- `src/modules/products/routes.ts` and `src/modules/example/routes.ts`: mount it per router.
- `tests/unit/kernel/locale-preview.test.ts`: unit tests for it.

## Notes
- Ordering matters: mount it AFTER `getAuth`, because it needs `request.caller`, and BEFORE `setCache`.
- It only looks at the first range from `acceptsLanguages()`, which lists ranges best first. A draft at lower priority behind a live language does not trigger a preview.
- It builds on a live locale pick made earlier by `locale.ts`. Without the trigger, that pick is left untouched.
- Further detail is in `src/modules/locales/model.ts`.
