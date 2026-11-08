---
source: src/modules/payments/metrics.ts
sha256: 6524ef6c508a5daf41ff1804ce3cc27fe1456c697bf24527b10bdeb9b605d75e
generated_at: 2026-11-08T07:21:36.616693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/metrics.ts

## Purpose

Defines the two Prometheus counters owned by the payments domain: one for confirmation-attempt outcomes and one for settlement mismatches. Counters live here (in the module) rather than in `infrastructure` so the domain owns its own metrics; the module overview endpoint reads them without importing this file directly.

## Key elements

- **`paymentConfirmTotal`** (`Counter`) — Records every payment confirmation attempt, labelled by `outcome`. The label split exists so that a decline-rate spike (potential fraud or provider incident) is distinguishable from raw volume changes.
- **`paymentAmountMismatchTotal`** (`Counter`) — Increments when the provider reports a `succeeded` payment whose amount, currency, or payment id differs from the frozen payment. Labelled by which field (`amount` | `currency` | `paymentId`) differed; any non-zero value signals a reconciliation task.
- **Zero-seed loop** — Calls `.inc({ field }, 0)` for each of the three fields at module load so the counter series exist from startup. This prevents Prometheus `increase()` alerts from missing the first real mismatch after a restart (avoids the "missing metric" pitfall).

## Relationships

- **`src/infrastructure/observability/metrics-registry.ts`** — Provides the shared `metricsRegistry` instance; both counters register themselves against it so they appear on the single Prometheus endpoint.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — Expected caller of `paymentConfirmTotal.inc({ outcome })` on each confirm request.
- **`src/modules/payments/services/settlement.ts`** — The component that compares provider-reported fields against the frozen payment and increments `paymentAmountMismatchTotal` on discrepancy. The three seed fields here mirror the exact fields settlement compares.
- **`src/modules/payments/tests/integration/settlement-mismatch.test.ts`** — Integration test covering the mismatch path that drives `paymentAmountMismatchTotal`.

## Notes

- The zero-seed loop runs at import time (module scope). It is intentional and must stay in sync with whatever fields `settlement.ts` compares; adding a new compared field without a matching seed entry reintroduces the missing-metric gap.
- Both counters are registered on `metricsRegistry` only — do not also pass a custom registry, or the metrics will be invisible to the shared scrape endpoint.
