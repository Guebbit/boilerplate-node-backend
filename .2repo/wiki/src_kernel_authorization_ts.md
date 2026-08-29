# src/kernel/authorization.ts

## Purpose

Single source of truth for the shared read-scope rule used across four domains (orders, payments, products, locales): admins are unrestricted, everyone else is narrowed to a module-specific slice. Centralising this rule eliminates four hand-written copies that could silently drift in the wrong direction (widening rather than tightening).

## Key elements

- **`Scope`** (type) — `Record<string, unknown> | undefined`. A filter fragment to spread into a query; `undefined` means "no restriction".
- **`restrictNonAdmin`** (private curried helper) — Takes a narrowing function and a `Caller`; returns `undefined` for admins, delegates to the narrowing function otherwise. Shared by both factories.
- **`createOwnerScope(ownerScopeOf)`** (export) — Builds a `callerScope` for modules where the restriction is "your rows only". Passes `caller?.id ?? ''` into the repository's owner-scope function. The `?? ''` is deliberate: an empty string is not a valid ObjectId, so a missing id causes the repository to throw (fail-closed → 500) rather than omitting the owner clause (fail-open → data leak).
- **`createVisibilityScope(publicScopeOf)`** (export) — Builds a `callerScope` for modules where the restriction is "published rows only". Caller identity does not enter the fragment; anonymous and signed-in non-admins get the same scope.

## Relationships

- **`src/types/auth-context.ts` / `src/types/index.ts`** — Provides the `Caller` type (imported via the `@types` barrel) consumed by `restrictNonAdmin` and both factories.
- **`src/kernel/middlewares/authorizations.ts`** — Sits in the same kernel layer but answers the orthogonal question: *who* is the caller and *may they reach this route*. This file answers *which rows* they may see once they have reached it.
- **`src/modules/orders/service.ts`**, **`src/modules/payments/service.ts`** — Consumers that call `createOwnerScope`, passing their repository's `visibleScope` / owner-fragment function.
- **`src/modules/products/service.ts`**, **`src/modules/locales/services/capabilities.ts`** — Consumers that call `createVisibilityScope`, passing their repository's published-rows fragment.
- **`tests/unit/kernel/authorization.test.ts`** — Unit tests covering the admin vs. non-admin branches for both factories.

## Notes

- The scope builder is **injected as an argument**, not imported. This keeps the kernel from naming any module and preserves the one-rule-four-callers design.
- `undefined` is a *meaningful* return value (no restriction), not an error. Callers are expected to **spread** the result (`{ ...callerScope(ctx), status: 'paid' }`) rather than pass it as a standalone filter.
- The fail-closed guarantee in `createOwnerScope` depends on the repository's `ownerScopeOf` throwing on an empty/invalid id. If a repository silently returns `{}` for a bad id, the security property is lost with no test failure.
