---
source: src/modules/access/domain/protection.ts
source_sha256: 88d20a8c8c2df43643b700f3d8cc08bf1c35ec5cbe43155d9a21927f6f3e22e6
context_sha256: 22d95f8896cc202e42dd7286d2e75096a715fdc8d2432fe1f687152bb51688b8
generated_at: 2026-11-22T03:15:57.582771+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/access/domain/protection.ts

## Purpose
Holds the pure, I/O-free rules for "protecting people": whether a caller may change an account, and whether a given order, payment or return belongs to the caller. The data lookups that feed these rules live in `src/modules/access/services/protection.ts`; this file only decides.

## Key elements
- **`mayChangeAccount(caller, account)`**: returns `true` when the account holds no staff role, or the caller holds `assign:Role`. Takes `{ holdsAssignRole }` and `{ holdsStaffRole }` shapes, not full contexts.
- **`isOwnThing(context, ownerId)`**: returns `true` only when there is a context, the caller is not the system actor, `ownerId` is truthy, and `context.caller.id === ownerId`. An `undefined` context, the system actor, or a missing owner is never "own".
- **`ownOrderFlag(context, ownerId)`**: returns `{ ownOrder: true }` when `isOwnThing` holds, otherwise `{}`. It is spread into the audit metadata of money steps.

## Relationships
- Takes the `CallerContext` type from `@types` (`src/types/auth-context.ts`, re-exported via `src/types/index.ts`).
- `src/modules/access/services/protection.ts` does the lookups and calls `mayChangeAccount` (via `canChangeAccount`). The users service (`src/modules/users/services/actions.ts`) asks the same rule of a whole page of rows after one batched lookup.
- The money and return services in the neighbor list (`src/modules/orders/services/cancel.ts`, `src/modules/payments/services/offline.ts`, `src/modules/payments/services/refund-settlement.ts`, `src/modules/payments/services/refunds.ts`, `src/modules/returns/services/decide.ts`, `src/modules/returns/services/proof.ts`, `src/modules/returns/services/receive.ts`) are consumers of the own-order helpers. The `ownOrder` audit flag is described as part of money steps.
- `src/modules/access/domain/index.ts` is the domain barrel. `src/modules/access/tests/unit/protection.test.ts` is the unit test for these rules.

## Notes
- The caller's own account is deliberately not a special case in `mayChangeAccount`. A key shares its minter's id, so an "own account" exemption would let a key act on its minter.
- `ownOrderFlag` exists so a staff member acting on their own order is allowed but visibly flagged in the audit record, which makes self-dealing easy to spot in review.
- `mayChangeAccount` is meant to be the single place this rule is written. Don't re-implement it elsewhere.
