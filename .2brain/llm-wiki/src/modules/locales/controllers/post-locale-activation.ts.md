---
source: src/modules/locales/controllers/post-locale-activation.ts
sha256: b70ec12dc0c1e1d44a63e51a3aaaa71357923d64c08b434f187ae1277529525f
generated_at: 2026-11-08T06:21:38.115745+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/post-locale-activation.ts

## Purpose

Thin Express handlers for the two admin action endpoints `POST /locales/:locale/activate` and `POST /locales/:locale/deactivate`. All business logic (refusal rules, cache invalidation, overlay refresh, audit) lives in `localeService`; this file only extracts the locale param and caller context, invokes the service, and maps the result to an HTTP response.

## Key elements

- **`switchLanguage`** (internal) — factory that builds an Express handler. Takes an operation name (for error logging) and a service function (`activateLanguage` or `deactivateLanguage`). On success it calls `localeService.describeStoredLanguage` to shape the response body; on refusal it short-circuits via `refused()`.
- **`activateLocale`** (exported) — handler wired to `POST /locales/:locale/activate`. Activates a registered language.
- **`deactivateLocale`** (exported) — handler wired to `POST /locales/:locale/deactivate`. Deactivates a language; the fallback language will be refused by the service layer.

## Relationships

- **`src/modules/locales/services/index.ts`** — calls `localeService.activateLanguage`, `localeService.deactivateLanguage`, and `localeService.describeStoredLanguage`. All domain logic is delegated here.
- **`src/infrastructure/http/controller.ts`** — imports `catchAs` (unified error-to-response mapping) and `refused` (short-circuit for service-level refusals).
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf` to extract the authenticated caller identity from the request.
- **`src/infrastructure/http/response.ts`** — imports `successResponse` to emit the JSON envelope on success.
- **`src/types/index.ts`** — imports the `Language` type used as the response payload.
- **`src/modules/locales/routes.ts`** — consumes `activateLocale` / `deactivateLocale` to wire them onto the Express router.

## Notes

- Both handlers share the identical handler body; they differ only in the service function passed in and the `operation` string (used in error-log context). Changing one means changing `switchLanguage`, not either export.
- `refused()` is a short-circuit: when the service returns a refusal, the handler responds immediately and **skips** the `describeStoredLanguage` step entirely.
- `standingOn(request.caller)` (called inside `describeStoredLanguage`) is not a property of the service but a second argument the controller supplies to shape the response relative to the caller.
- The file is a `@module` (no default export); the two named exports are the only public surface.
