---
source: src/infrastructure/i18n/context.ts
sha256: c0b482440bf3acefb16f3dcc7e96bb7ae6606ecf86eb29a07497f6f9311643b7
generated_at: 2026-09-27T14:11:49.720625+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/context.ts

## Purpose

Provides request-scoped translations so that concurrent requests in different languages don't interleave on i18next's single global instance. It uses `AsyncLocalStorage` to carry a locale-bound `t` function down each request's async call chain, and exposes a drop-in `t` that resolves to the per-request binding (or falls back to the global instance).

## Key elements

- **`LocaleContext`** (interface) — pairs a BCP-47 `locale` string with a `t` already bound to it.
- **`translator(locale)`** — returns `i18next.getFixedT(locale)`; the primitive for getting a `t` in a known language without touching the global instance or the ambient store.
- **`createLocaleContext(locale)`** — builds a `LocaleContext` from a locale string.
- **`runWithLocaleContext(context, callback)`** — runs `callback` (and everything it awaits) with `context` as the ambient locale via `AsyncLocalStorage.run`.
- **`runWithLocale(locale, callback)`** — convenience wrapper over the above for callers that only have a locale string (workers, jobs, tests).
- **`getLocaleContext()`** — returns the current ambient `LocaleContext` or `undefined` outside a request.
- **`getCurrentLocale()`** — resolves the active locale: request context → `i18next.language` → `getDefaultLocale()`.
- **`t`** — the ambient translation function. Delegates to the stored context's `t` if present, otherwise to `i18next.t`. Typed as `TFunction` so it can replace an i18next import with no signature change.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — imported for `getDefaultLocale()` used as the final fallback in `getCurrentLocale()`.
- **`src/infrastructure/i18n/index.ts`** — barrel file that re-exports this module's public API.
- **`src/infrastructure/http/middlewares/locale.ts`** — the middleware that negotiates the incoming request's locale and calls `runWithLocaleContext` (or `runWithLocale`) to bind the context for the rest of the request.
- **`src/infrastructure/http/validation-messages.ts`**, **`src/infrastructure/http/errors.ts`**, **`src/app/error-handling.ts`**, and the various HTTP middlewares (`rate-limit`, `idempotency`, `human-challenge`, `upload`) — consume the exported `t` to render localized messages.
- **`src/infrastructure/surfaces/create-item-controller.ts`**, **`src/kernel/middlewares/authorizations.ts`**, **`src/infrastructure/security/breached-passwords/index.ts`** — call `t` (or `translator`) for user-facing strings outside the core HTTP middleware layer.

## Notes

- `t` is cast to `TFunction` because `TFunction`'s overloads cannot be satisfied by a plain arrow function; the cast is unavoidable and intentional.
- Out-of-band work (queues, boot-time callbacks) is **not** inside any request's async chain, so it must explicitly wrap its body in `runWithLocale` or call `translator` directly — the ambient `t` will fall back to `i18next.t` (the boot language) otherwise.
- The `localeStorage` `AsyncLocalStorage` instance is module-private; all entry/exit goes through the exported run/get helpers.
