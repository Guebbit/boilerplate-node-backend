---
source: src/modules/products/services/read.ts
source_sha256: 2eba64be1c4a3caf364571d6b3f28fc6792da810ce10fa9461aac9a3bf1da8c7
context_sha256: a6e3e67d0a4a1619618ef6f0d1b0f2b52bf601441c885dffa9b491513430435c
generated_at: 2026-11-22T07:13:31.720364+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/read.ts

## Purpose
Single-product reads for the products module. It builds the caller's read scope, fetches one product, and returns it in the wire shape resolved to the request's language. For callers allowed to read translations, it also attaches every language, drafts included.

## Key elements
- `callerScope(caller?)`: returns the filter for which products a caller may read, via `accessibleFilterFor(caller, 'Product')`. It takes `request.caller`, not the session, so sessions and API keys behave the same. The filter is `{}` for an unrestricted caller and the published catalogue for everyone else.
- `getById(id, scope?)`: looks the product up with `productRepository.findByIdScoped` and returns it resolved to the request locale. It returns `undefined` for a falsy id (no DB call) and `null` when nothing matches.
- `getByIdForCaller(id, scope, context)`: the `GET /products/:id` path. It does the same lookup, then presents the product for `context.caller` using the read standing from `standingOnRead(callerScope, caller)`.
- `presentForCaller(product, caller?)`: presents an already-stored document the way `GET /products/:id` would. Write routes use it so a write's response matches the product's own read. Its actions are based on `standingOn(caller)`, the caller's own keys.
- Private helpers:
  - `resolveToLocale`: runs `presentProduct`, then `applyTranslations('product', …)`.
  - `presentWithStanding`: resolves to locale, then `withTranslations`, then `withActions`.
  - `withTranslations`: adds `translations` only when `canSeeTranslations(caller)` is true.

## Relationships
- **`src/modules/products/presenter.ts`** (`presentProduct`): converts the document to the wire shape before translation resolution.
- **`src/kernel/translation.ts`** (`applyTranslations`): resolves the product to the request's language.
- **`src/kernel/access/query.ts`** (`accessibleFilterFor`): supplies the read scope used by `callerScope`.
- **`src/modules/products/repository.ts`** (`productRepository`): provides the scoped fetch, `findByIdScoped`, used by every read.
- **`src/modules/products/services/lookups.ts`** (`translationsWithFallback`): supplies the full set of translations.
- **`src/modules/products/services/translation-view.ts`** (`canSeeTranslations`): decides whether the caller sees translations (`read:Translation`).
- **`src/modules/products/services/actions.ts`** (`standingOn`, `standingOnRead`, `withActions`) and **`src/modules/products/domain/actions.ts`** (`ProductStanding` type): compute and attach the per-caller `actions` flags.
- **`src/infrastructure/persistence/versioning.ts`** (`carryVersion`): carries the version over from the resolved product onto the copy that has `translations`.
- **`src/types/index.ts`** (`Product`, `Caller`, `CallerContext`, imported via `@types`) and **`src/modules/products/model.ts`** (`ProductDocument`): types only.
- The graph also lists `src/modules/products/services/index.ts`, `src/modules/products/services/search.ts` and `src/types/auth-context.ts` as neighbors. Nothing in this file imports from them directly.

## Notes
- Order matters. `presentProduct` must run before translation resolution, because resolution is a plain-object overlay and would drop what the presenter computes (`available`, `_id` → `id`, ISO date strings). The orders and users modules' `getById` returns the Mongoose document itself instead.
- Top-level `title` and `description` always carry the request's resolved language, even when `translations` is present.
- `getByIdForCaller` wraps `getById`'s logic rather than folding into it, because most callers (unit tests, other services) have no `CallerContext`.
- This file does not report product views, since the response cache hides most reads. The browser reports them (`modules/analytics`).
- `presentForCaller` uses the caller's own keys for `actions`, because a write is never served from the shared cache. `getByIdForCaller` uses the read standing, which suits a cacheable read.
- `presentForCaller` with an `undefined` caller sees no translations.
