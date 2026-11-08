---
source: src/modules/products/services/read.ts
sha256: da36007e11a4b4f74caaca963a8bba491b3a6e1c9008d9f2ee0351d99db23119
generated_at: 2026-11-08T07:47:57.495407+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/read.ts

## Purpose

Handles all single-product read operations: scoping what a caller may read, resolving a stored product into the request's locale, and conditionally attaching translations and stock counters based on caller permissions. Exists as the canonical "read one product" path so that locale resolution, presentation ordering, and permission gating live in one place.

## Key elements

- **`callerScope(caller?)`** — Builds the row-level filter a caller is allowed to read via `accessibleFilterFor(caller, 'Product')`. Returns `{}` for unrestricted callers; the published-catalogue filter otherwise.
- **`getById(id, scope?)`** — Fetches a product by ID (scoped) and returns it presented + locale-resolved. Three-way return: `undefined` (falsy id, no DB hit), `null` (not found), `Product` (found).
- **`getByIdForCaller(id, scope, context)`** — The `GET /products/:id` handler. Same fetch as `getById` but additionally attaches `translations` (if `read:Translation`) and preserves/redacts stock counters (based on `read:StockLevel`).
- **`resolveToLocale(product)`** *(private)* — Runs `presentProduct` then `applyTranslations` to produce the wire shape in the request's language.
- **`withTranslations(product, resolved, caller)`** *(private)* — If the caller may read translations, fetches them via `translationsWithFallback` and merges them onto the resolved product, preserving version metadata with `carryVersion`.

## Relationships

- **`@kernel/translation` (`applyTranslations`)** — Resolves the presented product into the request's locale.
- **`@kernel/access/query` (`accessibleFilterFor`)** — Derives the scope filter passed to the repository.
- **`../presenter` (`presentProduct`)** — Converts a stored `ProductDocument` to the wire shape; must run *before* locale resolution.
- **`../repository` (`productRepository.findByIdScoped`)** — Performs the actual scoped DB lookup.
- **`../model` (`ProductDocument`)** — The stored-document type consumed by the presenter and translation helpers.
- **`./stock-view` (`canSeeStock`, `redactStock`)** — Decides whether raw stock counters survive or are stripped.
- **`./translation-view` (`canSeeTranslations`)** — Gate for attaching the `translations` array.
- **`./lookups` (`translationsWithFallback`)** — Retrieves all translation rows (including drafts) for a product.
- **`@infrastructure/persistence/versioning` (`carryVersion`)** — Propagates optimistic-locking version when `translations` is merged.
- **`@types` (`Product`, `CallerContext`, `Caller`)** — Shared type contracts used throughout.
- **`./index.ts`** — Re-exports the public symbols from this module.

## Notes

- **Presentation order is load-bearing.** `presentProduct` must run before `applyTranslations`; the latter is a plain-object overlay that would clobber computed fields (`available`, `_id → id`, ISO date strings).
- **`getByIdForCaller` wraps, not calls, `getById`.** Most internal callers (tests, other services) have no `CallerContext`, so the two paths stay separate to avoid a nullable-context parameter on the simpler function.
- **No view/telemetry reporting here.** Response caching hides most reads from the analytics pipeline; the browser-side `modules/analytics` reporter covers visibility.
- **Top-level `title`/`description` are always in the request's language**, even when the `translations` array is also present — a staff member browsing in Italian will not see the fallback language in those fields.
