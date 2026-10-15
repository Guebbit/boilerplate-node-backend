---
source: src/modules/locales/openapi.yaml
sha256: e4bfdde535beeb288956af9d3a2883535ddc932cb79dff6e323f12454bd461b5
generated_at: 2026-10-15T10:44:08.921685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **locales** module. It defines the REST surface for querying, creating, and editing the translation languages a deployment serves — both the API's own deployed dictionaries (Tier 1) and the client-facing dictionaries stored in MongoDB (Tier 2) — and for listing the translation "apps" (keyspaces) configured for a deployment.

## Key elements

- **Tags** — `Locales`: all operations in this file are tagged under this single tag.
- **`GET /locales`** (`getLocales`) — Returns per-language capability manifest (`apps` array) for both tiers. Public/unauthenticated; admins additionally see inactive languages.
- **`POST /locales`** (`createLocale`) — Registers a new language in the dynamic (Tier 2) tier only. Does **not** make the API answer in that language.
- **`GET /locales/apps`** (`listLocaleApps`) — Lists the configured translation apps (e.g. `demo-be`, `demo-fe`) with their `kind` (`backend` | `frontend`). Sourced from environment configuration, not from the database.
- **`GET /locales/{locale}`** (`getLocaleDictionary`) — Serves the API's own (Tier 1) dictionary for one language; intended for client fallback when no response arrives.
- **`PUT /locales/{locale}`** (`replaceLocale`) — Full replacement of a language's mutable fields (display names, direction, visibility). Tag is immutable. Returns 409 if it would deactivate the fallback language.
- **`PATCH /locales/{locale}`** (`updateLocale`) — RFC 7396 partial merge of the same fields. Same immutability and 409 rules as PUT.
- **Schemas referenced** (defined in `#/components/schemas/`): `LocaleCapabilitiesEnvelope`, `CreateLocaleRequest`, `LanguageEnvelope`, `LocaleAppsEnvelope`, `LocaleDictionaryEnvelope`, `ReplaceLocaleRequest`, and others.
- **Shared `$ref`s** — Error responses, `Location` header, and the `Locale` path-parameter schema are all pulled from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Every standard error response (`401`, `403`, `404`, `409`, `422`, `500`), the `Location` response header, and the `Locale` scalar schema are `$ref`-ed from this shared contract. This file does not redefine them.
- **`src/modules/locales/module.ts`** — The implementation module that fulfils every operation declared here. The spec is the contract; the module is the handler that produces the responses.

## Notes

- **Two tiers never merge.** Tier 1 (deployed i18next files) and Tier 2 (MongoDB rows) are separate capabilities. A language existing in the DB does *not* mean the API can answer in it. `GET /locales` reports `apps` per language precisely so these stay distinct.
- **`messages` vs `entries`.** `messages` = the built, nested, read-only dictionary a client downloads. `entries` = the flat, paginated, CRUD-able rows an admin edits. Conflating them is called out as the most common mistake.
- **`{locale}` (path) vs `tag` (body field).** They carry the same value but use different names by convention: the path matches the scalar other modules already reference; the stored row calls its identifier a "tag" because it tags a language.
- **App IDs are configuration, not an enum.** They come from the API's environment at runtime. The spec deliberately avoids hardcoding them.
- **Fallback-language guard.** Both `PUT` and `PATCH` on `/locales/{locale}` return `409` if the change would deactivate the deployment's fallback language, since every translatable row's source text lives there.
