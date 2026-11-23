---
source: src/modules/locales/openapi.yaml
source_sha256: 01c65d77aecca770ed0f428025578b5758728f74c4d268b280f667cb496cc313
context_sha256: 3402e81406301624ff24af197b2a52a0365769100ae476a797a7dd6a58128b71
generated_at: 2026-11-22T05:45:46.201925+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0, titled "locales — module contract") for the locales module. It defines the HTTP surface for supported languages, the API's own message dictionary, and the client-facing translation entries. The file's header comments also document the module's design model: two tiers, apps, and the `messages` vs `entries` naming.

## Key elements
- **`x-error-codes`** – module error catalogue with HTTP status and description:
  - Language errors: `LOCALE_LANGUAGE_NOT_FOUND`, `LOCALE_LANGUAGE_EXISTS`, `LOCALE_LANGUAGE_IS_FALLBACK`, `LOCALE_LANGUAGE_ALREADY_ACTIVE`, `LOCALE_LANGUAGE_ALREADY_INACTIVE`.
  - Entry key errors: `LOCALE_ENTRY_KEY_EXISTS`, `LOCALE_ENTRY_KEY_COLLISION`, `LOCALE_ENTRY_KEY_INVALID`.
  - App and entity errors: `LOCALE_APP_UNKNOWN`, `LOCALE_ENTITY_TYPE_UNKNOWN`, `LOCALE_ENTITY_NOT_FOUND`.
- **Tag `Locales`** (`x-family: Core`) – the tag all operations are filed under.
- **`GET /locales`** (`listLocales`) – public, cacheable manifest of every language from both tiers. Each row reports `apps`, `active` and `actions`. Optional bearer auth; a caller holding `display:Locale` gets a private answer that includes switched-off registered languages and `actions` flags set to `true`. Returns `LocaleCapabilities`.
- **`POST /locales`** (`createLocale`) – registers a language in the dynamic tier. Requires `create:Locale` (bearer or API key). Returns `201` with `Language` and a `Location` header. Errors: 401, 403, 409 (`LOCALE_LANGUAGE_EXISTS`), 422.
- **`GET /locales/apps`** (`listLocaleApps`) – public, cacheable list of configured apps, each with a `kind` of `backend` or `frontend`. It comes from environment configuration. Returns `LocaleApps`.
- **`GET /locales/{locale}/dictionary`** (`getLocaleDictionary`) – public, cacheable tier-1 dictionary (the API's own deployed files). It is meant for clients that get no response at all.
- Further paths are referenced in the comments but not visible here: `GET /locales/{locale}/messages` and the admin entry routes.
- **Schemas** referenced under `#/components/schemas`: `LocaleCapabilities`, `CreateLocaleRequest`, `Language`, `LocaleApps`.

## Relationships
- `module.ts` is the module's code counterpart. This file is its contract, so operation ids, error codes and routes should stay in sync with it.
- `authorization.yaml` is the sibling authorization file. The operations here use permissions such as `create:Locale` and `display:Locale` in their `security` blocks, and these should match what that file declares.

## Notes
- **Two tiers never merge.**
  - Tier 1 is deployed files, loaded into i18next at boot. It is deploy-only so it still works when the database or network is down.
  - Tier 2 is MongoDB rows edited at runtime. Nothing in the request path reads it.
- **One language is picked per request** from all switched-on languages. A language registered without a deployed file is served, but the API's own messages fall back to the default language one at a time.
- **Apps** are keyspaces such as `demo-be` and `demo-fe`. Rows are identified by (language, app, key). App ids are configuration, not an enum in this file.
- **Naming:** `messages` is the built dictionary (public, nested, read-only). `entries` are the rows (admin, flat, paginated, CRUD).
- **`{locale}` vs `tag`:** the path parameter is `{locale}` and the stored field is `tag`. They hold the same value.
- **Shared refs:** responses and headers (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `Location`) are `$ref`'d from `shared/contracts/openapi.root.yaml`.
- **Custom extensions:**
  - `x-cache: revalidate` marks the cache behaviour of GET routes.
  - `x-versioned: [post]` on `/locales` tells the bundler to add `ETag` and `Content-Location` to 2xx answers.
  - Per-operation `x-error-codes` maps a status to the codes it can return.
- The fallback language cannot be deactivated or deleted, because every translatable row's source lives there.
