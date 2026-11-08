---
source: src/modules/payments/analytics.ts
sha256: 5c1cd44db0c8307dce45765c11a12ae744110a876df9cf226b972ee9bb111c8e
generated_at: 2026-11-08T07:15:49.827902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/analytics.ts

## Purpose

Declares the analytics event names for the payments module and registers them with the analytics port's `AnalyticsEventMap` via TypeScript module augmentation. Importing this file gives any caller type-safe event names (a typo fails at compile time) without pulling in a published copy.

## Key elements

- **`paymentsAnalyticsEvents`** — `as const` object with three keys:
  - `PAYMENT_SUCCEEDED` (`payment_succeeded`)
  - `PAYMENT_DECLINED` (`payment_declined`)
  - `PAYMENT_RECORDED_OFFLINE` (`payment_recorded_offline`)
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` so that emitting any of the above strings type-checks against the `payments` namespace.

## Relationships

- **`services/offline.ts`** — emits `PAYMENT_RECORDED_OFFLINE`; importing this file is what lets that emit pass type-checking.
- **`services/settlement.ts`** — emits `PAYMENT_SUCCEEDED` / `PAYMENT_DECLINED` through the provider funnel; same augmentation dependency.
- **`tests/integration/settlement-reports.test.ts`** — asserts on the events emitted by settlement; references the same event-name constants.

## Notes

- `PAYMENT_RECORDED_OFFLINE` is intentionally **not** a `PAYMENT_SUCCEEDED` variant. It bypasses the provider funnel entirely, so folding it into the succeeded count would inflate the card-conversion metric (`succeeded / (succeeded + declined)`).
- Follows the same augmentation pattern as `./audit.ts` (referenced in the module doc-block).
- Event-name string values must conform to the naming rule in `docs/tools/analytics.md#naming`.
