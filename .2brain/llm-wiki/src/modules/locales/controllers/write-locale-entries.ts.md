---
source: src/modules/locales/controllers/write-locale-entries.ts
sha256: 80319b38750d6e8cde8406309932a75cf2fc43be38232171b60a3e3bb96428b5
generated_at: 2026-10-15T10:43:09.630321+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/write-locale-entries.ts

## Purpose

HTTP controller handlers for all write operations on an app's locale entries: single-entry create/update, and two bulk-import modes (full replace vs. partial merge). Exists to keep Express routing logic, input validation, and response shaping in one place, delegating actual data mutations to the locale service.

## Key elements

- **`createLocaleEntry`** — `POST /locales/:locale/apps/:app/entries`. Validates the body via `CreateLocaleEntryBody`, calls `localeService.createEntry`, responds `201` with a Location header pointing to the new entry's URI.
- **`updateLocaleEntry`** — `PUT /locales/:locale/apps/:app/entries/:entryId`. Validates `entryId` through `requireId`, calls `localeService.updateEntry`, responds `200` with the updated entry.
- **`importEntries`** (private factory) — Builds a handler for bulk operations. Accepts a `mode` (`'replace' | 'merge'`) and a Zod schema, returns an Express handler that calls `localeService.importEntries` with the entries array and mode.
- **`replaceLocaleEntries`** — `PUT /locales/:locale/apps/:app/entries`. Produced by `importEntries('replace', …)`. Entries not present in the payload are **deleted**.
- **`mergeLocaleEntries`** — `PATCH /locales/:locale/apps/:app/entries`. Produced by `importEntries('merge', …)`. Entries not present in the payload are **left untouched**.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies the three shared handler utilities used by every route here: `parseBody` (Zod validation + 400), `refused` (authorization-failure short-circuit), and `catchAs` (typed catch that tags the operation name for logging).
- **`src/infrastructure/http/request.ts`** — `callerContextOf(request)` extracts the authenticated caller context passed to every service call.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `createdResponse` shape the JSON envelope and status code.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `entryId` path parameter (format check + 404 via the `notFound` i18n key).
- **`src/modules/locales/services/index.ts`** — `localeService` performs the actual data operations (`createEntry`, `updateEntry`, `importEntries`); this file never touches storage directly.
- **`src/modules/locales/presenters.ts`** — `presentLocaleEntry` transforms the service's domain object into the API wire shape before it is sent back.
- **`src/modules/locales/routes.ts`** — Consumer of this file's five exports; registers them on the Express router (not imported here, but wired there).
- **`src/types/index.ts`** — Source of the domain types (`LocaleEntry`, `LocaleEntryInput`, `LocaleImportResult`, the per-route request types) used for type annotations throughout.

## Notes

- **Replace vs. merge is a deliberate two-route split**, not a query flag. The file header explains: a single boolean on one route could silently empty a dictionary if set incorrectly. Splitting into `PUT` (destructive) and `PATCH` (non-destructive) makes the intent explicit in the HTTP verb.
- **Entry keys are immutable.** `updateLocaleEntry` only changes the value; the key is the lookup identity, so "changing" it is semantically a delete + create, not an update.
- **`importEntries` returns a function** (curried factory), so the two bulk exports share one implementation. The `catchAs` tag is interpolated (`${mode}LocaleEntries`) to keep logs distinguishable.
- All five handlers follow the same skeleton: parse body → guard → service call → `refused` check → shape response → `catchAs` in `.catch`. New write routes should mirror this pattern.
