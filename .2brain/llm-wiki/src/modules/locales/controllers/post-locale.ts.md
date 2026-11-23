---
source: src/modules/locales/controllers/post-locale.ts
source_sha256: aa050a895a328c58d8e43a0af2fb51192358f2b63f51c33872c043371ef4b454
context_sha256: 5e9bb3e37a382a138c7c3b0c3868a178f34c764c1800705fd24a370b994fdc76
generated_at: 2026-11-22T05:43:33.500458+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/post-locale.ts

## Purpose
Controller for `POST /locales` (admin): registers a new language in the dynamic tier. Per the file's header, a language switched on becomes servable immediately: subsequent requests are negotiated against the new list, and product text and search follow. The API's own messages fall back to the default language until a dictionary file is deployed for it. Editing and removal live in `./update-locale.ts` and `./delete-locale.ts`.

## Key elements
- `createLocale(request, response)`: the only export, an Express handler that:
  1. Validates the body with `parseBody`, using `CreateLocaleBody` extended so that `tag` goes through `wellFormedLocale`, and `name` and `nativeName` go through `localeService.localeDisplayName`. It returns early if validation fails.
  2. Calls `localeService.createLanguage(body, callerContextOf(request))`. If the result is refused (`refused(response, result)`), it returns early.
  3. Re-reads the stored language with `localeService.describeStoredLanguage(result.data, localeService.standingOn(request.caller))`.
  4. Sets validators and the resource location with `answerAsResource(response, language, location)`, where `location` is `/locales/<tag>`. It then replies with `createdResponse<Language>(response, language, location)`.
  5. Maps any rejected promise to a response via `catchAs(response, 'createLocale')`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `parseBody`, `refused` and `catchAs`, which handle validation, refusal and error mapping.
- `src/infrastructure/http/schemas.ts`: supplies `wellFormedLocale`, which wraps the `tag` schema.
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `createdResponse` sends the creation response.
- `src/infrastructure/http/preconditions.ts`: `answerAsResource` marks the response as the resource at its location. The inline comment says this saves the first edit a re-read.
- `src/modules/locales/services/index.ts` (`localeService`): does the actual work (`createLanguage`, `describeStoredLanguage`, `standingOn`, `localeDisplayName`). Its unit tests are in `src/modules/locales/tests/unit/service.test.ts`.
- `src/modules/locales/routes.ts`: the route module for locales, the neighbor that wires the `POST /locales` endpoint.
- `src/types/index.ts` (`@types`): provides the `CreateLocaleRequest` and `Language` types.

## Notes
- The handler returns promises and is not `async`; failures are handled through `.catch(catchAs(...))`.
- Early returns after `parseBody` and `refused` assume those helpers have already written the response.
- The returned `Language` is built from the stored record (`describeStoredLanguage`), and the location uses the stored `language.tag` rather than the submitted one.
