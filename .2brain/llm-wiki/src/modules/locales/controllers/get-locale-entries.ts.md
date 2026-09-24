---
source: src/modules/locales/controllers/get-locale-entries.ts
sha256: 9eb9b6062c1ca6c0b063e023f2b823002436bf71923127783adc759ecda74f32
generated_at: 2026-09-23T18:48:32.100065+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/get-locale-entries.ts

## Purpose

Thin HTTP adapter for `GET /locales/:locale/entries` (admin). It validates query parameters, delegates to `localeService.searchEntries`, and formats the paginated result into a standard success response. It exists to keep the service layer free of Express concerns while exposing one language's flat dictionary rows for a translation-editing screen.

## Key elements

- **`listLocaleEntriesQuerySchema`** (module-level const) — Extends the generated `ListLocaleEntriesQueryParams` zod schema: swaps `page`/`pageSize` for the coercing infra pair, wraps `text` in `z.preprocess(blankToUndefined, …)` so an empty `?text=` means "no filter", then calls `.partial()`.
- **`getLocaleEntries`** (exported handler) — Express-style `(request, response) => Promise<void>`. Reads only the query string (no body), runs it through `parseBody`, calls `localeService.searchEntries(locale, parsed)`, handles `refused` (403/429 paths), and sends `successResponse<LocaleEntriesResponse>`. Catches all downstream errors via `catchAs`.

## Relationships

- **`../services/index.ts`** — Imports `localeService`; calls its `searchEntries(locale, params)` method.
- **`@infrastructure/http/controller`** — Uses `parseBody` (schema validation + early-return), `refused` (policy check), and `catchAs` (error → HTTP mapping).
- **`@infrastructure/http/request`** — Calls `readInput(request, { surface: 'list' })` to extract the validated query payload.
- **`@infrastructure/http/schemas`** — Consumes `pageSchema`, `pageSizeSchema` (coercing numeric), and `blankToUndefined` (preprocess helper).
- **`@infrastructure/http/response`** — Calls `successResponse` to emit the JSON body with the correct status.
- **`@types`** — Imports `LocaleEntriesResponse` as the wire type for the success envelope.
- **`../routes.ts`** — The route module that mounts `getLocaleEntries` on `GET /locales/:locale/entries` (the controller's registration point).

## Notes

- Deliberately **not cached**: this is the screen a translator is actively typing into; stale data is worse than a slight perf cost.
- The nested message tree clients render is a **different** endpoint (`GET /locales/:locale/messages`); this one returns flat, editable rows.
- A malformed `tenant` value (failing `^[a-z0-9][a-z0-9-]*$`) yields a **422** at the schema layer; a well-formed-but-unknown tenant passes through unchanged and simply matches zero rows at the repository.
- `result.data.items` is already the wire shape (`LocaleEntry`)—no additional mapping or cast is needed.
