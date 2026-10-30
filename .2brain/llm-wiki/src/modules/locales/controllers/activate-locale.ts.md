---
source: src/modules/locales/controllers/activate-locale.ts
sha256: b70ec12dc0c1e1d44a63e51a3aaaa71357923d64c08b434f187ae1277529525f
generated_at: 2026-10-29T04:19:18.895100+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/activate-locale.ts

## Purpose

Thin Express handlers for `POST /locales/:locale/activate` and `POST /locales/:locale/deactivate`. All business logic (refusal rules, cache invalidation, overlay refresh, audit logging) lives in the locale service; this file only invokes the service, maps the stored language into a response, and formats success/refusal/error responses.

## Key elements

- **`switchLanguage(operation, run)`** — internal curried builder that produces an Express handler. It calls the supplied service method with the `:locale` param and caller context, short-circuits on refusal via `refused`, otherwise enriches the result with `describeStoredLanguage` and returns it through `successResponse`. Errors are mapped by `catchAs` under the given `operation` id.
- **`activateLocale`** (exported) — `switchLanguage('activateLocale', localeService.activateLanguage)`. Handles `POST /locales/:locale/activate`.
- **`deactivateLocale`** (exported) — `switchLanguage('deactivateLocale', localeService.deactivateLanguage)`. Handles `POST /locales/:locale/deactivate`. The fallback language is expected to be refused by the service.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs` (error-to-HTTP mapping) and `refused` (refusal short-circuit).
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to extract the caller identity from the incoming request.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` to serialize the `Language` payload.
- **`src/modules/locales/services/index.ts`** — exports `localeService`; this file calls `activateLanguage`, `deactivateLanguage`, `describeStoredLanguage`, and `standingOn` on it.
- **`src/modules/locales/routes.ts`** — consumer that wires `activateLocale` / `deactivateLocale` onto the Express router for the two POST paths.
- **`src/types/index.ts`** — source of the `Language` type used as the response payload shape.

## Notes

- The two handlers are intentionally one-liners over `switchLanguage`; adding a third action endpoint should follow the same pattern rather than duplicating the `.then/.catch` chain.
- `callerContextOf(request)` is passed to the service call, but `request.caller` is also read directly for `standingOn`—the controller trusts that the middleware (in `routes.ts`) has populated `request.caller` before the handler runs.
- The `operation` string (`'activateLocale'` / `'deactivateLocale'`) is the OpenAPI `operationId`; it flows into `catchAs` for error logging/correlation and must match the contract.
