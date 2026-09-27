---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: 6d1a427afa75c17ad6a8edf174aed382f55351602d4b00bc1de620beea8f78b6
generated_at: 2026-09-27T14:58:29.238754+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin HTTP adapter that exposes `GET /locales/:locale/entries` (admin). It validates query params, delegates to `localeService.searchEntries`, and shapes the response as `LocaleEntriesResponse`. Exists so the translation-editing screen can list flat, paginated dictionary rows for a single locale — deliberately uncached because a translator is actively typing into this data.

## Key elements

- **`listLocaleEntriesQuerySchema`** — Extends the generated `ListLocaleEntriesQueryParams` with two relaxations: `page`/`pageSize` replaced by the coercing infra pair (`pageSchema`, `pageSizeSchema`), and `text` wrapped in `z.preprocess(blankToUndefined, …)` so an empty `?text=` is treated as "no filter" instead of tripping `.min(1)`.
- **`getLocaleEntries`** (export) — The Express handler. Parses only query params (no body on GET), calls `localeService.searchEntries`, and returns `result.data` directly as the response body (the wire type `LocaleEntry` already matches `LocaleEntriesResponse.items`, so no mapping step is needed).

## Relationships

- **`src/modules/locales/services/index.ts`** — Imports `localeService`; calls `.searchEntries(locale, parsed)` and consumes the resulting `.data` / `.ok` / `.refused` fields.
- **`src/infrastructure/http/controller.ts`** — Imports `parseBody`, `refused`, `catchAs` for the standard parse → guard → catch pipeline.
- **`src/infrastructure/http/request.ts`** — Imports `readInput` to extract query params under the `'list'` surface.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to serialize the validated result.
- **`src/infrastructure/http/schemas.ts`** — Imports `blankToUndefined`, `pageSchema`, `pageSizeSchema` for query-param coercion.
- **`src/types/index.ts`** — Imports `LocaleEntriesResponse` as the response type parameter.
- **`src/modules/locales/routes.ts`** — Graph neighbor; expected to wire this controller to the `/locales/:locale/entries` route (not imported directly by this file).

## Notes

- **Not cached by design.** The docblock explicitly contrasts this with `GET /locales/:locale/messages` (nested tree for display). This endpoint serves the editing surface, so cache invalidation would race with the translator's keystrokes.
- **Tenant validation is split.** A *malformed* tenant (violating `^[a-z0-9][a-z0-9-]*$`) is rejected with 422 at the schema layer. A *well-formed but unrecognised* tenant passes through to the repository and simply matches zero rows — no special-casing in the controller.
- **GET, so query-params only.** There is intentionally no body; the comment references `docs/theory/request-input.md` for the convention.
- **No mapping/cast step.** Before `createRepository` carried `TWire = LocaleEntry`, an explicit shape conversion was needed; now `result.data` is already the wire shape, so the handler just passes it to `successResponse`.
