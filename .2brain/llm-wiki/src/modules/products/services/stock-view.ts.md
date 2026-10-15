---
source: src/modules/products/services/stock-view.ts
sha256: 512aa9191cf89e26dbc7cad605d23ea592ba62befcab2d2f317c11aa4b02ec2e
generated_at: 2026-10-15T11:45:46.877452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/stock-view.ts

## Purpose

Gates exact inventory counters (`onHand`, `reserved`, `available`) behind the `inventory.any.read` ability so that only authorised callers receive them; everyone else sees only the derived `inStock` / `lowStock` flags. This prevents a public API from leaking sales velocity or enabling denial-of-inventory planning.

## Key elements

- **`STOCK_KEY`** – module-private constant holding the ability key string `'inventory.any.read'`.
- **`canSeeStock(caller?)`** – returns `true` only when the caller is present *and* their held-keys set contains `STOCK_KEY`. Uses the raw key-set (`heldKeys`) rather than CASL's `can()`, so a collapsed/derived permission does not accidentally grant access.
- **`redactStock<T extends Product>(product, seesStock)`** – if `seesStock` is false, strips the three counter fields via a rest-spread and returns a new object with the version token re-attached via `carryVersion`. If `seesStock` is true, returns the product unchanged.

## Relationships

- **`src/kernel/ability.ts`** – provides `heldKeys()`, the set-based check that `canSeeStock` relies on.
- **`src/infrastructure/persistence/versioning.ts`** – provides `carryVersion()`, used by `redactStock` to re-attach the row version after the rest-spread drops it.
- **`src/types/index.ts` / `src/types/auth-context.ts`** – supply the `Caller` and `Product` types used in signatures.
- **`src/modules/products/routes.ts`** – the HTTP layer that calls `canSeeStock` once per request and passes the result into `redactStock` for each product in a response.
- **`src/modules/products/services/read.ts` / `search.ts`** – product-read and search paths that feed already-computed `inStock`/`lowStock` flags into the product object before `redactStock` runs.
- **`src/modules/products/services/index.ts`** – barrel re-export so other services can import `canSeeStock` / `redactStock` without a deep path.
- **`src/modules/products/tests/unit/stock-view.test.ts`** – unit tests covering the redaction logic and the ability-check boundary.

## Notes

- `seesStock` is evaluated **once per request** (typically in the route) and passed into `redactStock` for every product, rather than re-checking the caller's abilities per item.
- The `as T` cast in `redactStock` is safe *only* because the rest-spread intentionally removes exactly the three optional counter fields; if `Product` gains a new required counter field, the cast will silently lie.
- `inStock` and `lowStock` must already be computed **before** `redactStock` runs; the function does not derive them.
- Anonymous requests (`caller === undefined`) always get the redacted view.
