---
source: src/modules/locales/services/overlay.ts
sha256: 8d6210da9a549bacdc95905e8b9bb5579d2c79f121ec7155111411980cbe9ab0
generated_at: 2026-11-08T06:26:28.783572+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/overlay.ts

## Purpose

Thin service layer that wraps `refreshLocaleOverrides` so that every locale write path (entries, languages, and any future writer) triggers a DB overlay refresh by construction, eliminating the need for each controller to remember to call it.

## Key elements

- **`refreshOverlay()`** – Fire-and-forget call to `refreshLocaleOverrides()`. Used after writes that *may* have changed the override set (e.g. entry CRUD). The promise is intentionally discarded; the underlying call never rejects (it logs and retains the last overlay).
- **`refreshOverlayNow()`** – Same call, but returns the `Promise<void>` so the caller can `await` it. Used on the language on/off switch path where the very next request on the same worker must negotiate against the updated served-language list.

## Relationships

- **`src/infrastructure/i18n/index.ts`** – Exports `refreshLocaleOverrides`, the sole function this module delegates to.
- **`src/infrastructure/i18n/overrides.ts`** – Contains the actual overlay read/refresh implementation that `refreshLocaleOverrides` ultimately invokes.
- **`src/modules/locales/services/entries.ts`** – Imports `refreshOverlay` and calls it after write operations that could alter entry-level overrides.
- **`src/modules/locales/services/languages.ts`** – Imports both `refreshOverlay` and `refreshOverlayNow`; uses the latter after toggling a language's served status so the current request cycle sees the change.

## Notes

- `refreshOverlay` swallows the promise on purpose; the ESLint disable comment documents that `refreshLocaleOverrides` never rejects (it logs internally).
- The module is also invoked for frontend-app writes even though those writes cannot affect the overlay — the author chose this over threading an app-discriminator through every call site.
- No local state is held here; it is a pure pass-through, so there is no risk of double-refresh if a caller also invokes `refreshLocaleOverrides` directly (the infrastructure layer is idempotent in that it simply re-reads).
