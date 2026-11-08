---
source: src/modules/payments/services/external-refunds.ts
sha256: 9d5d7c253a6cc5d8115d7e06b09162a7961bee728aa0d876e9831b8de0a732c1
generated_at: 2026-11-08T07:26:23.246801+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/external-refunds.ts

## Purpose

Handles refunds created outside the application (i.e., in the payment provider's own dashboard). When a refund event arrives, this module fetches the provider's refund list, distinguishes refunds already tracked locally from unknown ones, carries provider state onto existing records, and **imports** unknown succeeded refunds as settled records so that credit notes, buyer emails, and order stamps fire exactly as they would for an in-app refund.

## Key elements

- **`syncProviderRefunds`** *(exported)* — Entry point. Resolves the provider adapter, fetches its refund list, then walks each refund **sequentially**, threading the payment state forward so each step sees the running total left by the previous one.
- **`syncOne`** — Routes a single refund: if a local record matches → `applyRefundState`; if it's an importable external refund → `importRefund`; otherwise no-op.
- **`ourRecord`** — Matches a provider refund to a local `RefundRecord` by `providerRefundRef` or by the provider echoing our record `_id` in its metadata.
- **`importedRecord`** — Builds the settled `RefundRecord` (status `succeeded`, reason `'external'`, idempotency key `import:<refundRef>`) for an outside refund.
- **`writeImport`** — Transactional writes: appends the record, conditionally bumps `amountRefunded`, stamps the order, and appends `refund_issued` + `refund_settled` timeline rows.
- **`importRefund`** — Wraps `writeImport` in `announceInTransaction` (emits `PAYMENT_REFUNDED`). On a miss (lost race or duplicate), re-reads the payment and retries up to **3** times (`MAX_IMPORT_ATTEMPTS`).
- **`isImportable`** — Gate: refund must be `succeeded` **and** in the payment's own currency. A currency mismatch is logged and skipped (never converted).
- **`MAX_IMPORT_ATTEMPTS`** — Retry cap for the running-total race (3).

## Relationships

| Neighbor | Interaction |
|---|---|
| `providers/registry` | `paymentProviderRegistry.resolve` to get the adapter that lists refunds |
| `providers` (types) | `ProviderRefund` shape passed through every helper |
| `repository` | `importRefund` (conditional append + total bump) and `findById` (re-read on retry) |
| `refund-sync` → `applyRefundState` | Carries provider status back onto an already-tracked record |
| `refund-settlement` → `refundRow`, `refundedPayload`, `stampOrder` | Builds timeline rows, event payload, and order stamp |
| `events` | `PAYMENT_REFUNDED` event name emitted via outbox |
| `kernel/outbox` → `announceInTransaction` | Atomicity: writes + event in one transaction |
| `domain-primitives/money` | `addMoney` / `toMinorUnits` / `toDecimalString` for the running-total math |
| `modules/orders` → `orderService` | `appendTimeline` for `refund_issued` and `refund_settled` rows |
| `infrastructure/adapters/logger` | Warning on successful import; error on currency mismatch |
| `types` | `RefundStatus.succeeded` enum |
| `model` | `PaymentDocument`, `RefundRecord` types |

## Notes

- **Sequential, not parallel.** The `for…await` loop in `syncProviderRefunds` is deliberate: each `writeImport` conditionally checks the running `amountRefunded`, so concurrent writes within the same batch would race.
- **Import never refuses.** Even if the external refund pushes `amountRefunded` above the original payment amount, the import proceeds — the money genuinely moved.
- **Idempotency** is enforced by the conditional write in `paymentRepository.importRefund` (checks `providerRefundRef`); a duplicate delivery simply returns `null` from the transaction and the retry loop detects the existing record.
- **Currency mismatch is a hard skip**, not a conversion. A multi-currency refund from the provider is logged at `error` level and left for manual handling.
- `Stryker disable` comments mark specific lines for mutation-testing suppression.
