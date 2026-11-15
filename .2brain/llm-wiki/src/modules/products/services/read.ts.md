---
source: src/modules/products/services/read.ts
sha256: 41575abfef7cd8399cf518776b0afb9236889c6e4644c0ed5a5e1b94b0fd969b
generated_at: 2026-11-14T21:28:26.688535+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/read.ts

## Purpose

Read-side service for single-product lookups. It resolves a stored product to the caller's locale, layers on permission-gated visibility (stock counters, full translation set), and attaches caller-specific actions. It is the shared presentation pipeline used by both the read route (`GET /products/:id`) and the write routes, so a write response is always the product's own read.

## Key elements

- **`callerScope`** — Builds the row-level filter for a caller via `accessibleFilterFor(caller, 'Product')`. Returns `{}` for unrestricted callers.
- **`getById`** — Fetches one product by ID (scoped), resolves it to the request locale. Returns `undefined` for a falsy ID, `null` for a missing document. No stock/translation gating — callers here have no `CallerContext`.
- **`getByIdForCaller`** — The full `GET /products/:id` handler: fetches, presents with standing, resolves locale, applies translations (if permitted), redacts stock (if not permitted), and attaches actions.
- **`presentForCaller`** — Presents an already-fetched `ProductDocument` as a caller sees it (locale + gated fields + actions with the caller's own keys). Used by write routes so the response body equals the product's own read.
- **`presentWithStanding`** *(private)* — Internal pipeline: `resolveToLocale` → `withTranslations` → `redactStock` → `withActions`.
- **`withTranslations`** *(private)* — Appends the full `translations` array (all languages, drafts included) when the caller holds `read:Translation`; no-op otherwise.
- **`resolveToLocale`** *(private)* — Runs `applyTranslations('product', …)` over a single presented document.

## Relationships

- **`@kernel/translation`** — `applyTranslations` performs the locale-resolution overlay on the presented product.
- **`@kernel/access/query`** — `accessibleFilterFor` derives the row-scope predicate from the caller's keys.
- **`@infrastructure/persistence/versioning`** — `carryVersion` preserves the optimistic-locking version when the translations field is attached.
- **`../presenter`** — `presentProduct` shapes the raw document into the wire form (computed `available`, `_id`→`id`, ISO dates) before locale resolution.
- **`../repository`** — `productRepository` provides the scoped document fetch.
- **`./stock-view`** — `canSeeStock` / `redactStock` gate and strip stock counters per caller.
- **`./translation-view`** — `canSeeTranslations` decides whether the full translation set is exposed.
- **`./lookups`** — `translationsWithFallback` loads the multi-language translation rows.
- **`./actions`** — `standingOn`, `standingOnRead`, `withActions` compute and attach the caller's allowed action keys.
- **`../domain/actions`** — Source of the `ProductStanding` type used by the action pipeline.
- **`../model`** — Source of the `ProductDocument` type (the stored shape).
- **`@types`** — `Product`, `CallerContext`, `Caller` type imports.

## Notes

- **Presenter runs before locale resolution.** `applyTranslations` is a plain-object overlay; running it after `presentProduct` would clobber computed fields (`available`, `id`, ISO dates). This is the reverse order used by `orders`/`users` because those have no locale step.
- **Top-level `title`/`description` are always in the request language**, even when `translations` is also present. A staff member browsing in Italian never sees the fallback language in the primary fields.
- **Views are not reported from here.** The response cache hides most reads; the browser reports them via `modules/analytics`.
- **`getByIdForCaller` wraps rather than extends `getById`.** Most internal callers (unit tests, other services) have no `CallerContext` and call `getById` directly.
- **Write-route responses use `presentForCaller`** so the body equals the product's own read (AIP-133/134/164); actions carry the caller's own keys so a write is never served from the shared read cache.
