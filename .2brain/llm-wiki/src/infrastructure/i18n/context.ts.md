---
source: src/infrastructure/i18n/context.ts
source_sha256: 66d9f41d7535bfb5825eb22f6774d999f25518c35c64c73c159de03916700df1
context_sha256: eb1160513e97d6b2838a310e4e5f50c8e65c52bb3d631c85f5fb746de035ccaa
generated_at: 2026-11-22T02:55:46.504387+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/i18n/context.ts

## Purpose
Provides request-scoped translation. `i18next`'s default export is a single global instance with one active language, so overlapping requests in different languages would interleave. This file binds a `t` per language via `getFixedT` and carries it down the request's async chain with `AsyncLocalStorage`. Out-of-band work (queues, boot-time callbacks) is outside that chain and must bind explicitly with `runWithLocale`.

## Key elements
- `LocaleContext` — interface: `locale` (BCP-47), `t` (bound to it), and optional `preview?: true`, set only by a staff draft preview.
- `translator(locale)` — returns a `t` bound to one language, using no global and no ambient store. It uses `dictionaryLocaleFor`, so a language with no wording falls back to the fallback language without logging a `supportedLngs` rejection. Suited to callers off the request chain, such as email builders resolving copy for a recipient's language.
- `createLocaleContext(locale)` — folds the locale through `servedLocaleFor`. An unserved language becomes the fallback language, and a regional tag follows its base language. A served language with no dictionary file keeps its own `locale`, and only its `t` falls back.
- `createPreviewContext(draftTag)` — keeps the draft tag as `locale` (not folded) and sets `preview: true`. Its `t` still falls back. The tag must already have been accepted by `draftLocaleFor`.
- `runWithLocaleContext(context, callback)` — runs `callback`, and everything it awaits, with `context` as the ambient locale.
- `runWithLocale(locale, callback)` — convenience wrapper that builds the context from a locale string. Meant for workers, jobs and tests.
- `getLocaleContext()` — returns the ambient context, or `undefined` outside a request.
- `getCurrentLocale()` — returns the ambient locale, else `i18next.language`, else `getDefaultLocale()`.
- `t` — the ambient translation function. It uses the request's bound `t` if present, otherwise the global `i18next.t`. It has the same signature as i18next's `t`, so migrating is just repointing an import.

## Relationships
- Imports `getDefaultLocale` from `./catalog` for the last-resort locale.
- Imports `dictionaryLocaleFor` and `servedLocaleFor` from `./served`. `draftLocaleFor` from the same module is referenced in docs.
- Depends on `i18next` and Node's `AsyncLocalStorage`.
- `src/infrastructure/http/middlewares/locale.ts` is a neighbor in the graph, and per the file's purpose is the likely place a request's context is bound. The file content does not show this directly.
- The other listed neighbors (HTTP middlewares, `src/infrastructure/http/errors.ts`, `response.ts`, `validation-messages.ts`, `src/app/error-handling.ts`) are related through the dependency graph. They presumably consume the ambient `t` or locale, but this file does not show how.

## Notes
- The context's `locale` determines both the language product text is read in and the `Content-Language` value. This is why unserved languages are folded to the fallback in `createLocaleContext`.
- `preview` can only be set by `createPreviewContext`, so workers and snapshots cannot enter preview.
- `t` is cast to `TFunction` because its overloads cannot be satisfied by a single arrow function.
- `getCurrentLocale` suppresses a lint rule because `i18next.language` is typed as `string` but is `undefined` until `init` has run.
