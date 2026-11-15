---
source: src/modules/locales/controllers/post-locale-activation.ts
sha256: 2bee98ecd397be809b496b66fe868ff90575a45cb5be94a3967c9c3285bc73b0
generated_at: 2026-11-14T20:18:07.523571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/post-locale-activation.ts

## Purpose

Express route handlers for `POST /locales/:locale/activate` and `POST /locales/:locale/deactivate`. They are thin orchestration layers: invoke the locale service, check for refusal, re-describe the stored language for the caller, and emit the success response. All domain logic (cache clear, overlay refresh, audit) lives in the service.

## Key elements

- **`switchLanguage`** (internal) — Builder that returns an Express handler from an operation name and a service method. Used to construct both exported handlers so they share identical flow.
- **`activateLocale`** (export) — `POST /locales/:locale/activate`. Calls `localeService.activateLanguage`.
- **`deactivateLocale`** (export) — `POST /locales/:locale/deactivate`. Calls `localeService.deactivateLanguage`; the fallback language will refuse.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides `refused` (early-return on service refusal) and `catchAs` (maps service errors to an HTTP error response, logging under the operation name).
- **`src/infrastructure/http/preconditions.ts`** — Provides `answerAsResource`, which sets the resource precondition header on the response using the language's tag as the link URI.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf(request)` to extract the caller identity passed into service calls.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse<Language>` to serialize the final payload.
- **`src/modules/locales/services/index.ts`** — Source of `localeService` (`activateLanguage`, `deactivateLanguage`, `describeStoredLanguage`, `standingOn`).
- **`src/modules/locales/routes.ts`** — Consumes `activateLocale` / `deactivateLocale` and mounts them on the Express router.
- **`src/types/index.ts`** — Supplies the `Language` type used as the response generic.
- **`src/modules/locales/tests/unit/service.test.ts`** — Unit-tests the service methods these handlers delegate to; no direct import here.

## Notes

- Both handlers read `request.caller` (a non-standard, app-specific property) to determine the caller's standing via `localeService.standingOn`. Ensure middleware populates it before routing.
- The `operation` string passed to `switchLanguage` becomes the log identifier in `catchAs`; keep it in sync with the OpenAPI `operationId`.
- Deactivation of the fallback language is refused by the service, not by this controller — the refusal path is the shared `refused(response, result)` early return.
