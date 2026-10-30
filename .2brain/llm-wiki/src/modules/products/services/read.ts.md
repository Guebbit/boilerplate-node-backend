---
source: src/modules/products/services/read.ts
sha256: da36007e11a4b4f74caaca963a8bba491b3a6e1c9008d9f2ee0351d99db23119
generated_at: 2026-10-29T05:29:30.245237+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/read.ts

## Purpose

Single-product read service: determines what a caller may see, fetches one product by ID within that scope, resolves its display fields to the request's locale, and conditionally enriches the result with full translations and stock counters based on the caller's permissions.

## Key elements

- **`callerScope(caller?)`** — Builds the Mongo query filter for a caller via `accessibleFilterFor(caller, 'Product')`. Returns `{}` for unrestricted callers; the published-catalogue filter otherwise.
- **`getById(id, scope?)`** — Fetches one product by ID (early-returns `undefined` for a falsy id). Presents via `presentProduct`, then resolves to the request's locale. Returns `null` if no document matches.
- **`getByIdForCaller(id, scope, context)`** — The `GET /products/:id` handler. Same fetch as `getById`, then attaches `translations` (if `read:Translation` is held) and redacts stock counters (unless `read:StockLevel` is held).
- **`resolveToLocale(product)`** *(private)* — Runs `presentProduct` then `applyTranslations('product', …)` to produce the wire shape in the request's language.
- **`withTranslations(product, resolved, caller)`** *(private)* — If the caller may see translations, fetches all language rows via `translationsWithFallback` and stamps the result with `carryVersion`; otherwise passes the resolved product through unchanged.

## Relationships

- **`@kernel/access/query`** — `callerScope` delegates entirely to `accessibleFilterFor` for the permission-to-filter mapping.
- **`@kernel/translation`** — `resolveToLocale` uses `applyTranslations` to overlay the request's locale onto the presented product.
- **`@infrastructure/persistence/versioning`** — `withTranslations` calls `carryVersion` to propagate the product's version stamp when the translations field is added.
- **`../repository`** — Both public getters call `productRepository.findByIdScoped(id, scope)` to perform the scope-filtered lookup.
- **`../presenter`** — `resolveToLocale` invokes `presentProduct` to convert the stored document into the wire shape.
- **`./lookups`** — `withTranslations` calls `translationsWithFallback(product)` to collect every language row.
- **`./stock-view`** — `getByIdForCaller` uses `canSeeStock` / `redactStock` to gate and strip stock counters.
- **`./translation-view`** — `withTranslations` calls `canSeeTranslations(caller)` as its guard.
- **`../model`** — Imports the `ProductDocument` type for the stored-document shape.
- **`@types`** — Imports `Product`, `Caller`, and `CallerContext` for signatures.
- **`./index`** — Re-exports this module's public API for the services barrel.

## Notes

- **Presentation before translation.** `presentProduct` runs *before* `applyTranslations`; the doc comments call out that translation resolution is a plain-object overlay that would clobber presenter-computed fields (`available`, `id` rename, ISO date strings) if applied first.
- **Wrap, don't fold.** `getByIdForCaller` is a separate function rather than an option on `getById` because most callers (unit tests, cross-service lookups) have no `CallerContext` and should not pay for the permission checks.
- **Translations vs. top-level fields.** When `translations` is attached, the top-level `title`/`description` remain in the *request's* resolved language — they are not left at the document's fallback language.
- **No view reporting.** This service does not emit an analytics view event; the response cache suppresses most reads, and browser-side reporting (`modules/analytics`) covers what the server misses.
- **Return-value triad.** `getById` / `getByIdForCaller` return `undefined` for a missing id, `null` for "not found", and `Product` for a hit. Callers must check all three.
