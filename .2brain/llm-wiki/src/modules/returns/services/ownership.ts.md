---
source: src/modules/returns/services/ownership.ts
sha256: becb6a2c0c193748450c19c14fea0c02adbc4bb3483ef2843eabdb2593b3d5d3
generated_at: 2026-10-29T05:44:02.729081+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/ownership.ts

## Purpose

Central ownership gate for the `returns` module. Before any return-related operation touches an order, this file answers the single question: *may this caller open (or view) a return on this order?* It is the shared prerequisite that `createReturn` and `getReturn` invoke before proceeding.

## Key elements

- **`OpenableOrder`** (interface) — Pairs an `OrderDocument` with a `byStaff` boolean that records whether the caller is acting on the buyer's behalf rather than as the buyer.
- **`ownOrder(orderId, authContext)`** — Resolves the order and returns it only if the caller is the buyer (`isBuyer`). An operator who can *read* any order is not its buyer; this returns `undefined` in that case.
- **`openableOrder(orderId, authContext)`** — Two-tier access check:
  1. If the caller is the buyer → `{ order, byStaff: false }`.
  2. Otherwise, if the caller holds the `update:Return` ability (resolved via `callerForSubject`) → fetches the order by ID and returns `{ order, byStaff: true }`.
  3. No ability → `undefined` (callers treat this as 404).

## Relationships

- **`@kernel/permissions` → `callerForSubject`** — Resolves the caller's permission scope for a given subject (`'Return'`) so `holds` can be evaluated.
- **`@kernel/ability` → `holds`** — Checks whether the resolved caller possesses `update` on `Return`.
- **`@modules/orders` → `isBuyer`, `orderService`, `OrderDocument`** — `isBuyer` (from `domain/rules.ts`) determines buyer identity; `orderService` (from `services/index.ts`) provides `getForCaller` and `getById`; `OrderDocument` (from `model.ts`) is the order shape threaded through both exports.
- **`create.ts`, `read.ts`, `options.ts`, `withdraw.ts`** (sibling return services) — Call `openableOrder` as a pre-flight check before performing their respective return operations.
- **`@types` → `AuthContext`** — The caller identity passed into every function in this file.

## Notes

- `ownOrder` and `openableOrder` are deliberately separate: `ownOrder` is a *strict buyer* check (no staff path), while `openableOrder` is the *business* gate that also admits staff. Callers that only need "is this my order" should use `ownOrder`.
- The `byStaff` flag is the only signal downstream services receive about *who* is acting; there is no separate "actor" field. Logic that branches on buyer-vs-staff behavior must read `byStaff`.
- A staff member who is also the buyer is treated as buyer first (`byStaff: false`); the staff path is only reached when `isBuyer` is false.
- Both functions return `undefined` (not `null`) on failure, and the documented contract is that callers map that to an HTTP 404 rather than 403, hiding existence of the order.
