---
source: src/modules/payments/analytics.ts
sha256: ffffff97a52051ea7bee7a01cd246fd0cc801581d68ab053d6a3906af92b92a8
generated_at: 2026-09-23T19:16:07.721356+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/analytics.ts

## Purpose

Defines the canonical analytics event names for the payments module and registers them into the shared `AnalyticsEventMap` via TypeScript module augmentation, so that any consumer typing an event name against the `payments` channel gets autocomplete and compile-time safety without importing a duplicated list.

## Key elements

- **`paymentsAnalyticsEvents`** (`as const`) — the three event-name constants:
    - `PAYMENT_SUCCEEDED` / `PAYMENT_DECLINED` — the funnel's final gate; their ratio is the card-conversion metric.
    - `PAYMENT_RECORDED_OFFLINE` — a deliberately _separate_ event (not a flagged `PAYMENT_SUCCEEDED`) because the payment never traversed the provider funnel; folding it in would inflate the conversion denominator.
- **`declare module '@infrastructure/observability/analytics'`** — augments `AnalyticsEventMap` with a `payments` key typed to the union of the three constants above. This is what makes the event names part of the shared port's name map (same pattern as `./audit.ts` uses for audit actions).

## Relationships

- **`src/modules/payments/services/settlement.ts`** and **`src/modules/payments/services/offline.ts`** are the graph neighbors. They are the expected emitters of the events declared here: settlement emits `PAYMENT_SUCCEEDED` / `PAYMENT_DECLINED` after the provider round-trip, and offline emits `PAYMENT_RECORDED_OFFLINE` when a payment is recorded without going through that funnel. This file is the single source of truth for the string values those services must use.

## Notes

- Event-name strings follow the convention in `docs/tools/analytics.md#naming` (snake_case).
- The file is imported _directly_ by controllers/services rather than via a re-export, so the module augmentation is picked up wherever the file is in the dependency graph.
- Do **not** add a boolean "offline" flag to `PAYMENT_SUCCEEDED` to cover offline recordings — the separation is intentional to keep the conversion metric clean.
