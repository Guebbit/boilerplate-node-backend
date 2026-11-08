---
source: src/kernel/middlewares/locale-preview.ts
sha256: 57557d0f8d37474540aca422e337cb5ee69ec9ed70e2bfb72118281bde846f56
generated_at: 2026-11-08T03:54:01.489369+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/locale-preview.ts

## Purpose

Express middleware that re-binds an in-flight request to a **draft (switched-off) language** when a staff caller explicitly requests that language as their *first* `Accept-Language` choice. It lets product pages resolve text against draft translations through the normal live chain, without exposing the draft to non-staff callers or to callers who merely listed it at a lower `q` value.

## Key elements

- **`previewDraftLanguage`** (exported middleware) — Inspects `request.acceptsLanguages()[0]`, checks `canPreviewDraftLanguages(request.caller)`, and if a valid draft is requested:
  - Creates a preview i18n context via `createPreviewContext`.
  - Rebinds `request.locale` and `request.t`.
  - Sets the `Content-Language` response header to the draft locale.
  - Calls `markDraftPreview` to stamp the response with `private, no-store`.
  - Executes `next()` inside `runWithLocaleContext(context, …)`.
  - Falls through to `next()` unchanged for every other caller.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — imports `markDraftPreview` to set cache-control headers on the preview response. Must be mounted **before** the `setCache` middleware so the cache key (built from `request.locale`) already reflects the draft locale.
- **`src/infrastructure/i18n/context.ts`** — provides `createPreviewContext` and `runWithLocaleContext`, which build the per-request i18n state and execute downstream handlers within it.
- **`src/infrastructure/i18n/served.ts`** — provides `draftLocaleFor`, which maps a language tag to a draft locale (or returns null if it isn't one).
- **`src/infrastructure/i18n/index.ts`** — barrel re-export consumed by the `@infrastructure/i18n` import.
- **`src/kernel/translation.ts`** — provides `canPreviewDraftLanguages(caller)`, the permission gate that decides whether the caller may see draft text.
- **`src/modules/products/routes.ts`**, **`src/modules/example/routes.ts`** — routers that mount `previewDraftLanguage` in their middleware chain (after `getAuth`, before `setCache`).
- **`tests/unit/kernel/locale-preview.test.ts`** — unit tests covering the middleware's decision branches.

## Notes

- **Mounting order is critical.** The middleware requires `request.caller` (set by an earlier auth middleware) and must run before any cache-key construction that reads `request.locale`. Placing it in the wrong position silently breaks either the permission check or the cache key.
- **Only the *first* `Accept-Language` entry is considered.** A draft language at `q=0.5` behind a live language is deliberately ignored — it is not treated as a preview request.
- **No error is ever thrown for non-staff callers.** The middleware always calls `next()`, so the request proceeds with whatever live locale `locale.ts` already selected.
- The `Content-Language` header is set to the draft locale to signal to clients (and observability tooling) that the body is in a non-live language.
