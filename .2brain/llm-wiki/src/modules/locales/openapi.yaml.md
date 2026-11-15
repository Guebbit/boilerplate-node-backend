---
source: src/modules/locales/openapi.yaml
sha256: 01c65d77aecca770ed0f428025578b5758728f74c4d268b280f667cb496cc313
generated_at: 2026-11-14T20:20:01.718694+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **locales** module: supported languages, the API's own deployed dictionary, and client-editable translation entries. It exists so that both humans and AI assistants can understand the module's public surface, its two-tier translation model, and its error vocabulary without reading the implementation.

## Key elements

- **`x-error-codes`** — Module-specific error registry (11 codes, e.g. `LOCALE_LANGUAGE_IS_FALLBACK`, `LOCALE_ENTRY_KEY_COLLISION`). Each maps a code to an HTTP status and a plain-English description. Referenced by individual operations' `x-error-codes` arrays.
- **`tags`** — A single tag `Locales` (family: Core) that groups all operations in this file.
- **`paths`**
  - `GET /locales` — Lists every language the deployment offers, with per-language `apps` and `active` flags. Public, cacheable; admins see extra rows and actionable flags.
  - `POST /locales` — Registers a language in the dynamic (Tier 2) tier. Requires `create:Locale`.
  - `GET /locales/apps` — Lists configured translation apps (keyspaces). Public, unpaged, sourced from deployment config.
  - `GET /locales/{locale}/dictionary` — Serves the API's own Tier 1 dictionary for one language.
  - *(file truncated; additional paths for `/locales/{locale}/messages`, entry CRUD, and language toggling follow)*
- **Schemas referenced** — `LocaleCapabilities`, `CreateLocaleRequest`, `Language`, `LocaleApps` (defined in the file's `components/schemas` section, not shown in the truncated excerpt).
- **Design comments** — Large block comments inline document the two-tier model (deployed files vs. MongoDB rows), the `messages` vs. `entries` naming convention, the `{locale}`-in-path vs. `tag`-in-body distinction, and the app/keyscape model.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — `$ref`s shared response objects (`Unauthorized`, `Forbidden`, `Conflict`, `ValidationError`) and the `Location` header into every operation's response block. This file is the consumer; the root contract is the provider.
- **`src/modules/locales/authorization.yaml`** — Defines the scope names (`create:Locale`, `display:Locale`, etc.) that appear in the `security` blocks here. The scopes are declared there and consumed here.
- **`src/modules/locales/module.ts`** — The runtime module that mounts the routes described in this spec. The YAML is the contract; `module.ts` is the implementation entry point.
- **`src/modules/invoicing/openapi.yaml`** — Sibling module spec. No direct `$ref` between the two, but both reference the same root contract and follow the same `x-error-codes` / `x-cache` / `x-versioned` conventions.

## Notes

- **Two tiers never merge.** Tier 1 (deployed locale files) is read-only and in-process (i18next). Tier 2 (MongoDB rows) is runtime-editable. A language can exist in only one tier, both, or be registered but inactive. The spec enforces this distinction in endpoint naming: `dictionary` = Tier 1, `messages` = Tier 2.
- **`messages` vs. `entries`.** `messages` is the built, nested, public dictionary object. `entries` are flat, paginated, admin-CRUD rows. Mixing them in one endpoint is called out in the file as the most common design mistake.
- **`{locale}` in paths, `tag` in bodies.** The path parameter is always `locale` (matching the scalar other modules `$ref`). The stored field on a language row is `tag`. They carry the same value; the naming is intentional and should not be "fixed" to match.
- **`x-error-codes` is per-operation, not global.** The top-level map is the registry; each operation lists which codes it can return via its own `x-error-codes` array (e.g. `POST /locales` returns only `LOCALE_LANGUAGE_EXISTS`).
- **`active: false` gates selection only.** It does not remove a language from `GET /locales`; it merely prevents the API from picking it for a request. Clients are expected to hide it from their UI.
- **Apps are configuration, not data.** The app list comes from the API's environment, not the database. A client cannot create an app; it can only target ones already listed by `GET /locales/apps`.
