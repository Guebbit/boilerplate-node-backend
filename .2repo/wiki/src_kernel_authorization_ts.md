# src/kernel/authorization.ts

## Purpose

Provides a single, shared row-level authorization rule used by four domains (orders, payments, products, locales): an admin sees all rows, everyone else sees a narrowed slice. It centralizes the "admin is unrestricted" check so the per-domain narrowing logic is expressed only once, eliminating the silent drift that occurs when the same admin-bypass logic is copy-pasted into each service.

## Key elements

- **`Scope`** (type) — `Record<string, unknown> | undefined`. A filter fragment to spread into a query, or `undefined` meaning "no restriction."
- **`restrictNonAdmin`** (internal) — Curried helper that wraps a narrowing function: returns `undefined` for admins, otherwise delegates to the narrowing function.
- **`createOwnerScope`** (export) — Builds a `callerScope` from a repository's owner-scope callback (e.g. `orderRepository.visibleScope`). Non-admin callers are restricted to their own rows. Deliberately passes `''` when `caller.id` is missing so the repository throws (fail-closed 500) rather than omitting the owner clause (fail-open leak).
- **`createVisibilityScope`** (export) — Builds a `callerScope` from a repository's public-scope callback (e.g. `productRepository.publicScope`). Non-admin callers (admin or anonymous alike) see only published rows; caller identity does not enter the fragment.

## Relationships

- **`src/types/auth-context.ts` / `src/types/index.ts`** — Supplies the `Caller` type (imported via `@types`) that carries the `admin` flag and optional `id`.
- **`src/modules/orders/service.ts`** — Consumes `createOwnerScope` to scope order reads to the caller's own rows.
- **`src/modules/payments/service.ts`** — Consumes `createOwnerScope` for payment rows.
- **`src/modules/products/service.ts`** — Consumes `createVisibilityScope` so non-admins see only published products.
- **`src/modules/locales/services/capabilities.ts`** — Consumes `createVisibilityScope` so non-admins see only published locales.
- **`tests/unit/kernel/authorization.test.ts`** — Unit-tests both factories against the three role cases (admin, signed-in non-admin, anonymous).

## Notes

- The scope builder is **injected as a parameter**, never imported. The kernel stays domain-free; each module passes its own repository scope function.
- `Scope` is meant to be **spread** into a query object (`{ ...callerScope(ctx), status: 'paid' }`), not passed as a standalone filter. Treating it as a filter on its own is a category error.
- The `?? ''` in `createOwnerScope` is **load-bearing**: it converts a missing caller id into an invalid ObjectId so the repository throws. Removing it would silently widen the query to all rows.
- `createVisibilityScope` intentionally ignores caller identity for the fragment (only the admin check uses it). This keeps the test surface to exactly three cases per role rather than a boolean where guest and logged-in collapse.
