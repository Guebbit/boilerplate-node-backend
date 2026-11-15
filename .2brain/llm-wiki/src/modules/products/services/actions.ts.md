---
source: src/modules/products/services/actions.ts
sha256: 65b0140b70fc152addce38e7318777e9ef6b5efebc8b206c705bc12f62a228a1
generated_at: 2026-11-14T21:26:50.545227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/actions.ts

## Purpose

Computes the `actions` block on a product for the current caller and stamps it onto the wire object, so clients receive ready-made permission flags instead of re-deriving the rules. The rules themselves live in `domain/actions.ts`; this file reads the caller's keys and produces the concrete standing.

## Key elements

- **`standingOn(caller?)`** — Returns a `ProductStanding` (`update`, `delete`) derived from the caller's held abilities via `holds`. Returns `NO_PRODUCT_STANDING` when `caller` is undefined.
- **`standingOnRead(scopeOf, caller?)`** — Guarded wrapper around `standingOn` for read paths. If the caller falls inside the anonymous read scope (i.e. their response would be served from the shared guest cache), it returns `NO_PRODUCT_STANDING` so no personalized flag leaks to other guests.
- **`withActions<T extends Product>(product, standing)`** — Returns a new product object with `actions` computed by `productActions(product, standing)` and the row version re-carried via `carryVersion` (preserves the `ETag` on the copy).

## Relationships

- **`src/modules/products/domain/actions.ts`** — Source of the `ProductStanding` type, `NO_PRODUCT_STANDING` sentinel, and the `productActions` rule function that actually computes flags.
- **`src/kernel/ability.ts`** — Provides `holds`, the key-checking primitive used by `standingOn`.
- **`src/kernel/access/query.ts`** — Provides `hasAnonymousReadScope`, used by `standingOnRead` to detect the cache-sharing condition.
- **`src/infrastructure/persistence/versioning.ts`** — Provides `carryVersion`, ensuring the stamped copy retains the row version for `ETag` comparison.
- **`src/types/index.ts`** — Barrel re-export of `Caller` and `Product` types consumed here.
- **`src/modules/products/services/read.ts`** / **`search.ts`** — Downstream consumers that call `standingOnRead` and `withActions` to attach actions to read/search responses.

## Notes

- `standingOnRead` exists specifically because the anonymous read scope is backed by a shared cache; stamping a personalized standing onto a cached response would serve it to unrelated guests. Only callers *outside* that scope get a real standing on reads.
- `withActions` creates a new object (`{ ...product, actions }`) rather than mutating; the version must be re-carried because the copy would otherwise lose it.
- The standing is computed once per request and passed in, not re-derived inside `withActions` — callers are expected to ask `standingOn`/`standingOnRead` a single time.
