---
source: src/infrastructure/i18n/context.ts
sha256: e0dfe83d8c88a600277bca4c968d6953f21d3c032c490c70542d52e67f7bd5cc
generated_at: 2026-10-29T02:06:54.267269+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/context.ts

## Purpose

Provides request-scoped internationalization by binding a locale-specific `t` function to an `AsyncLocalStorage` store, so concurrent requests in different languages never interleave on i18next's single global instance. Out-of-band work (queues, boot-time callbacks) falls outside the async chain and must opt in explicitly.

## Key elements

- **`LocaleContext`** (interface) — the per-request payload: a BCP-47 `locale` string, a `t` bound to it, and an optional `preview: true` flag set only by staff draft previews.
- **`translator(locale)`** — returns a `TFunction` bound to one language via `i18next.getFixedT`, with automatic fallback for languages that have no deployed dictionary. Does not touch the global instance or the ambient store.
- **`createLocaleContext(locale)`** — resolves a raw locale tag to its *served* equivalent (via `servedLocaleFor`) and pairs it with a `translator` binding. Used for normal requests.
- **`createPreviewContext(draftTag)`** — like `createLocaleContext` but keeps the draft tag as `locale` (not folded to fallback) and sets `preview: true`. Used for staff draft previews of switched-off languages.
- **`runWithLocaleContext(context, cb)`** — executes `cb` (and everything it awaits) with `context` as the ambient locale in `AsyncLocalStorage`.
- **`runWithLocale(locale, cb)`** — convenience wrapper that calls `createLocaleContext` then `runWithLocaleContext`; intended for workers, queue drains, tests.
- **`getLocaleContext()`** — returns the ambient `LocaleContext` or `undefined` outside a request.
- **`getCurrentLocale()`** — resolves the effective locale: ambient context → `i18next.language` → `getDefaultLocale()`.
- **`t`** — ambient `TFunction` that delegates to the request's bound `t` when inside an async chain, otherwise to the global `i18next.t`. Cast to `TFunction` because i18next's overload signatures can't be satisfied by a single arrow.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — imports `getDefaultLocale` as the final fallback in `getCurrentLocale`.
- **`src/infrastructure/i18n/index.ts`** — barrel file that re-exports this module's public API for the rest of the codebase.
- **HTTP middlewares (`locale.ts`, `response.ts`, etc.)** and **`validation-messages.ts`** — consume this module: the `locale` middleware likely calls `runWithLocaleContext` at request entry; downstream code calls the ambient `t` or `getLocaleContext` to read the negotiated language.
- **`src/infrastructure/i18n/served.ts`** (imported as `./served`) — provides `dictionaryLocaleFor` and `servedLocaleFor`, the resolution helpers that map raw tags to served/dictionary locales.

## Notes

- The `t` export is intentionally cast: i18next's `TFunction` overloads cannot be satisfied by a plain arrow, so the cast is the minimal compromise to keep a drop-in signature.
- `preview: true` is a narrow, single-purpose flag. Nothing else in the codebase is expected to set it; a worker or snapshot should never carry a preview context.
- Languages that are registered but have no deployed dictionary file (or have been switched off) are silently bound to the fallback language in `translator` — no `supportedLngs` rejection is logged per call.
- Out-of-band code that needs translations must use `runWithLocale` / `runWithLocaleContext` explicitly; calling the bare `t` outside a request falls back to whatever `i18next.language` happens to be at boot time.
