---
source: src/modules/locales/controllers/delete-locale-entry.ts
sha256: fa002f178882849b1665b4923b9804a7a6d58f673ddc6fb4e927659f96ab7bfa
generated_at: 2026-09-23T18:48:03.231610+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/delete-locale-entry.ts

## Purpose

Thin HTTP adapter for the `DELETE /locales/:locale/entries/:entryId` admin endpoint. It extracts route params, delegates all business logic to `localeService.deleteEntry`, and handles the HTTP response lifecycle (success, refusal, error). It exists to keep the service layer transport-agnostic.

## Key elements

- **`deleteLocaleEntry`** (exported) — Express route handler. Reads `locale` and `entryId` from `request.params`, calls `localeService.deleteEntry(locale, entryId, callerContextOf(request))`. On a successful (non-refused) result it fire-and-forgets `refreshLocaleOverrides()`, then writes a body-less success response. On refusal it short-circuits via `refused(response, result)`. Unhandled errors are funneled to `catchAs(response, 'deleteLocaleEntry')`.

## Relationships

- **`src/modules/locales/services/index.ts`** — imports `localeService`; the actual delete logic (validation, DB write, audit) lives in its `deleteEntry` method.
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (structured error → HTTP mapping) and `refused` (checks service result for a refusal and writes the corresponding response).
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to pull the authenticated caller's context for the audit trail.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the 200 (no body).
- **`src/infrastructure/i18n/index.ts`** — imports `refreshLocaleOverrides` to invalidate the in-process override cache after a write.
- **`src/infrastructure/i18n/overrides.ts`** — underlying cache that `refreshLocaleOverrides` targets (graph neighbor via the i18n barrel).
- **`src/modules/locales/routes.ts`** — the router that binds this handler to the `DELETE /locales/:locale/entries/:entryId` path.

## Notes

- **No response body.** `successResponse(response, undefined)` is intentional: the deleted key is recorded in the audit trail, not echoed back to the client.
- **`refreshLocaleOverrides()` is deliberately not awaited** (`void` keyword). It only affects the current worker's in-memory cache immediately; other workers pick up the change on their next scheduled refresh. The comment cross-references `./write-locale-entries.ts` for the same pattern.
- **Refusal short-circuit.** If `localeService.deleteEntry` resolves with a "refused" result (e.g. permission or conflict), `refused()` writes the appropriate HTTP response and the handler returns early — `refreshLocaleOverrides` and the success response are skipped.
- The controller performs **no business logic** (no DB access, no validation). All domain rules are in the service.
