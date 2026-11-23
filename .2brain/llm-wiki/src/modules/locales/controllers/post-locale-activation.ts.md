---
source: src/modules/locales/controllers/post-locale-activation.ts
source_sha256: 2bee98ecd397be809b496b66fe868ff90575a45cb5be94a3967c9c3285bc73b0
context_sha256: bdc506be684267d575b50f2e1ca1d167b3891d8f3568510bae634e193d75f276
generated_at: 2026-11-22T05:43:06.866762+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/post-locale-activation.ts

## Purpose
Express controllers for `POST /locales/:locale/activate` and `POST /locales/:locale/deactivate`, the admin action endpoints that switch a language on or off. The controllers are thin. Refusals, cache clearing, overlay refresh and the audit row all live in the locale service. These handlers only run the service call and map the result to a response.

## Key elements
- `switchLanguage(operation, run)` (not exported): handler factory shared by both endpoints.
  - Calls `run(request.params.locale, callerContextOf(request))`.
  - If `refused(response, result)` reports a refusal, it returns without doing anything further.
  - Otherwise it calls `localeService.describeStoredLanguage(result.data, localeService.standingOn(request.caller))`.
  - It then calls `answerAsResource(response, language, '/locales/<tag>')` and sends `successResponse<Language>`.
  - Any rejection goes to `catchAs(response, operation)`, so failures are logged under the operation name.
- `activateLocale`: `switchLanguage('activateLocale', localeService.activateLanguage)`. Switches a registered language on (admin).
- `deactivateLocale`: `switchLanguage('deactivateLocale', localeService.deactivateLanguage)`. Switches a registered language off (admin). The service refuses to deactivate the fallback language.

## Relationships
- `src/modules/locales/services/index.ts`: supplies `localeService` with `activateLanguage`, `deactivateLanguage`, `describeStoredLanguage` and `standingOn`.
- `src/infrastructure/http/controller.ts`: provides `refused` (short-circuits on a refused service result) and `catchAs` (error mapping and logging by operation name).
- `src/infrastructure/http/request.ts`: `callerContextOf` builds the caller context passed to the service.
- `src/infrastructure/http/response.ts`: `successResponse` sends the success payload.
- `src/infrastructure/http/preconditions.ts`: `answerAsResource` sets the resource's location, here `/locales/<tag>`.
- `src/types/index.ts`: the `Language` type.
- `src/modules/locales/routes.ts`: the file that wires these handlers to their routes (it is a neighbor in the graph; the wiring itself is not shown in this file).
- `src/modules/locales/tests/unit/service.test.ts`: a neighbor in the graph, not exercised directly here.

## Notes
- The `operation` string is documented as the contract's operationId, so it should match the API contract.
- The response uses the language's new tag for the `/locales/<tag>` resource path, not necessarily the `:locale` param. A source comment cites RFC 9110 §8.8.3 for this.
- The admin restriction is stated in the doc comments. It is not enforced in this file, so it presumably sits in the routing or middleware layer.
