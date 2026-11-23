---
source: src/modules/products/services/actions.ts
source_sha256: 65b0140b70fc152addce38e7318777e9ef6b5efebc8b206c705bc12f62a228a1
context_sha256: 5dc62a67e3d13d5448a1709171eedff72796b75f551a53c7a154c8430ba33501
generated_at: 2026-11-22T07:12:22.569570+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/actions.ts

## Purpose
Stamps an `actions` field onto a product for the caller reading it, so clients don't re-derive permission rules. The rules themselves live in `src/modules/products/domain/actions.ts`. This file reads the caller's permission keys and applies the result to the product.

## Key elements
- **`standingOn(caller?)`**: Returns a `ProductStanding` from the caller's keys. `update` requires holding both `update` on `Product` and `update` on `Translation`. `delete` requires `delete` on `Product`. An undefined (anonymous) caller gets `NO_PRODUCT_STANDING`. The doc says write responses use this, and it is never cached.
- **`standingOnRead(scopeOf, caller?)`**: Standing for a READ. If `hasAnonymousReadScope(scopeOf, caller)` is true, it returns `NO_PRODUCT_STANDING`. Otherwise it delegates to `standingOn`. `scopeOf` is the module's `callerScope`.
- **`withActions(product, standing)`**: Returns a copy of the product with `actions: productActions(product, standing)`. It is generic over `T extends Product`. The standing is meant to be computed once per request.

## Relationships
- `src/modules/products/domain/actions.ts`: supplies `productActions`, `NO_PRODUCT_STANDING` and the `ProductStanding` type. This file only gathers the standing and applies the rules.
- `src/kernel/ability.ts` (`holds`): checks whether the caller holds a given action on a subject.
- `src/kernel/access/query.ts` (`hasAnonymousReadScope`): detects callers who share the anonymous read scope.
- `src/infrastructure/persistence/versioning.ts` (`carryVersion`): copies the row's version onto the new product object.
- `src/types/index.ts` (`Caller`, `Product`): the caller and product types are imported from `@types`. `src/types/auth-context.ts` is also a graph neighbor.
- `src/modules/products/services/read.ts` and `src/modules/products/services/search.ts` are graph neighbors, so they presumably use these helpers. That usage is not visible in this file.

## Notes
- Anonymous-scope readers get no standing on reads. They are served from a cache shared by all guests, and a per-user flag would leak to strangers. Only callers outside that scope are answered fresh and get a real standing.
- `withActions` has to use `carryVersion` because the row's version sits beside the wire object (used for the `ETag`). A plain spread would lose it.
