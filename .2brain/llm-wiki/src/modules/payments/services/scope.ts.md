---
source: src/modules/payments/services/scope.ts
sha256: 3daa700991018c204c81319f564a8104b4a10ee1fd14b3441e1ab0a1e920b8f4
generated_at: 2026-09-23T19:22:04.428034+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/scope.ts

## Purpose

Single export that centralises the row-level access rule for the payments collection. Every other service in this directory resolves _which_ payments a caller may see by delegating to this one function, so the scoping logic lives in exactly one place.

## Key elements

- **`callerScope(context?: AuthContext)`** — Returns the result of `accessibleFilter(context, 'Payment')`. Takes an optional `AuthContext` and produces a filter (or predicate) that encodes the ownership axis for payment rows. This is the only public export of the module.

## Relationships

- **`src/kernel/access/query.ts`** — Provides `accessibleFilter`, the generic scoping primitive that `callerScope` wraps with the `'Payment'` collection label.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — Source of the `AuthContext` type used as the function's parameter.
- **`src/modules/payments/services/index.ts`** — Barrel for the services directory; expected to re-export `callerScope` so sibling consumers can import from a single path.
- **`src/modules/payments/services/refunds.ts`, `settlement.ts`, `view.ts`** — Sibling services that the module's own doc comment identifies as the downstream consumers of `callerScope` ("the one rule every other file here reads through").

## Notes

- Unlike the analogous scoping in the orders module (which combines _ownership_ and _not-yet-soft-deleted_), payments are **never soft-deleted**, so ownership is the only axis. Do not add a liveness/soft-delete check here; it does not apply to this collection.
- The `AuthContext` parameter is optional — passing `undefined` yields whatever `accessibleFilter` returns for an unauthenticated/anonymous caller. Callers are expected to handle that case.
- The collection label is hard-coded to the string `'Payment'`; there is no runtime parameterisation. Keep it in sync if the schema entity is ever renamed.
