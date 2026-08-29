# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the locales module, defining the public and admin HTTP surface for language management. It encodes the two-tier locale model (deployed API dictionary vs. database-backed client dictionary), the tenant keyspace concept, and the CRUD endpoints for languages and their translation entries. It exists so that clients, admin UIs, and AI agents share a single normative description of what the service exposes.

## Key elements

- **`paths./locales`** (GET, POST) — Public manifest of supported languages with per-language `tenants` capability; `POST` registers a language in the dynamic (tier-2) tier only.
- **`paths./locales/tenants`** (GET) — Lists the configured translation tenants (e.g. `demo-be`, `demo-fe`) with their `kind` (`backend` | `frontend`).
- **`paths./locales/{locale}`** (GET, PUT, DELETE) — Tier-1 API dictionary retrieval; edit language metadata (display name, direction, visibility); destructive delete that requires prior deactivation (409 while active).
- **`paths./locales/{locale}/messages`** (GET, …) — Tier-2 client dictionary served as a built nested object; admin CRUD on flat `entries` lives on this path.
- **`components.schemas`** — `LocaleCapabilitiesEnvelope`, `CreateLocaleRequest`, `LanguageEnvelope`, `LocaleTenantsEnvelope`, `LocaleDictionaryEnvelope`, `UpdateLocaleRequest`.
- **`components.parameters.LocalePathParam`** — The `{locale}` path parameter shared across per-locale routes.
- **Security** — `bearerAuth` on all mutating and admin-read endpoints; public reads are unauthenticated and cacheable.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced for the `Locale` schema (the language-tag type used by `LocalePathParam`) and for standard error/success response objects (`InternalError`, `Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`, `NotFound`, `Success`). This file depends on the root contract for those shared definitions; no other files are linked in the dependency graph.

## Notes

- **Two tiers never merge.** Tier 1 (deployed files under `src/locales/`) is what i18next resolves and what `GET /locales/{locale}` serves. Tier 2 (MongoDB rows) is served only by `GET /locales/{locale}/messages`. A language existing in the DB does **not** mean the API can answer in it.
- **`messages` vs `entries`** — `messages` is the built, nested, public dictionary object; `entries` are the flat, paginated, admin-editable rows. Conflating them is flagged as the most common source of confusion.
- **`{locale}` (path) = `tag` (stored field).** Same value, different names. The path parameter is `{locale}` for backward compatibility with other modules; the persisted field is `tag`.
- **Tenant IDs are configuration, not an enum.** They come from the deployment environment; the spec deliberately does not hardcode them.
- **Delete guard.** `DELETE /locales/{locale}` returns 409 while the language is still `active`. The intended flow is deactivate → delete, protecting a day's translation work from a mis-click.
