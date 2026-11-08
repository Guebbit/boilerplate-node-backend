---
source: shared/contracts/authorization-keys.core.yaml
sha256: fefb884fef852dcec6509777a58f3499df5687d01779bb73fffd43a298610155
generated_at: 2026-11-08T03:07:12.207836+00:00
model: ollama:qwen3.8:27b
---

# shared/contracts/authorization-keys.core.yaml

## Purpose

Defines the authorization rules and named key-sets for the `Translation` subject. The `Translation` subject exists so that reading or writing an entity's translated fields is a distinct grant from reading or writing the entity itself — a mistranslation can never accidentally become a mischanged price. It is owned by `core` (not `locales`) because the underlying port lives in `kernel/translation.ts` and must remain gateable even if the `locales` module is absent.

## Key elements

- **`rules`** — Two action rules on subject `Translation`, module `core`, scope `tenant`:
  - `read` — Grants access to an entity's translated fields in the admin shape (all locales at once).
  - `update` — Grants a write on an entity's translated fields only; explicitly does **not** grant `update:Product` or any other entity write.
- **`sets.TranslationDisplay`** — Named set bundling `read:Translation`. Intended for admin read surfaces.
- **`sets.TranslationManagement`** — Named set bundling `update:Translation`. Intended for admin write surfaces.

## Relationships

- **`shared/contracts/authorization-keys.root.yaml`** — Sibling contract in the same `contracts` directory. This file declares the `core`-tier rules/sets; the root file holds the corresponding non-core tier for the same subject area. Both are consumed by the authorization engine to resolve effective grants.

## Notes

- The `update:Translation` and `update:Product` keys are stacked on the product-write route. Holding only one of them is insufficient to modify both text and price — this is the deliberate separation the comments call out.
- The `read` rule has no narrower reading; `any` scope is its only valid interpretation, so no explicit scope restriction is added.
- Ownership by `core` means deleting the `locales` module must **not** remove these keys; they gate the translation port, not the locale catalog.
