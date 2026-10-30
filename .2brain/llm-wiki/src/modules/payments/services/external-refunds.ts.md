---
source: src/modules/payments/services/external-refunds.ts
sha256: 98ac2e18cc6a3a7eac2daa3eac227db61478465bb54068ab0785dc04238445c5
generated_at: 2026-10-29T05:10:46.499191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/external-refunds.ts

## Purpose

Handles refunds created directly in the payment provider's dashboard (outside the application). When a refund event fires, it lists the provider's refunds for the payment's intent and walks them: known refunds (ours) get their local record updated, while unknown successful refunds are imported as settled records so the credit note, buyer mail, and order stamp follow the same path as an in-app refund.

## Key elements

- **`syncProviderRefunds`** (exported) — Entry point. Resolves the provider, lists its refunds, and processes them **sequentially** (each step reads the payment the previous step left).
- **`syncOne`** — Per-refund dispatcher: if the refund matches a local record → `applyRefundState`; if it's outside and succeeded → `importRefund`; otherwise skipped (pending/failed will be picked up by a later event).
- **`ourRecord`** — Finds the matching `RefundRecord` by `providerRefundRef` or by the provider echoing our ObjectId in its metadata.
- **`importedRecord`** — Builds a new settled `RefundRecord` from provider data (status `succeeded`, reason `'external'`, idempotency key `import:<refundRef>`).
- **`writeImport`** — Executes the conditional repository write, stamps the order, and appends two timeline rows (`refund_issued`, `refund_settled`) within one Mongoose session.
- **`importRefund`** — Wraps `writeImport` in `announceInTransaction` (publishes `PAYMENT_REFUNDED` atomically). On a missed conditional write, re-reads the payment and retries up to **3 times** (`MAX_IMPORT_ATTEMPTS`); stops early if the refund is already present.
- **`isImportable`** — Gate: refund must be `succeeded` **and** in the payment's own currency. Cross-currency refunds are logged (error) and skipped—never converted.

## Relationships

| Neighbor | Interaction |
|---|---|
| `providers/registry.ts` | `paymentProviderRegistry.resolve` to obtain the adapter that lists refunds. |
| `providers/index.ts` | `ProviderRefund` type used throughout. |
| `repository.ts` | `importRefund` (conditional append + total update) and `findById` (re-read on race). |
| `refund-sync.ts` | `applyRefundState` updates our own record when the provider refund is recognised. |
| `refund-settlement.ts` | `stampOrder`, `refundRow`, `refundedPayload` for the order stamp, timeline rows, and event payload. |
| `kernel/outbox.ts` | `announceInTransaction` couples the DB writes with `PAYMENT_REFUNDED` publication atomically. |
| `orders/services/index.ts` | `orderService.appendTimeline` adds the two order-timeline rows. |
| `domain-primitives/money.ts` | `addMoney`, `toMinorUnits`, `toDecimalAmount` to compute the new running total. |
| `events.ts` | `PAYMENT_REFUNDED` event name. |
| `model.ts` | `PaymentDocument`, `RefundRecord` types. |
| `types/index.ts` | `RefundStatus.succeeded` enum value. |
| `infrastructure/adapters/logger.ts` | Structured warn/error logs for imports and cross-currency skips. |

## Notes

- **Sequential, not parallel.** The `for…of` loop in `syncProviderRefunds` is deliberate: each import is conditional on the running total the previous step wrote.
- **Idempotency** is enforced at the repository level (the `importRefund` condition checks `providerRefundRef`); the in-memory retry loop is only a race-recovery mechanism.
- **Over-refund is allowed.** The module docstring states the import "never refuses, even above what was paid."
- **Cross-currency is a hard skip.** No FX conversion is performed; the refund is logged and left unimported.
- `// Stryker disable` comments mark mutation-testing exclusions on pure logging lines.
