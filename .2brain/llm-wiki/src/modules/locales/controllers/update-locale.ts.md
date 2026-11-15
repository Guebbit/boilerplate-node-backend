---
source: src/modules/locales/controllers/update-locale.ts
sha256: b9580ec8f1ed1fad7b6b94e885c5e09012cc4faed2d74af6bb5811b321c34e69
generated_at: 2026-11-14T20:19:20.882444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale.ts

## Purpose

Handler pair for `PUT /locales/:locale` (full replace) and `PATCH /locales/:locale` (partial merge), built on the shared `createUpdateController` factory. The locale tag is always read from the path parameter, never from the request body, because changing a tag would effectively rename an entire dictionary referenced by every entry.

## Key elements

- **`replaceLocale`** — exported `PUT` handler (full-replace semantics).
- **`updateLocale`** — exported `PATCH` handler (merge semantics).
- **`createUpdateController` invocation** — single factory call that produces both handlers. Notable configuration:
  - `replaceSchema` / `patchSchema` extend the base `ReplaceLocaleBody` / `UpdateLocaleBody` with `name` and `nativeName` validated against `localeService.localeDisplayName`.
  - `idFrom` extracts the tag from `request.params.locale`, coerces to `String`, and normalises via `localeService.normalizeTag` (e.g. `pt-br` → `pt-BR`).
  - `update` delegates to `localeService.updateLanguage(tag, changes, callerContextOf(request))`.
  - `present` delegates to `localeService.describeStoredLanguage(row, localeService.standingOn(request.caller))`.

## Relationships

- **`@infrastructure/surfaces/create-update-controller`** — the factory that assembles the two HTTP handlers from the configuration object defined here.
- **`@infrastructure/http/request`** — supplies `callerContextOf`, used to pass the authenticated caller's context into the service call.
- **`../services` (localeService)** — the domain service that performs `normalizeTag`, `updateLanguage`, and `describeStoredLanguage`; also provides the `localeDisplayName` schema fragment used for input validation.
- **`routes.ts`** (same module) — imports `replaceLocale` / `updateLocale` and wires them to the `PUT` / `PATCH /locales/:locale` routes.

## Notes

- **No ObjectId format check on the tag.** The tag is a plain string field, not a Mongo ObjectId. A malformed tag simply misses every document in `findByTag` and surfaces as a standard 404 — no explicit validation is needed.
- **Tag is normalised before use.** This ensures the `If-Match` (ETag) key matches the key the repository's `save` produces, so optimistic-concurrency checks work consistently regardless of the case the client sent.
- **`versioned: true`** enables the `If-Match` / optimistic-locking path built into the factory.
