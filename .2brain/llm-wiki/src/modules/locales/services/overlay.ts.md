---
source: src/modules/locales/services/overlay.ts
sha256: 8d6210da9a549bacdc95905e8b9bb5579d2c79f121ec7155111411980cbe9ab0
generated_at: 2026-10-29T04:24:30.394348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/services/overlay.ts

## Purpose
Thin wrapper around the i18n overlay-refresh function so that every locale write path (`entries.ts`, `languages.ts`) automatically triggers a re-read of the override cache. Centralising the call here means a future write path picks up the refresh by construction rather than by each controller remembering to do it.

## Key elements
- **`refreshOverlay()`** – Fire-and-forget (returns `void`) call to `refreshLocaleOverrides()`. Used after writes where eventual consistency is acceptable (including frontend-app writes that can't actually change the overlay). The underlying function never rejects; it logs errors and keeps the last good overlay.
- **`refreshOverlayNow()`** – Same underlying call but returns the `Promise<void>` so the caller can `await` it. Used after writes that change which languages are *served* (e.g. a language is toggled on/off), where the very next request on the same worker must already negotiate against the updated list.

## Relationships
- **`src/infrastructure/i18n/index.ts`** – Provides `refreshLocaleOverrides` (re-exported from `overrides.ts`), which is the sole dependency of this file.
- **`src/infrastructure/i18n/overrides.ts`** – Contains the actual overlay-read / cache logic that `refreshLocaleOverrides` executes.
- **`src/modules/locales/services/entries.ts`** – Calls `refreshOverlay` at the end of its write paths.
- **`src/modules/locales/services/languages.ts`** – Calls `refreshOverlay` (or `refreshOverlayNow` for language on/off toggles) at the end of its write paths.

## Notes
- Neither export can throw or reject. The eslint-disable comment on `refreshOverlay` acknowledges the floating-promise lint rule; the safety guarantee comes from `refreshLocaleOverrides` itself logging and retaining the last overlay on failure.
- `refreshOverlay` is deliberately used for frontend-app writes even though those writes cannot affect the overlay — the comment states this is cheaper than threading an app identifier through the call site.
- Multi-worker consistency is *not* handled here: only the worker that served the write sees the refresh immediately; other workers catch up on their next scheduled refresh.
