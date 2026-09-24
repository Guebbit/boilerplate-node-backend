---
source: src/infrastructure/i18n/context.ts
sha256: 64b074229b7fe35f8b0c389fc3853fa65480f26e2aa721e5805f8f7f45723af3
generated_at: 2026-09-23T17:47:03.145443+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/context.ts

## Purpose

Provides request-scoped translation by binding an `i18next` `t` function to a specific locale via `AsyncLocalStorage`. This prevents concurrent requests in different languages from interleaving on `i18next`'s single global instance, and gives out-of-band code (queues, boot callbacks) a way to opt in explicitly.

## Key elements

- **`LocaleContext`** (interface) — pairs a BCP-47 `locale` string with a `t` already bound to that locale.
- **`translator(locale)`** — returns a `TFunction` via `i18next.getFixedT(locale)`. The lowest-level primitive; no ambient state involved.
- **`createLocaleContext(locale)`** — builds a `LocaleContext` object from a locale string.
- **`runWithLocaleContext(context, callback)`** — executes `callback` (and everything it awaits) with `context` as the ambient store value.
- **`runWithLocale(locale, callback)`** — convenience wrapper: creates a context from a locale string, then delegates to `runWithLocaleContext`. Intended for workers, jobs, and tests.
- **`getLocaleContext()`** — returns the ambient `LocaleContext` or `undefined` if outside a request.
- **`getCurrentLocale()`** — resolves the active locale: ambient context → `i18next.language` → `getDefaultLocale()`.
- **`t`** — the ambient translation function. Resolves from the `AsyncLocalStorage` store first, falling back to `i18next.t`. Signature-compatible with `i18next`'s own `t` for drop-in import replacement.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — imports `getDefaultLocale` for the final fallback in `getCurrentLocale`.
- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports this module's public API to consumers.
- **`src/infrastructure/http/middlewares/locale.ts`** — the entry point that negotiates the locale and calls `runWithLocaleContext` to bind the context for the duration of the request.
- **`src/kernel/translation.ts`** — kernel-level helper that consumes `t` / `getLocaleContext` for translation-aware logic.
- **`src/infrastructure/http/validation-messages.ts`**, **`src/infrastructure/http/controller.ts`**, **`src/infrastructure/http/request.ts`**, **`src/app/error-handling.ts`**, **`src/infrastructure/surfaces/create-item-controller.ts`**, **`src/kernel/middlewares/authorizations.ts`**, and the HTTP middlewares (`human-challenge`, `idempotency`, `rate-limit`, `upload`) — all consume the ambient `t` (or `getLocaleContext`) to produce localized user-facing strings within the request chain.
- **`src/infrastructure/security/breached-passwords/index.ts`** — may call `runWithLocale` for out-of-band notifications or `t` within a request.

## Notes

- The `t` export is cast to `TFunction` because `TFunction`'s overloads cannot be satisfied by a single arrow-function signature. This is an unavoidable type-level compromise.
- Code outside the request async chain (queue workers, boot-time callbacks, tests) will see `getLocaleContext()` return `undefined` and must call `runWithLocale` explicitly; there is no implicit fallback to a "current" locale.
- Migration from a global `i18next.t` import to this module's `t` is a one-line import swap — the call-site signature is identical.
