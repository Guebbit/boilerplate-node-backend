---
source: src/modules/returns/services/read.ts
sha256: e982e5bd3fa1ef916afa798d4df4712368b428c6514f75700fe89e074f9b093f
generated_at: 2026-11-08T08:05:38.089958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/read.ts

## Purpose

Read-side service for the returns domain. It answers "what returns can this caller see?" and "what can this caller do to each one?" by combining permission checks, order-ownership scoping, and lifecycle-status gating into two public operations: a paginated list and a single-return fetch.

## Key elements

- **`ReturnFilters`** (exported interface) – Query parameters accepted by `GET /returns`: `page`, `pageSize`, `orderId`, `status`, `reason`, `sort`.
- **`isStaff`** (internal) – Returns `true` when the caller holds the `read:Return` ability, i.e. they may see the full returns queue.
- **`actionsForCaller`** (internal) – Resolves the caller's ability keys *once*, then returns a pure function `(status) → ReturnActions`. Flags `approve`, `decline`, `receive`, `close`, `cancel` are set only when the caller holds the relevant key **and** the return is in a status that permits the act (via the `DECIDABLE_`, `RECEIVABLE_`, `CLOSABLE_`, `CANCELABLE_` status arrays from the domain).
- **`withActions`** (exported) – Merges the presented return document with the caller-specific `actions` object.
- **`listReturns`** (exported) – Paginated search. Staff get an unscoped search; everyone else is restricted to `orderId $in` their own order IDs (fetched via `orderService.ownOrderIds`). Every row in the result gets `actions` attached.
- **`getReturn`** (exported) – Fetches one return by id. If the caller is not staff and the return's `orderId` is not theirs, the response is an identical 404 to a missing return.

## Relationships

- **`src/infrastructure/http/response.ts`** – Consumes `generateSuccess`, `generateReject`, and the `ResponseSuccess`/`ResponseReject` types for shaping HTTP envelopes.
- **`src/infrastructure/i18n/index.ts`** (and `context.ts`) – Uses `t()` to translate the `returns.not-found` message.
- **`src/infrastructure/persistence/search.ts`** – Imports the `PaginatedMeta` type used in the list return shape.
- **`src/kernel/ability.ts`** – Calls `holds()` to evaluate the caller against specific ability keys (`read`, `update`, `receive` on `Return`).
- **`src/kernel/permissions.ts`** – Calls `callerForSubject()` to obtain the caller identity scoped to the `Return` subject.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** – Calls `orderService.ownOrderIds(userId)` to get the non-staff caller's order list for scoping.
- **`src/modules/returns/domain/index.ts`** (and `lifecycle.ts`) – Imports the status-constant arrays (`DECIDABLE_`, `RECEIVABLE_`, `CLOSABLE_`, `CANCELABLE_`) and the `ReturnStatus` type that gate each action.
- **`src/modules/returns/model.ts`** – Imports the `ReturnDocument` type returned by the repository.
- **`src/modules/returns/presenter.ts`** – Calls `presentReturn()` to map a document to the wire shape before attaching actions.
- **`src/modules/returns/repository.ts`** – Calls `returnRepository.findById` and `returnRepository.search` for persistence.
- **`src/modules/returns/services/ownership.ts`** – Calls `ownOrder(orderId, authContext)` to verify single-return visibility for non-staff callers.
- **`src/modules/returns/services/index.ts`** – Re-exports the public surface of this file.

## Notes

- A return has **no owner of its own**; it is keyed by `orderId`. Ownership filtering is therefore delegated to the orders module.
- "Not yours" and "does not exist" are **deliberately indistinguishable** (both yield 404 + `returns.not-found`) to avoid leaking existence.
- `actionsForCaller` resolves the caller's abilities **once per page**, not per row, so a 50-row list costs one ability lookup.
- Customers (holders of no return-related keys) receive an all-`false` actions object here; their available moves are surfaced through a separate `GET /returns/options` endpoint, not this service.
