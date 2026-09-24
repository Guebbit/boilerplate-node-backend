---
source: src/modules/locales/openapi.yaml
sha256: 4344e885c366659934418e991a7198f44463364e21d5b34f88e55d0db561f929
generated_at: 2026-09-23T18:50:30.871953+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the locales module. It defines the full HTTP surface for managing supported languages, their dictionaries (two distinct tiers: deployed files and database-backed client copies), and tenant-scoped translation entries. The file is both the authoritative API spec and the primary documentation of the module's two-tier separation model.

## Key elements

- **`GET /locales`** (`getLocales`) — Public manifest of every language the deployment offers, with per-language `tenants` showing what each language can actually do (API-side vs client-side).
- **`POST /locales`** (`createLocale`) — Admin-only; registers a language in the dynamic (database) tier. Does **not** make the API answer in that language.
- **`GET /locales/tenants`** (`getLocaleTenants`) — Public list of configured tenant keyspaces with their `kind` (`backend` / `frontend`).
- **`GET /locales/{locale}`** (`getLocaleDictionary`) — Serves the API's own tier-1 (deployed-file) dictionary for one language. Intended for offline / no-response fallback on the client.
- **`PUT /locales/{locale}`** (`updateLocale`) — Admin-only; updates display names, direction, visibility. The `tag` (locale id) is immutable.
- **`DELETE /locales/{locale}`** (`deleteLocale`) — Admin-only; removes the language **and** all its entries. Returns `409` while the language is still `active`.
- **`GET /locales/{locale}/messages`** — Serves the tier-2 (database) client dictionary, built from stored entries into the same nested shape as the tier-1 endpoint.
- **Schemas** — `LocaleCapabilitiesEnvelope`, `CreateLocaleRequest`, `LanguageEnvelope`, `LocaleTenantsEnvelope`, `LocaleDictionaryEnvelope`, `UpdateLocaleRequest`.
- **`LocalePathParam`** — Reusable path parameter referencing the shared `Locale` schema.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — This spec `$ref`s the shared `Locale` schema (path parameters) and all standard error/success responses (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `InternalError`, `NotFound`, `Success`). It does not define those; they live in the root contract.
- **`src/modules/locales/module.ts`** — The runtime implementation that this spec describes. The module's routes, request/response shapes, and auth requirements are the behavioural counterpart to the definitions here.

## Notes

- **Two tiers, never merged.** Tier 1 (deployed files under `src/locales/` / `src/modules/*/locales/`, loaded into i18next) and Tier 2 (MongoDB rows, edited via admin routes) are architecturally separate. A language existing in the DB does *not* mean the API can answer in it.
- **`messages` vs `entries`.** `messages` = the built, public, nested dictionary (one object). `entries` = the admin, CRUD, flat, paginated rows. Conflating them is the most common source of bugs in this feature.
- **`{locale}` in path, `tag` in body.** Deliberately different names for the same value. The path parameter stays `{locale}` for backward compatibility with every other module; the stored row's field is called `tag`.
- **Tenant IDs are configuration, not data.** They come from the API's environment. The spec intentionally does not enumerate them; `GET /locales/tenants` is the source of truth at runtime.
- **Delete is two-step.** `DELETE` returns `409` while `active: true`. The caller must `PUT` the language to inactive first, then delete. This is a deliberate guard against destroying a day's translation work with a mis-click.
