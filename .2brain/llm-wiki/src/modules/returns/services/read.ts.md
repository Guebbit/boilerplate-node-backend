---
source: src/modules/returns/services/read.ts
sha256: fe0c15b3650b984082e4b3ac4c261e62f4f9b0fd17e4fde8d0c7b90912c59dfe
generated_at: 2026-10-15T11:58:10.340709+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/read.ts

## Purpose

Read-only service for the returns module: lists and fetches individual returns with caller-scoped visibility. Staff holding `returns.any.read` see all returns; everyone else sees only returns tied to their own orders. Each return is returned with a computed `actions` object so the client never re-implements lifecycle permissions.

## Key elements

- **`ReturnFilters`** – Interface describing the accepted query parameters for `GET /returns` (`page`, `pageSize`, `orderId`, `status`, `reason`).
- **`isStaff(authContext)`** – Internal guard: checks whether the caller holds the `returns.any.read` ability key on a `Return` subject.
- **`BuyerStanding`** – Internal shape describing the caller's rank relative to the order's buyer (`reaches`) and whether the caller may handle money for that buyer (`handlesMoney`).
- **`actionsFor(returned, authContext, standing)`** – Computes the `ReturnActions` object (`approve`, `decline`, `receive`) for a single return. Approval and receipt require `handlesMoney` (buyer ≠ caller) plus the respective ability key and a decidable/receivable status. Decline requires only `reaches` plus `returns.any.update`.
- **`withActions(returned, authContext)`** – Async wrapper that resolves the buyer's standing via `orderService`, then pairs the presented return with its computed actions.
- **`listReturns(filters, authContext)`** – Paginated search. Staff query unscoped; non-staff are restricted to `orderId: { $in: ownOrderIds }`. Returns `{ items: Return[], meta: PaginatedMeta }`.
- **`getReturn(id, authContext)`** – Fetches one return. Returns a 404 `ResponseReject` if not found or (for non-staff) if the order isn't theirs. Otherwise resolves to `ResponseSuccess<Return>` with actions attached.

## Relationships

- **`src/modules/returns/repository.ts`** – Provides `returnRepository.search` and `returnRepository.findById`, the data-access layer this service calls.
- **`src/modules/returns/presenter.ts`** – `presentReturn` shapes a `ReturnDocument` into the wire `Return` before actions are attached.
- **`src/modules/returns/domain/index.ts`** (re-exports from `domain/lifecycle.ts`) – Supplies `DECIDABLE_RETURN_STATUSES` and `RECEIVABLE_RETURN_STATUSES` used in `actionsFor`.
- **`src/modules/returns/model.ts`** – Type source for `ReturnDocument`.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/read.ts`** – `orderService.reachesBuyerOf`, `orderService.handlesMoneyOfOrder`, and `ownOrderIds` determine caller-to-buyer standing and scope non-staff queries to their orders.
- **`src/kernel/permissions.ts`** – `callerForSubject` resolves the permission subject for the current auth context.
- **`src/kernel/ability.ts`** – `holdsKey` is the core ability check used by both `isStaff` and `actionsFor`.
- **`src/infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types shape the HTTP envelope.
- **`src/infrastructure/i18n/context.ts` / `i18n/index.ts`** – `t('returns.not-found')` localises the 404 message.
- **`src/infrastructure/persistence/search.ts`** – `PaginatedMeta` type for the list response.
- **`src/modules/returns/services/index.ts`** – Barrel that re-exports this module's public API.

## Notes

- **Ownership is via `orderId`, not `userId`.** A return has no owner field of its own; scoping for non-staff always goes through the order.
- **Non-staff get 404, not 403,** when accessing a return on someone else's order — indistinguishable from a missing record, avoiding existence leakage.
- **`handlesMoney` ≠ `reaches`.** The `handlesMoney` flag adds the constraint that the buyer is *not* the caller. Approval and receipt therefore require the caller to act on *another person's* order, even if rank-wise they "reach" the buyer.
- **`actionsFor` is exported** so other modules (e.g., mutation services or tests) can reuse the permission computation without duplicating the logic.
- The `ownOrder` import from `./ownership` is used only in `getReturn`; `listReturns` uses `ownOrderIds` directly from the orders module.
