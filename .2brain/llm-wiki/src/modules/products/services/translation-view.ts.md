---
source: src/modules/products/services/translation-view.ts
sha256: 0f4d66764aa962d48d463e85ac739c53b11e1e575e28c9edc93c4d06aee7bd92
generated_at: 2026-10-29T05:30:39.640341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/translation-view.ts

## Purpose

Single-purpose ability gate that decides whether a given caller can view a product's full `translations` field (all locales, including drafts). It exists because the editor's tab UI needs every locale's copy, which is a broader read than the shopper-facing resolved `title`/`description`. The check is isolated so route handlers and read services can apply it without duplicating the rule name.

## Key elements

- **`canSeeTranslations(caller?: Caller): boolean`** – Returns `true` only when `caller` is defined **and** holds the `read:Translation` ability. Never checks a write key (e.g. `update:Product`); read and write are separate grants.

## Relationships

- **`src/types/index.ts`** – Provides the `Caller` type imported as `@types`.
- **`src/kernel/ability.ts`** – Supplies the `holds(caller, domain, resource)` predicate that `canSeeTranslations` delegates to.
- **`src/modules/products/routes.ts`** / **`src/modules/products/services/read.ts`** – Upstream consumers that call `canSeeTranslations` before exposing the `translations` field to the request.
- **`src/types/auth-context.ts`** – Defines (or re-exports) the `Caller` shape used in the function signature.

## Notes

- The module is intentionally minimal (one exported function, no state). Follow the same field-level shape as `./stock-view` if adding sibling view gates.
- Pass `undefined` (not `null`) for anonymous requests; the guard is a simple `!== undefined` check, so a `null` caller would slip through and be forwarded to `holds`, which may throw.
- The ability string is the composite `'read:Translation'` (domain `read`, resource `Translation`). Do not confuse it with product-scoped reads.
