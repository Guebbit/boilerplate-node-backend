---
source: src/modules/returns/services/read.ts
sha256: 0c77d696949753bea7936974b4be932f7a38c656e41e0b1e1f72154d361dbff7
generated_at: 2026-11-14T21:40:17.798435+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/read.ts

## Purpose

Read-side service for the returns domain. It answers "what can this caller see?" and "what can this caller do with each row?" by combining ability checks, order-ownership scoping, and the return lifecycle state. It is the single place that projects a `ReturnDocument` into a wire-ready `Return` or `ReturnListItem` with caller-specific actions attached.

## Key elements

- **`ReturnFilters`** — query-parameter shape accepted by `GET /returns` (page, pageSize, orderId, status, reason, sort).
- **`isStaff(authContext)`** — returns `true` when the caller holds the `read:Return` ability; gates the wide read vs. ownership-scoped read.
- **`actionsForCaller(authContext)`** — resolves `update:Return` and `receive:Return` abilities once, then returns a pure function that maps a `StatusOnly` record to a `ReturnActions` object (approve, decline, receive, recordProof, close, cancel). Lifecycle legality is delegated to `returnLifecycle.allows`; the "proof already recorded" and "refund already owed" guardrails are checked here.
- **`withActions(returned, authContext)`** — spreads the presenter output of a full `ReturnDocument` and appends the computed `actions`.
- **`listReturns(filters, authContext)`** — paginated list. Staff get an unscoped `returnRepository.search`; everyone else is scoped to their own `orderId`s via `orderService.ownOrderIds`. Each row is projected with `presentReturnListItem` plus per-row actions.
- **`getReturn(id, authContext)`** — single-return fetch. Non-existent or not-visible both return the same 404 + i18n message.

## Relationships

- **`src/modules/returns/repository.ts`** — `returnRepository.search` and `findById` supply the raw documents for both list and single-read paths.
- **`src/modules/returns/presenter.ts`** — `presentReturn` / `presentReturnListItem` shape documents for the wire before actions are attached.
- **`src/modules/returns/domain/index.ts`** / **`src/modules/returns/domain/lifecycle.ts`** — `returnLifecycle.allows` gates each action; `proofOpenedRefund` blocks cancel; `ReturnStatus` / `ReturnReason` are the enum types used in `StatusOnly`.
- **`src/modules/returns/domain/refund-due.ts`** — consumed transitively via the domain barrel; provides the refund-owed logic referenced by the `cancel` guard.
- **`src/modules/returns/model.ts`** — `ReturnDocument` is the raw shape the repository returns and the presenter consumes.
- **`src/kernel/ability.ts`** + **`src/kernel/permissions.ts`** — `holds` + `callerForSubject` resolve the caller's standing for `read`, `update`, and `receive` on the `Return` subject.
- **`src/modules/orders/index.ts`** / **`src/modules/orders/services/index.ts`** — `orderService.ownOrderIds` provides the set of order IDs a customer owns, used to scope non-staff list queries and the single-return visibility check.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` produce the standard response envelopes.
- **`src/infrastructure/i18n/index.ts`** / **`src/infrastructure/i18n/context.ts`** — `t` localizes the "not found" message.
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` types the `meta` returned alongside list items.
- **`src/modules/returns/services/index.ts`** — barrel that re-exports the public surface of this module.

## Notes

- Returns are keyed by `orderId`, not `userId`. "Ownership" is always delegated to the order; there is no `userId` column on a return to filter on directly.
- A non-staff caller requesting a return on another person's order receives **404**, not 403 — identical to a genuinely missing return, so existence is not leaked.
- `actionsForCaller` resolves abilities **once** per request, then applies the resulting closure to every row in the page. This avoids one ability check per row.
- `recordProof` is only offered while `proofOfSendingAt` is `undefined`; the proof is a one-shot record.
- `cancel` is blocked whenever `proofOpenedRefund` returns true, mirroring the rule in the cancel service.
