---
source: src/modules/locales/authorization.yaml
source_sha256: 7600abc359fd603040ad05aedb2c79c45a89f3e177bef5884fb90fc39592bca3
context_sha256: df6a0e331710a59bd8178fb43abecfb4f541d40c802fd2c2c64b9c93d04f976d
generated_at: 2026-11-22T05:41:37.738271+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/authorization.yaml

## Purpose
Declares the authorization rules and rule sets for the `locales` module. It defines which actions can be performed on the `Locale` subject and bundles them into named sets that can be granted as units.

## Key elements
- **Rules** (all `module: locales`, `subject: Locale`, `scope: tenant`):
  - `read:Locale` — read active locales and their dictionaries (the storefront view). Carries the condition `active: true`.
  - `display:Locale` — read every locale regardless of publish state, so staff can see draft languages. No conditions.
  - `create:Locale` — add a locale.
  - `update:Locale` — change a locale or one of its entries.
  - `delete:Locale` — remove a locale or one of its entries.
- **Sets**:
  - `LocaleStorefront` — `read:Locale`.
  - `LocaleDisplay` — `display:Locale`.
  - `LocaleManagement` — `create:Locale`, `update:Locale`, `delete:Locale`.

## Relationships
- Sits beside `src/modules/locales/openapi.yaml` in the same module. Both describe the locales module's surface: this file covers who may act, the other covers the API. The content here does not reference it explicitly.

## Notes
- `read` and `display` are separate actions. `read` is restricted to `active: true` locales, while `display` has no condition and returns drafts too.
- `LocaleManagement` does not include `display`. Staff who manage locales also need `LocaleDisplay` to see draft locales.
- Rules in a set are referenced as `action:Subject`.
