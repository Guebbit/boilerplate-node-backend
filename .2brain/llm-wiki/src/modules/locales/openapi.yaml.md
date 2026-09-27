---
source: src/modules/locales/openapi.yaml
sha256: 0dd61cd56f42af33fa371a520da3b372c5045ba6ecf96521fdc2e40b73edd1fc
generated_at: 2026-09-27T14:59:50.578432+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the **locales** module. It documents the REST surface for managing languages and translation entries, and — more importantly — encodes the architectural split between two tiers of locale data (deployed API dictionary vs. client-editable database rows) so that every consumer knows which capability a given endpoint actually provides.

## Key elements

- **`/locales` (GET)** — `getLocales`: public, unauthenticated list of supported languages with per-tenant capability info (`tenants` array). Admins additionally see inactive languages (`active: false`).
- **`/locales` (POST)** — `createLocale`: admin-only registration of a new language in the dynamic (DB) tier. Does **not** make the API answer in that language (that requires a deployed dictionary file).
- **`/locales/tenants` (GET)** — `getLocaleTenants`: public list of configured tenants with `kind` (`backend` | `frontend`) so clients know what each keyspace means.
- **`/locales/{locale}` (GET)** — `getLocaleDictionary`: serves the API's own tier-1 dictionary for one language. Intended as a fallback for the client when no response arrives.
- **`/locales/{locale}` (PUT)** — `replaceLocale`: full replacement of a language's mutable fields (display names, direction, visibility). Tag is immutable.
- **`/locales/{locale}` (PATCH)** — `updateLocale`: RFC 7396 merge-patch of the same mutable fields.
- **`/locales/{locale}/messages`** (truncated, but referenced throughout): serves the tier-2 client dictionary from MongoDB; distinct from the tier-1 dictionary above.
- **Components** — `LocaleCapabilitiesEnvelope`, `LanguageEnvelope`, `LocaleTenantsEnvelope`, `LocaleDictionaryEnvelope`, `CreateLocaleRequest`, `ReplaceLocaleRequest`, `UpdateLocaleRequest`, `LocalePathParam`, and (presumably) entry/message schemas.
- **Shared `$ref`s** — all error responses (`InternalError`, `Unauthorized`, `Forbidden`, `Conflict`, `NotFound`, `ValidationError`) and the `Locale` scalar schema are pulled from `shared/contracts/openapi.root.yaml`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — this file `$ref`s the root contract for the `Locale` parameter schema and every shared error-response component. It is the single source of truth for cross-module error shapes and the canonical locale scalar type.
- **`src/modules/locales/module.ts`** — the runtime implementation that mounts the routes and handlers described by this spec. The spec is the contract; `module.ts` is what fulfils it.

## Notes

- **Two tiers, never merged.** Tier 1 lives in deployed files under `src/locales/` and is loaded into i18next at boot; it is the only copy available if the database is down. Tier 2 lives in MongoDB and is editable at runtime. `GET /locales/{locale}` serves tier 1; `GET /locales/{locale}/messages` serves tier 2. Conflating them is the primary design hazard this spec guards against.
- **`tenants` is the real capability signal.** A language can exist in the DB (frontend tenant) without the API being able to answer in it (no backend tenant yet). The manifest returns `tenants` per language precisely to keep "can I send `Accept-Language: es`" and "can I download a Spanish UI dictionary" as two separate answers.
- **`messages` vs `entries`.** `messages` = built, nested, read-only dictionary object (public). `entries` = flat, paginated, CRUD-able rows (admin). The spec enforces this distinction in endpoint naming and schema shapes.
- **`{locale}` in path, `tag` in body.** They carry the same value. The path parameter is named `{locale}` to stay consistent with the shared `Locale` scalar `$ref`'d by every other module; the stored field is called `tag` because a database row about a language calls its identifier a tag.
- **PUT is full-replace, PATCH is merge.** PUT requires every writable field (RFC 9110 §9.3.4); PATCH follows RFC 7396. The `tag` field is immutable in both — changing it would rename the entire dictionary.
- **Tenant IDs are configuration, not an enum in this file.** They come from the API's environment. The `GET /locales/tenants` endpoint exposes them at runtime so no client hardcodes them.
