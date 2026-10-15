---
source: src/modules/products/services/read.ts
sha256: 1f57951cae9639ac2102aaa5cd8164fd528b2c2f00c86a55b7ffde2ac075d9e8
generated_at: 2026-10-15T11:45:02.094847+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/read.ts

## Purpose

Provides the single-product read operations for the products module: scoping a caller's visible products, fetching one product resolved to their locale, applying stock-visibility redaction, and returning the all-locales admin view. It centralises the read-path ordering (present → translate → redact) so callers never duplicate it.

## Key elements

- **`callerScope(caller?)`** — Returns the MongoDB filter that limits which products the given `Caller` may read. Delegates to `accessibleFilterFor(caller, 'Product')`; returns `{}` for unrestricted callers, the published-catalogue filter otherwise.
- **`getById(id?, scope?)`** — Fetches one product by ID within the caller's scope, presents it via `presentProduct`, then applies locale translations. Three-state return: `undefined` (falsy id, no DB call), `null` (no document), `Product` (success).
- **`getByIdForCaller(id?, scope?, context)`** — Route-level wrapper around `getById` that additionally redacts stock counters unless the caller holds `inventory.any.read`. Exists as a separate function because most internal callers (tests, other services) lack a `CallerContext`.
- **`getAdmin(id, caller?)`** — Unscoped, all-translations view for the editor form. Returns a `ProductAdmin` with a `translations` array (every language that has a row) plus a fallback built from the product's own `title`/`description` when no translation row exists. Stock is still redacted based on caller permissions.

## Relationships

- **`@kernel/access/query`** — `callerScope` delegates filtering logic to `accessibleFilterFor`.
- **`@kernel/translation`** — `getById` and `getAdmin` use `applyTranslations` to resolve per-locale content.
- **`@infrastructure/persistence/versioning`** — `getAdmin` calls `carryVersion` to stamp the optimistic-lock version onto the response.
- **`../presenter`** — `presentProduct` shapes the raw document into the wire format; called before translation in both `getById` and `getAdmin`.
- **`../repository`** — All DB access goes through `productRepository` (`findByIdScoped` for scoped reads, `findById` for the unscoped admin read).
- **`./stock-view`** — `canSeeStock` / `redactStock` gate inventory counters in both caller-facing and admin responses.
- **`./lookups`** — `translationsWithFallback` supplies the multi-locale rows for `getAdmin`.
- **`@types`** — Imports `Product`, `ProductAdmin`, `Caller`, `CallerContext` for signatures.

## Notes

- **Presentation order is load-bearing.** `presentProduct` must run *before* `applyTranslations`; the translation overlay is a plain-object merge that would clobber presenter-computed fields (`available`, `id`, ISO dates). Do not reorder.
- **Three-state `getById` return.** Callers must distinguish `undefined` (no id supplied) from `null` (id supplied, not found). Tests and routes rely on this.
- **`getAdmin` has no scope parameter.** The admin route is gated at the router layer; this function trusts the caller.
- **Fallback translation.** When the product has no translation row in its fallback language, `getAdmin` synthesises one from the document's own `title`/`description` columns rather than returning an empty array.
