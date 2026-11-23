---
source: src/modules/returns/services/read.ts
source_sha256: b3b6afcc58dca5261954e4995694c48e444e1993f3fd8f282fc2e3ed58889a02
context_sha256: 303dd0d6871c73d23786f09a81afec92e10d29706c46bfeb3c1bec47529cd355
generated_at: 2026-11-22T07:31:48.728796+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/read.ts

## Purpose
Read side of the returns module. It decides which returns a caller may see (staff with `read:Return` see all; everyone else sees only returns on their own orders, since a return is keyed by `orderId` and has no owner of its own). It also computes the per-caller `actions` flags attached to returns, so clients don't re-implement the lifecycle.

## Key elements
- `ReturnFilters` — the query filters for `GET /returns`: `page`, `pageSize`, `orderId`, `status`, `reason`, `sort`.
- `isStaff(authContext)` (internal) — true if the caller holds `read` on `Return`.
- `actionsForCaller(authContext)` (internal) — resolves the caller's abilities once (`update` and `receive` on `Return`) and returns a function from a return's status to a `ReturnActions` object. The flags are `approve`, `decline`, `receive`, `recordProof`, `close` and `cancel`. Each needs both the matching permission and a status that `returnLifecycle.allows(...)`.
  - `recordProof` also requires that no `proofOfSendingAt` is set yet.
  - `cancel` also requires that `proofOpenedRefund(returned)` is false.
- `withActions(returned, authContext)` — presents a `ReturnDocument` via `presentReturn` and adds the caller's `actions`.
- `listReturns(filters, authContext)` — returns `{ items, meta }` of `ReturnListItem`s.
  - Staff search freely.
  - Other callers are scoped to `orderId $in` their own order ids.
  - `status` and `reason` are applied as exact matches.
- `getReturn(id, authContext)` — returns `ResponseSuccess<Return>`, or a 404 `ResponseReject` using `returns.not-found`. The 404 is returned when the return doesn't exist and also when it is on someone else's order.

## Relationships
- `../repository` (`returnRepository`) — `search` for lists and `findById` for single reads.
- `../presenter` — `presentReturn` and `presentReturnListItem` shape the output.
- `../model` — supplies the `ReturnDocument` type.
- `../domain` — `returnLifecycle` (which acts are allowed from which status), `proofOpenedRefund`, and the `ReturnStatus` / `ReturnReason` types.
- `@kernel/permissions` and `@kernel/ability` — `callerForSubject` and `holds` drive the staff check and the action flags.
- `@modules/orders` — its `orderService` supplies the own-order ids that scope a non-staff list.
- `./ownership` — `ownOrder` checks order ownership in `getReturn`.
- `@infrastructure/http/response` — `generateSuccess` and `generateReject` build the responses.
- `@infrastructure/i18n` — `t` provides the not-found message.
- `@infrastructure/persistence/search` — supplies the `PaginatedMeta` type.

## Notes
- A customer holds none of the `update` or `receive` keys, so every action flag is false for them. Their own entry point is `GET /returns/options`, which is not in this file.
- Visibility in `getReturn` is decided before building the response, so "not yours" and "not found" are indistinguishable (both 404).
- In `listReturns`, an `orderId` filter outside the caller's own orders yields an empty page, not someone else's rows.
