---
source: src/modules/returns/services/cancel-right.ts
sha256: e2d0f00a1334ea5850a54b08ced2fcfcd13d62fca309ed6aea3e1479979b2c15
generated_at: 2026-11-08T08:02:00.361680+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-right.ts

## Purpose

Single source of truth for *who may cancel a remainder* (the unshipped portion of an order). Both the enforcement gate (`cancel-remainder.ts`) and the UI-facing options read (`options.ts`) call this one function so the button never promises what the door would refuse.

## Key elements

- **`CancelRefusal`** (exported type) — Union of three refusal reasons: `'window-closed'`, `'excluded'`, `'no-key'`.
- **`cancelRefusalOf(order, authContext, remainder, statedAt?)`** (exported function) — Returns the first applicable refusal reason, or `undefined` when cancellation is permitted. Decision order:
  1. Non-buyer without `create:Refund` ability → `'no-key'`.
  2. Staff recording a buyer-stated withdrawal outside the statutory window → `'window-closed'`.
  3. Any of the remainder's product lines fall in Art.-16 excluded items **and** the shop has already started (`processing`+) → `'excluded'`.

## Relationships

- **`cancel-remainder.ts`** — calls `cancelRefusalOf` as its gate before executing a cancellation.
- **`options.ts`** — calls `cancelRefusalOf` to decide whether to surface a "cancel" option to the caller.
- **`@modules/orders/index.ts`** — provides `hasShopStarted`, `isBuyer`, `isExcludedFromWithdrawal`, `withdrawalClosesAt`, and the `OrderDocument` type (re-exported from `domain/lifecycle.ts`, `domain/withdrawal.ts`, `domain/rules.ts`, `model.ts`).
- **`@kernel/ability.ts`** — supplies `holds` for the `create:Refund` permission check.
- **`@kernel/permissions.ts`** — supplies `callerForSubject` to resolve the ability subject from the auth context.
- **`@modules/returns/domain`** (`index.ts` / `quantities.ts`) — provides the `ProductQuantity` type for the remainder parameter.
- **`@types`** (`index.ts` / `auth-context.ts`) — provides the `AuthContext` type.
- **`fulfillment.test.ts`** (delivery module) — integration-level test that exercises cancellation flows passing through this rule.

## Notes

- `statedAt` is only set when staff record a buyer-stated withdrawal on a specific past date; it is `undefined` for the buyer acting in real time and for staff cancelling for their own (non-withdrawal) reasons. The function treats `undefined` as "no withdrawal clock to judge" and skips the window check for non-buyers.
- The excluded-item check (Art. 16, made-to-order) only fires *after* the shop has started (`hasShopStarted`). If the order is still `paid`, even excluded goods can be cancelled — the whole group is still the buyer's.
- A buyer who is also staff is always treated as the buyer (the `!buyer` guards on both the key check and the `statedAt` shortcut ensure staff powers never bypass the buyer's limits).
