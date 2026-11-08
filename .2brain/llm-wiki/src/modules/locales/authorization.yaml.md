---
source: src/modules/locales/authorization.yaml
sha256: 7600abc359fd603040ad05aedb2c79c45a89f3e177bef5884fb90fc39592bca3
generated_at: 2026-11-08T06:20:15.659348+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/authorization.yaml

## Purpose

Declares the authorization rules and named permission sets for the `locales` module. It defines what actions a tenant-scoped principal may perform on `Locale` subjects and groups those actions into composable sets consumed by the API layer.

## Key elements

- **rules** — Five action rules on subject `Locale` (module `locales`, scope `tenant`):
  - `read` — View active locales and their dictionaries; conditioned on `active: true`.
  - `display` — View every locale regardless of publish state (e.g. draft languages).
  - `create` — Add a locale.
  - `update` — Change a locale or one of its entries.
  - `delete` — Remove a locale or one of its entries.
- **sets** — Three named groupings that reference the rules above:
  - `LocaleStorefront` — bundles `read:Locale`.
  - `LocaleDisplay` — bundles `display:Locale`.
  - `LocaleManagement` — bundles `create:Locale`, `update:Locale`, `delete:Locale`.

## Relationships

- **src/modules/locales/openapi.yaml** — The OpenAPI spec for the locales module defines the HTTP endpoints; this file supplies the authorization rules and sets that gate those endpoints. Each set name (e.g. `LocaleManagement`) is the expected reference used in route-level permission checks defined in the OpenAPI document.

## Notes

- The `read` action is *not* the same as `display`: `read` is filtered by the `active: true` condition, while `display` intentionally bypasses that filter to expose draft/pending locales to staff.
- Sets use the shorthand `action:Subject` format (e.g. `create:Locale`) rather than inline rule objects; this keeps set definitions compact.
- All rules are scoped to `tenant`, so cross-tenant access to locales is not granted by any rule in this file.
