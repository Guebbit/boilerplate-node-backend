---
source: src/kernel/middlewares/locale-preview.ts
sha256: 57557d0f8d37474540aca422e337cb5ee69ec9ed70e2bfb72118281bde846f56
generated_at: 2026-10-29T02:19:54.422120+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/middlewares/locale-preview.ts

## Purpose

Express middleware that lets an authorised staff caller preview a draft (not-yet-live) language by re-binding the request's locale before translation resolution begins. If the caller's first `Accept-Language` choice is a switched-off language they have permission to see, the request is re-scoped to that draft so all downstream product reads resolve text from it; otherwise the request proceeds unchanged.

## Key elements

- **`previewDraftLanguage(request, response, next)`** — sole export. An Express middleware that:
  - Reads the first entry from `request.acceptsLanguages()` and checks via `draftLocaleFor` whether it maps to a draft locale.
  - Gates on `canPreviewDraftLanguages(request.caller)` (the `display:Locale` permission).
  - On a match: creates a preview context via `createPreviewContext`, overwrites `request.locale` / `request.t`, sets `Content-Language`, calls `markDraftPreview` for cache headers, then wraps `next()` in `runWithLocaleContext`.
  - On any miss: calls `next()` immediately with no side-effects.

## Relationships

- **`src/infrastructure/http/middlewares/cache.ts`** — imports `markDraftPreview` to stamp the response with `private, no-store` so the preview is never cached by intermediaries.
- **`src/infrastructure/i18n/index.ts`** (barrel → `context.ts`, `served.ts`) — provides `createPreviewContext`, `runWithLocaleContext` (context binding) and `draftLocaleFor` (maps a BCP-47 tag to a draft locale definition).
- **`src/kernel/translation.ts`** — provides `canPreviewDraftLanguages`, the port-level permission check for the caller.
- **`src/modules/products/routes.ts`**, **`src/modules/example/routes.ts`** — consumer routers that mount this middleware per-route, positioned after `getAuth` and before `setCache`.
- **`tests/unit/kernel/locale-preview.test.ts`** — unit tests covering the preview and fall-through paths.

## Notes

- **Mount order is contractual**: must sit *after* `getAuth` (reads `request.caller`) and *before* `setCache` (that middleware builds its cache key from `request.locale`, which this file mutates).
- Only the **first** `Accept-Language` value is considered. A draft listed at a lower `q` behind a live language is intentionally ignored — it is not treated as a preview request.
- Non-staff callers (or callers whose first choice is a live locale) always fall through to `next()` without modification; this middleware never produces an error or 404.
- `request.locale === draft` short-circuits: if the live locale resolver already selected the same tag, no re-binding occurs.
