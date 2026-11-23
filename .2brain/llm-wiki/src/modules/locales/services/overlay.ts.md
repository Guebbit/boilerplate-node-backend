---
source: src/modules/locales/services/overlay.ts
source_sha256: 8d6210da9a549bacdc95905e8b9bb5579d2c79f121ec7155111411980cbe9ab0
context_sha256: ca4e990b0d18215d4954914089e19c30e8a3dfc10fc89a88cb807bf0cba5b2dc
generated_at: 2026-11-22T05:48:21.844635+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/services/overlay.ts

## Purpose
Small helper module that triggers a refresh of the database-backed locale overlay after writes that may have changed it. Both `entries.ts` and `languages.ts` route their write paths through it, so a new write path gets the refresh by construction instead of its controller having to remember it.

## Key elements
- `refreshOverlay(): void`: fire-and-forget call to `refreshLocaleOverrides()`. The edit becomes visible immediately on the worker that served the write; other workers catch up on their next scheduled refresh.
- `refreshOverlayNow(): Promise<void>`: same refresh, but returns the promise so the caller can await it. It is meant for writes that change which languages are served, so the next request on that worker already negotiates against the new list.

## Relationships
- Imports `refreshLocaleOverrides` from `@infrastructure/i18n` (`src/infrastructure/i18n/index.ts`), which does the actual re-read. Both exports are thin wrappers around it.
- `src/infrastructure/i18n/overrides.ts` is a graph neighbor, but this file does not import it directly.
- `entries.ts` and `languages.ts` (same services folder) are the callers, per the module doc.

## Notes
- `refreshLocaleOverrides` never rejects. It logs and keeps the last overlay, so neither wrapper needs error handling. This is why the `no-floating-promises` lint rule is disabled on `refreshOverlay`.
- `refreshOverlay` is also called for frontend-app writes, which cannot affect the overlay. This is deliberate: it is cheaper than threading the app through to skip the call.
- Use `refreshOverlayNow` only when the next request must see the change (language enable/disable). Otherwise use `refreshOverlay`.
