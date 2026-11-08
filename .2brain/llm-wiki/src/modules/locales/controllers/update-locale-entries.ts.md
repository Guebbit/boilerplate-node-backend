---
source: src/modules/locales/controllers/update-locale-entries.ts
sha256: 2380e887bc2550efda939ad4863d0150bbd307d778f7f9ed551ee5baa637dc26
generated_at: 2026-11-08T06:22:31.065030+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/update-locale-entries.ts

## Purpose

Defines the two admin HTTP controllers for bulk-importing an app's locale entries. They are implemented as two distinct routes (PUT / PATCH) rather than a single route with a mode flag, so a mis-set boolean can't silently empty a dictionary.

## Key elements

- **`importEntries`** (internal) — Curried builder that takes a mode (`'replace' | 'merge'`) and a Zod body schema, and returns an Express handler. It parses the body via `parseBody`, delegates to `localeService.importEntries`, then dispatches a success or refused response.
- **`replaceLocaleEntries`** (exported) — Handler for `PUT /locales/:locale/apps/:app/entries`. Anything stored but not in the request body is deleted.
- **`updateLocaleEntries`** (exported) — Handler for `PATCH /locales/:locale/apps/:app/entries`. JSON merge-patch semantics: a string upserts, `null` deletes, omitted keys are untouched.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `parseBody`, `refused`, and `catchAs` utilities used by both handlers.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, called to attach caller identity to the service call.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` for the 200 reply.
- **`src/modules/locales/services/index.ts`** — Exports `localeService`; its `importEntries(locale, app, entries, mode, ctx)` method performs the actual persistence.
- **`src/modules/locales/routes.ts`** — Registers `replaceLocaleEntries` and `updateLocaleEntries` on their respective route paths.
- **`src/types/index.ts`** — Source of `LocaleImportResult`, `ReplaceLocaleEntriesRequest`, and `UpdateLocaleEntriesRequest` types.

## Notes

- Both routes are admin-scoped (per doc comments).
- The error label passed to `catchAs` differs by mode (`'updateLocaleEntries'` vs `'replaceLocaleEntries'`), which affects logged error identity.
- The body schema enforces `Record<string, string | null>`; the distinction between the two schemas (`ReplaceLocaleEntriesBody` vs `UpdateLocaleEntriesBody`) comes from `@api/schemas.zod` and governs which mode is valid.
