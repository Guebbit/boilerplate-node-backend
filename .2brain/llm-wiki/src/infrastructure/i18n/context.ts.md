---
source: src/infrastructure/i18n/context.ts
sha256: e0dfe83d8c88a600277bca4c968d6953f21d3c032c490c70542d52e67f7bd5cc
generated_at: 2026-11-08T03:36:43.314580+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/i18n/context.ts

## Purpose

Provides request-scoped translation for concurrent multi-locale traffic. Because `i18next`'s default instance is a single global with one active language, this module uses `AsyncLocalStorage` to carry a locale-bound `TFunction` down each request's async chain, and exposes helpers to bind, propagate, and retrieve that binding.

## Key elements

- **`LocaleContext`** (interface) — the per-request payload: `locale` (BCP-47 tag), `t` (bound `TFunction`), and an optional `preview?: true` flag set only by staff draft previews.
- **`translator(locale)`** — returns a `TFunction` bound to one language via `i18next.getFixedT`; resolves the locale through `dictionaryLocaleFor` so unregistered/switched-off languages fall back silently. No global or ambient state is touched.
- **`createLocaleContext(locale)`** — resolves the *served* locale (regional tags fold to base, unserved tags fall back) and returns a `LocaleContext` whose `locale` field is the served tag and whose `t` is bound via `translator`.
- **`createPreviewContext(draftTag)`** — like `createLocaleContext` but keeps the draft tag as `locale` (does not fold) and sets `preview: true`; `t` still falls back.
- **`runWithLocaleContext(context, cb)`** — executes `cb` (and everything it awaits) inside the `AsyncLocalStorage` scope with the given context.
- **`runWithLocale(locale, cb)`** — sugar: calls `createLocaleContext` then `runWithLocaleContext`. Intended for out-of-band code (queue workers, boot-time callbacks, tests).
- **`getLocaleContext()`** — returns the ambient `LocaleContext` or `undefined` outside a request.
- **`getCurrentLocale()`** — ambient context's locale → `i18next.language` → `getDefaultLocale()`.
- **`t`** (exported `TFunction`) — ambient translation: uses the stored context's `t` when present, otherwise `i18next.t`. Signature-compatible with i18next's own `t` so it is a drop-in replacement.

## Relationships

- **`src/infrastructure/i18n/catalog.ts`** — imports `getDefaultLocale`, used as the last-resort locale in `getCurrentLocale`.
- **`src/infrastructure/i18n/index.ts`** — barrel that re-exports the public surface of this module.
- **`src/infrastructure/http/middlewares/locale.ts`** — the request middleware that negotiates the incoming locale and calls `createLocaleContext` / `runWithLocaleContext` (or `createPreviewContext` for drafts) to seed the ambient store for the rest of the handler chain.
- **`src/infrastructure/http/errors.ts`, `src/infrastructure/http/validation-messages.ts`, `src/app/error-handling.ts`, `src/infrastructure/http/response.ts`** — consume the ambient `t` (or `getCurrentLocale`) to produce localized error and response text.
- **`src/infrastructure/http/middlewares/*.ts`** (idempotency, rate-limit, upload, origin, human-challenge, json-depth, content-type) — run inside the locale scope established by the locale middleware and may call `t` for user-facing messages.

## Notes

- **`preview` flag is additive, not exclusive.** A `LocaleContext` with `preview: true` is otherwise identical in shape; no other code path sets it, so its presence is a reliable signal that the request is a staff draft preview.
- **Served vs. dictionary locale.** `createLocaleContext` resolves the *served* tag for the `locale` field (what `Content-Language` reports), while `translator` resolves the *dictionary* tag (what words are actually read). A regional tag like `en-GB` keeps `locale: "en-GB"` but its `t` reads the `en` dictionary.
- **Fallback is silent.** A locale with no deployed dictionary file is not rejected by `supportedLngs`; `translator` maps it to the fallback language so no per-call warnings are logged.
- **`t` cast is unavoidable.** The `as TFunction` on the exported `t` exists because `TFunction`'s overloads cannot be satisfied by a single arrow-function signature; it is not a type-safety gap in practice.
- **Out-of-band code must opt in.** Anything outside the HTTP async chain (queues, scheduled jobs, boot callbacks) will see `getLocaleContext() === undefined` and must wrap its work in `runWithLocale` or `runWithLocaleContext` to get a working `t`.
