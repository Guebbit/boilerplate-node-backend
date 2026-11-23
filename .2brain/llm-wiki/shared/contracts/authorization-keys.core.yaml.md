---
source: shared/contracts/authorization-keys.core.yaml
source_sha256: fefb884fef852dcec6509777a58f3499df5687d01779bb73fffd43a298610155
context_sha256: ef1bf1698bf4a1ea79816a060f34fead9b1e78ea57bd5c822f7c218473544425
generated_at: 2026-11-22T02:23:15.778847+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/authorization-keys.core.yaml

## Purpose
Declares the authorization keys (rules) and named permission sets owned by the `core` module for translations. It makes `Translation` its own permission subject so that rewording content can be gated separately from changing the entity being translated.

## Key elements
- **Rule `read:Translation`** (module `core`, scope `tenant`): read an entity's translated fields in the admin shape (every locale at once).
- **Rule `update:Translation`** (module `core`, scope `tenant`): write an entity's translated fields. It never grants a write on the entity itself (e.g. `update:Product`).
- **Set `TranslationDisplay`**: bundles `read:Translation`.
- **Set `TranslationManagement`**: bundles `update:Translation`.

## Relationships
- `shared/authorization-keys.generated.yaml` is the neighboring generated file in the dependency graph. The content here does not show how it is produced or consumed.

## Notes
- `Translation` is deliberately separate from `Locale` (a translator writes words for an entity a locale is already active for, never the locale's own row). It is also separate from the translated entity, so a mistranslation can never become a mischanged price.
- The rules are unconditional, so `any` is their only reading and no narrower one is made explicit.
- Ownership is `core`, not `locales`. The guarded subject is the port in `src/kernel/translation.ts`, which every module writing translatable content uses whether or not `locales` is installed. Removing `locales` must not remove the ability to gate a rewording on these keys.
- On the product write route, `update:Translation` and `update:Product` are stacked, so neither alone can turn a rewording into a repricing.
