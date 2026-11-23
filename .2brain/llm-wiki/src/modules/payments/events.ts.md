---
source: src/modules/payments/events.ts
source_sha256: 3874f1a9a6608c4c3117ebc88f5fd00db545ad232e471cb4c68f010694bf9285
context_sha256: 58336b59c565e5579bdcb66339ed7578ae2a4c43ca44f8107339e6cf103a6440
generated_at: 2026-11-22T06:45:08.152417+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/events.ts

## Purpose
Central registry of the domain event names the payments module emits. Each event is declared in `./asyncapi.domain-events.yaml`. This file exports them as string constants, type-checked against the kernel's `DomainEventName`, so emitters and tests can use the constants instead of raw strings.

## Key elements
- `DisputeEventPayload`: type alias for `DomainEventMap['payment.dispute_opened']`. It is the payload shared by both dispute events. It carries the dispute as the provider last reported it, never its free text.
- Payment lifecycle constants: `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`.
- Refund constants: `PAYMENT_REFUNDED`, `PAYMENT_REFUND_CANCELED`, `PAYMENT_REFUND_FAILED`, `PAYMENT_REFUND_REVERSED`.
- Dispute constants: `PAYMENT_DISPUTE_OPENED`, `PAYMENT_DISPUTE_UPDATED`.
- Follow-up and anomaly constants: `PAYMENT_REFUND_OWED_AFTER_DISPUTE`, `PAYMENT_REFUND_OWED_BY_HAND`, `PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_REFUND_UNRECORDED`, `PAYMENT_RETURN_REFUND_SHORT`.

## Relationships
- `src/kernel/events.ts`: supplies the `DomainEventMap` and `DomainEventName` types. Each constant uses `satisfies DomainEventName`, so a name that isn't a declared event fails to compile.
- `src/modules/payments/services/settlement.ts`: per the module doc comment, `settlePayment` here is the one place a payment is reconciled and the source of the succeeded and failed payment events.
- `src/modules/payments/services/refunds.ts`: per the module doc comment, the source of the refunded payment event.
- The other payments services (`announce`, `disputes`, `external-refunds`, `refund-settlement`, `return-refunds`), `index.ts`, `module.ts` and the integration tests are listed as graph neighbors. This file does not show which of them use which constants.

## Notes
- The file has no runtime logic. Each constant is a string literal, and `satisfies` keeps its literal type.
- The YAML spec is the source of truth. The `DomainEventMap` payload types are generated from it, as the `DisputeEventPayload` doc comment says.
