---
source: src/modules/locales/controllers/get-locales.ts
source_sha256: 7b63582bb31a8eb301e77b4e6405e691a7bd10ac9c5da8f36b3966920d540731
context_sha256: 494add7288b065ab68acaf7ab62a38158978ebe41db94367dc27fff92f710b19
generated_at: 2026-11-22T05:42:53.769413+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/controllers/get-locales.ts

## Purpose
Express controllers for the read side of the locales API: the manifest of languages (`GET /locales`), a single language row (`GET /locales/:locale`), and this API's own filesystem-backed message dictionary for one language (`GET /locales/:locale/dictionary`).

## Key elements
- **`getLocales`**: Calls `localeService.listCapabilities` with the caller's scope and standing, and returns the result as `LocaleCapabilities`. It lists languages from both tiers, and `scopes` marks each as `api` (usable as `Accept-Language`) or `app` (a dictionary is downloadable). The dynamic half is best-effort, so a database outage only removes the downloadable languages.
- **`getLocale`**: Calls `localeService.readLanguage` for `request.params.locale` under the same scoping. If `refused(response, result)` is true it returns without sending anything further. Otherwise it sets an ETag from `result.data` (so a name edit can send `If-Match`) and responds with a `Language`.
- **`getLocaleDictionary`**: Reads the API's own message dictionary (about 60 keys) from the filesystem.
  - It answers 404 with `generic.error-unprocessable-content` if the locale is missing or `hasServedDictionary` is false.
  - Otherwise it sets `Content-Language` to `canonicalLocale(locale)` and returns `{ locale, messages }` as a `LocaleDictionary`.

## Relationships
- **`../services` (`localeService`)**: Supplies `callerScope`, `readStanding`, `listCapabilities` and `readLanguage`, which the list and single-language controllers use for caller-based scoping.
- **`@infrastructure/http/controller`**: Provides `catchAs` (the promise `.catch` handler, labelled `'listLocales'` / `'getLocale'`) and `refused` (detects service refusals).
- **`@infrastructure/http/response`**: Provides `successResponse` and `rejectResponse`.
- **`@infrastructure/http/preconditions`**: Provides `setEtag`.
- **`@infrastructure/i18n`**: Provides `canonicalLocale`, `hasServedDictionary`, `readLocaleDictionary` and `t`.
- **`@types`**: Provides the `Language`, `LocaleCapabilities` and `LocaleDictionary` types.
- **`src/modules/locales/routes.ts`**: Mounts these controllers on the paths above.

## Notes
- The dictionary route is separate from the database-backed client UI copy at `GET /locales/:locale/messages`. It reads the filesystem so it still works when that route is down.
- The supported list is derived from the dictionary directory itself, so `hasServedDictionary` serves as both the 404 check and the path-traversal guard. A language that is switched off returns 404, the same as an unknown one.
- The dictionary route is language-neutral, so no middleware sets its content language. The handler sets `Content-Language` itself.
- `getLocaleDictionary` is synchronous and has no `catchAs` wrapper, unlike the other two controllers.
