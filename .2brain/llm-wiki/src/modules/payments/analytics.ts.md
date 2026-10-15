---
source: src/modules/payments/analytics.ts
sha256: 5c1cd44db0c8307dce45765c11a12ae744110a876df9cf226b972ee9bb111c8e
generated_at: 2026-10-15T11:22:25.036788+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/analytics.ts

## Purpose

Declares the canonical analytics event names for the payments domain and registers them with the analytics port's `AnalyticsEventMap` via TypeScript module augmentation, so that any `emit` of a payments event is type-checked against this list. Controllers import this file directly (mirroring the pattern `./audit.ts` uses for audit actions) rather than a published copy.

## Key elements

- **`paymentsAnalyticsEvents`** (exported const object, `as const`) — the three event names this module emits:
  - `PAYMENT_SUCCEEDED` → `'payment_succeeded'`
  - `PAYMENT_DECLINED` → `'payment_declined'`
  - `PAYMENT_RECORDED_OFFLINE' → `'payment_recorded_offline'`
- **Module augmentation** (`declare module '@infrastructure/observability/analytics'`) — adds a `payments` key to `AnalyticsEventMap` typed as the union of the values above, making typos a compile error.

## Relationships

- **`src/modules/payments/services/offline.ts`** — consumes `PAYMENT_RECORDED_OFFLINE` when recording a payment that bypasses the provider funnel entirely.
- **`src/modules/payments/services/settlement.ts`** — consumes `PAYMENT_SUCCEEDED` / `PAYMENT_DECLINED` at the end of the provider settlement path.
- **`src/modules/payments/tests/integration/settlement-reports.test.ts`** — asserts the expected event names emitted during settlement flows.

## Notes

- `PAYMENT_RECORDED_OFFLINE` is intentionally **not** a flag on `PAYMENT_SUCCEEDED`. Folding it in would inflate the card-conversion metric (`succeeded / (succeeded + declined)`) with transactions the provider funnel never touched.
- Event-name strings follow the convention in `docs/tools/analytics.md#naming`; do not rename them ad hoc.
- The succeeded/declined pair is the denominator for the funnel's last-gate conversion number—any provider change that shifts that ratio should be visible in these two events specifically.
