---
source: src/modules/payments/services/list.ts
sha256: d730dc3cd8f1e1a678e71db7554b6c1558c0f61a106ef7f0bf32274fab275d78
generated_at: 2026-10-15T11:30:18.107027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/list.ts

## Purpose

Staff-facing read queries for the Payments page: a paginated payment list, a cross-payment refund list, and a consolidated "needs attention" feed. All three are `payments.any.read` routes. The file orchestrates repository calls and enriches results with order data before returning presentable rows.

## Key elements

- **`listPayments(filters, authContext?)`** — Searches payments via `paymentRepository.searchStaff`, optionally applying a `displayStatusFilter` and `callerScope`. Then batch-loads order numbers/emails with `orderService.findManyByIds` and merges them into each row via the internal `staffRow` mapper. Returns `{ items: Payment[], meta: PaginatedMeta }`.
- **`listRefunds(filters)`** — Searches all refunds through `paymentRepository.searchRefunds`, maps each `RefundRow` to a `RefundListItem` via the internal `refundRow` mapper. Returns `{ items, meta }`.
- **`listAttention()`** — Fires three parallel queries (stale auto-refunds, manual refunds owed, order refunds owed via `orderService.findOwedRefunds`), maps each to a `PaymentAttentionItem`, concatenates, and sorts by `since` ascending. Cutoff is computed from `paymentAttentionMinutes()`. Capped at `ATTENTION_LIMIT` (100) per source.
- **`staffRow`, `refundRow`, `refundAttention`** — Internal row mappers; not exported.
- **`ATTENTION_LIMIT`** — Constant (100) bounding how many rows each attention source can contribute.

## Relationships

| Neighbor | Interaction |
|---|---|
| `payments/repository.ts` | Calls `paymentRepository.searchStaff`, `.searchRefunds`, `.findOpenRefundRows`; imports `RefundFilters`, `RefundRow` types. |
| `orders/index.ts` | Calls `orderService.findManyByIds` (batch order lookup) and `orderService.findOwedRefunds` (attention source). |
| `payments/presenter.ts` | Calls `presentPayment(payment, true)` to shape base payment fields inside `staffRow`. |
| `payments/domain/index.ts` (→ `display-status.ts`) | Calls `displayStatusFilter` to translate a `displayStatus` filter into repository predicates. |
| `payments/config.ts` | Reads `paymentAttentionMinutes()` to compute the stale-refund cutoff. |
| `payments/model.ts` | Types rows as `PaymentDocument`. |
| `payments/services/scope.ts` | Calls `callerScope(authContext)` to derive caller-scoped query constraints. |
| `infrastructure/persistence/search.ts` | Imports `PaginatedMeta` for the pagination envelope. |
| `types/index.ts` / `types/auth-context.ts` | Consumes `Payment`, `RefundListItem`, `PaymentAttentionItem`, `SearchPaymentsRequest`, `PaymentAttentionKind`, `AuthContext`. |
| `payments/services/index.ts` | Re-exports the three public functions as the module's API surface. |
| `payments/tests/integration/staff-reads.test.ts` | Exercises `listPayments`, `listRefunds`, `listAttention` end-to-end. |

## Notes

- `listPayments` performs **two sequential awaits** (repository search → order batch load). The order lookup is a single `findManyByIds` call, not N+1, but it does add one round-trip after the primary query.
- `listAttention` uses `Promise.all` so the three sources are fetched concurrently; a failure in any one rejects the whole call.
- The attention feed is **sorted oldest-first** (`.toSorted` on `since`), not newest-first like the refund list.
- `staffRow` spreads `presentPayment(payment, true)` first, then conditionally overlays `orderNumber`/`email`—if the order is unknown the fields are simply absent, not `undefined`.
- `refundRow` and `refundAttention` use the `...(cond ? { key } : {})` pattern for optional fields (`returnId`, `providerRefundRef`, `failureReason`, `settledAt`) to avoid emitting `undefined` keys.
