---
source: src/modules/locales/openapi.yaml
sha256: c6d7ca27f90b5336c42ce9e54f2bc56191cc6aed0bcb3554b9e8b4a63845a23a
generated_at: 2026-11-08T06:23:42.885603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **locales** module. It defines the public and admin endpoints for managing supported languages, their apps, dictionaries, and translation entries, plus the module's custom error-code catalogue. It exists so clients, docs generators, and the `module.ts` implementation all agree on the wire format without a second source of truth.

## Key elements

- **`x-error-codes`** — module-scoped error catalogue (11 codes) covering 404 / 409 / 422 cases for languages, entry keys, apps, and entity types.
- **`tags`** — single tag `Locales` (family: Core); all operations self-tag under it.
- **`GET /locales`** (`listLocales`) — public + admin manifest of every language with `apps`, `active` flag, and per-language `actions`. Served `public, no-cache`; admin callers get `private, no-cache` plus hidden inactive rows.
- **`POST /locales`** (`createLocale`) — registers a new language in the dynamic (Tier 2) tier; requires `bearerAuth` or `apiKeyAuth`.
- **`GET /locales/apps`** (`listLocaleApps`) — lists configured translation apps (backend / frontend keyspaces). Unauthenticated, cacheable.
- **`GET /locales/{locale}/dictionary`** (`getLocaleDictionary`) — returns the Tier 1 (deployed-file) dictionary for one language. Intended for offline client rendering.
- *(file truncated — additional paths for `/locales/{locale}/messages`, entry CRUD, and entity-type lookups are implied by the error codes and comments)*
- **`components/schemas`** — `LocaleCapabilities`, `CreateLocaleRequest`, `Language`, `LocaleApps`, and others (defined lower in the file, truncated here).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref` targets for shared response objects (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`), the `Location` header, and the `Locale` schema used as the path parameter type.
- **`src/modules/locales/authorization.yaml`** — defines the `bearerAuth` and `apiKeyAuth` security schemes referenced in the `security` blocks of the admin endpoints.
- **`src/modules/locales/module.ts`** — the runtime implementation whose routes, validators, and i18next wiring must satisfy this contract.
- **`src/modules/invoicing/openapi.yaml`** — sibling module spec; shares the same root-contract `$ref` patterns and tag conventions but defines no direct references to this file.

## Notes

- **Two-tier model is load-bearing.** Tier 1 (deployed files → i18next) is never touched by the database; Tier 2 (MongoDB rows) is only read by `/messages`. Mixing them is the documented failure mode.
- **`{locale}` vs `tag`.** Path parameters use `{locale}` (matching the shared scalar schema); the body field is `tag`. They carry the same value—don't rename one without the other.
- **`messages` ≠ `entries`.** `messages` = built, nested, read-only dictionary. `entries` = flat, paginated, admin CRUD rows. Endpoints must not conflate them.
- **`apps` are configuration, not data.** App ids come from the deployment environment; they are not enumerated in this spec and should never be hardcoded as a closed set.
- **Cache headers are conditional.** `GET /locales` flips from `public, no-cache` to `private, no-cache` for callers holding `display:Locale`; the shared cache serves the public variant to everyone else.
