---
source: src/modules/access/domain/protection.ts
sha256: 790b2370e1af920d0efd8251852f46c9b0a8524c6d29fae38efd40b7e14eda41
generated_at: 2026-11-14T18:25:24.228006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/domain/protection.ts

## Purpose

Pure authorization rules for protecting people: whether a caller may modify an account and whether a resource (order, payment, return) belongs to the caller. Contains no I/O — the lookups that supply inputs live in the service layer.

## Key elements

- **`mayChangeAccount(caller, account)`** — Returns `true` when the target account holds no staff role *or* the caller holds `assign:Role`. Intentionally excludes the caller's own account (a key shares its minter's id, so "own" would let a key act on its minter).
- **`isOwnThing(context, ownerId)`** — Returns `true` only when a real (non-system) caller exists, `ownerId` is truthy, and it matches `context.caller.id`. Used as the `ownOrder` audit check across money steps.
- **`ownOrderFlag(context, ownerId)`** — Thin wrapper over `isOwnThing` that returns `{ ownOrder: true }` or `{}` so the audit metadata can be spread into a record.

## Relationships

- **`src/modules/access/domain/index.ts`** — Re-exports these functions as the public domain API.
- **`src/modules/access/services/protection.ts`** — The I/O companion: performs the DB lookups (staff role, caller permissions) and then delegates to `mayChangeAccount`. This file is the one canonical rule; the service just feeds it.
- **`src/modules/access/tests/unit/protection.test.ts`** — Unit tests covering all three exports.
- **`src/modules/orders/services/cancel.ts`, `src/modules/payments/services/offline.ts`, `src/modules/payments/services/refund-settlement.ts`, `src/modules/payments/services/refunds.ts`, `src/modules/returns/services/decide.ts`, `src/modules/returns/services/proof.ts`, `src/modules/returns/services/receive.ts`** — Money-step services that call `isOwnThing` / `ownOrderFlag` to stamp the `ownOrder` audit flag when a buyer acts on their own record.
- **`src/modules/users/services/actions.ts`** — Calls `mayChangeAccount` on a whole page of rows after a single batched lookup (bulk variant of the same rule).
- **`src/types/auth-context.ts`** — Supplies the `CallerContext` type used by `isOwnThing` and `ownOrderFlag`.

## Notes

- `mayChangeAccount` deliberately does **not** special-case the caller's own account. The rationale (key/minter id sharing) is documented in the JSDoc; do not add an "own" check here.
- `isOwnThing` returns `false` (not throws) when `context` is `undefined` — safe to call on system/background paths.
- `ownOrderFlag` returns `{}` (empty object), not `undefined`, so callers can spread it without a conditional.
- The module doc references `docs/theory/authorization.md#protecting-people` for the broader design rationale.
