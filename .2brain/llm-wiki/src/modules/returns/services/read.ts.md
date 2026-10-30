---
source: src/modules/returns/services/read.ts
sha256: e982e5bd3fa1ef916afa798d4df4712368b428c6514f75700fe89e074f9b093f
generated_at: 2026-10-29T05:44:38.593110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/read.ts

## Purpose

Handles the read path for returns: listing and fetching individual returns with caller-aware visibility and per-row action flags. Staff (holders of `read:Return`) see all returns; everyone else is scoped to returns on their own orders. The file centralises the "what actions can this caller take on this return?" decision so no client re-implements the lifecycle.

## Key elements

- **`ReturnFilters`** (exported interface) — Query parameters accepted by `GET /returns`: `page`, `pageSize`, `orderId`, `status`, `reason`, `sort`.
- **`withActions`** (exported) — Wraps a `ReturnDocument` into the wire `Return` shape, attaching a computed `actions` object for the given caller.
- **`listReturns`** (exported) — Paginated, filtered listing. Branches on `isStaff`: staff get an unscoped search; non-staff resolve their own order IDs via `orderService.ownOrderIds` and constrain the query with `{ orderId: { $in: ids } }`.
- **`getReturn`** (exported) — Fetches one return by id. Returns 404 (via `generateReject`) if not found *or* if the caller lacks visibility (non-staff whose `orderId` isn't theirs), so "not yours" and "doesn't exist" are indistinguishable.
- **`isStaff`** (internal) — Resolves the caller's subject and checks `holds(caller, 'read', 'Return')`.
- **`actionsForCaller`** (internal) — Resolves `update:Return` and `receive:Return` abilities **once**, then returns a pure `(status) → ReturnActions` closure. Each flag is gated on both the ability and the return being in the relevant lifecycle status set.

## Relationships

- **`@kernel/ability` / `@kernel/permissions`** — `holds` and `callerForSubject` provide the permission checks for read, update, and receive abilities.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape the `getReturn` response.
- **`@infrastructure/i18n`** — `t` supplies the 404 message string.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type for the list response envelope.
- **`../repository`** — `returnRepository.search` and `returnRepository.findById` are the data-access calls.
- **`../model`** — `ReturnDocument` is the raw shape coming from the repository.
- **`../presenter`** — `presentReturn` maps the document to the public wire shape before `actions` is attached.
- **`../domain`** (lifecycle) — `DECIDABLE_`, `RECEIVABLE_`, `CLOSABLE_`, `CANCELABLE_RETURN_STATUSES` and `ReturnStatus` drive the action-flag logic.
- **`./ownership`** — `ownOrder` is called in `getReturn` to verify a non-staff caller's order.
- **`@modules/orders`** — `orderService.ownOrderIds` supplies the set of order IDs a non-staff caller may access in `listReturns`.

## Notes

- A return is keyed by `orderId`, not `userId`, so "ownership" is always delegated to the order. This file never filters on a user field directly.
- `actionsForCaller` resolves abilities **once per request** and returns a closure, so a page of N rows costs a single `holds` check per ability rather than N.
- In `listReturns`, `status` and `reason` are separated from the remaining filters (`rest`) because they go into the `exact` match object while `rest` is passed as the broader search query.
- The 404 ambiguity in `getReturn` is deliberate: a non-staff caller probing someone else's return gets the same response as a genuinely missing id.
- `ReturnActions` flags (`approve`, `decline`) are both gated by the same `decidable` boolean; they differ only in downstream write-service semantics, not in read-time visibility.
