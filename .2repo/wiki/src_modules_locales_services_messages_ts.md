# src/modules/locales/services/messages.ts

## Purpose

Provides the two read paths that deliver stored translation copy: one for a frontend client to download a language's overrides, and one for the API's own i18n overlay. Both expand flat database rows into nested message trees via `buildMessageTree`; they differ only in which tenant's keyspace they serve.

## Key elements

- **`readMessages(tag, tenant?)`** — Returns a `LocaleMessages` object (locale tag, revision, nested message tree) for a single language. Rejects non-frontend tenants and inactive/unknown languages with `languageNotFound()` (404). Defaults `tenant` to the deployment's frontend tenant.
- **`readApiOverrides()`** — Returns `Record<string, Record<string, unknown>>` mapping each language tag to its expanded backend-tenant override tree. Groups raw rows by locale, builds a tree per locale, and isolates per-locale `buildMessageTree` failures (logs a warning, continues with remaining locales).

## Relationships

- **`./keys` → `buildMessageTree`** — The sole key-expansion utility; both reads delegate flat-row-to-tree conversion here.
- **`./languages` → `languageNotFound`** — `readMessages` returns this factory's result for any rejected language/tenant.
- **`../tenants` → `backendTenant`, `frontendTenant`, `isFrontendTenant`** — Gate which tenant's rows each read may serve.
- **`../repository` → `localeRepository`, `localeMessageRepository`** — Data access: look up a language by tag, list message rows by locale+tenant or by tenant.
- **`@infrastructure/http/response` → `generateSuccess`, `ResponseSuccess`, `ResponseReject`** — Shape the success/reject return of `readMessages`.
- **`@infrastructure/adapters/logger` → `logger`** — `readApiOverrides` logs a warning when a locale's tree build throws.
- **`@types` → `LocaleMessages`, `LocaleTenant`** — Return and parameter types.
- **`services/index.ts`** — Re-exports these functions as the public service surface for the locales module.

## Notes

- **Inactive-language asymmetry.** `readMessages` treats an inactive language identically to an unknown one (404) to avoid leaking its existence to the public. `readApiOverrides` deliberately *includes* inactive languages so a mid-translation deactivation does not silently revert the backend copy.
- **Per-locale error isolation.** A malformed key (e.g. a key that is both a string leaf and a group node) throws inside `buildMessageTree`. `readApiOverrides` wraps each locale's build in a try/catch so one bad language does not take down the entire overlay refresh; `readMessages` has no such guard (single-language scope).
- **`__proto__` and ambiguous keys.** `buildMessageTree` (in `./keys`) is the single place that rejects `__proto__` keys and detects string-vs-group conflicts; this file does not re-implement that logic.
- **Parameter naming.** The first argument of `readMessages` is `tag` (a language tag like `en`), not a generic "tag"; the JSDoc calls it "one language."
