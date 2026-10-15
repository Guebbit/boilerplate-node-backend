---
source: src/modules/payments/metrics.ts
sha256: 6524ef6c508a5daf41ff1804ce3cc27fe1456c697bf24527b10bdeb9b605d75e
generated_at: 2026-10-15T11:26:07.071170+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/metrics.ts

## Purpose
Defines the Prometheus counters for the payments domain: one for confirmation outcomes and one for settlement-amount mismatches. Metrics live here (in the module) rather than in `infrastructure` so the domain owns its observability vocabulary; the overview endpoint reads them without importing this file (see `modules/account/metrics.ts` for the pattern).

## Key elements
- **`paymentConfirmTotal`** (`Counter`, labels: `outcome`) — increments on every payment-confirmation attempt, tagged with the result (e.g. `succeeded`, `declined`). The label split exists so a decline-spike-vs-steady-volume ratio is visible as a distinct series rather than hidden in a total.
- **`paymentAmountMismatchTotal`** (`Counter`, labels: `field`) — increments when a provider reports a success whose amount, currency, or payment-id differs from the frozen payment. Each increment is a reconciliation signal.
- **Pre-initialisation loop** — calls `inc({ field }, 0)` for `amount`, `currency`, and `paymentId` at module load so Prometheus sees all three label values from startup (avoids "missing metric" gaps in `increase()` alerts after a restart).

## Relationships
- **`src/infrastructure/observability/metrics-registry.ts`** — imported as `metricsRegistry`; both counters register against it so they appear on the shared `/metrics` endpoint alongside all other domain metrics.
- **`src/modules/payments/services/settlement.ts`** — the source of the three fields (`amount`, `currency`, `paymentId`) the mismatch counter tracks; settlement is where the provider response is compared to the frozen record and the counter is incremented.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — the handler that increments `paymentConfirmTotal` with the appropriate `outcome` label after each confirmation attempt.
- **`src/modules/payments/tests/integration/settlement-mismatch.test.ts`** — integration test exercising the settlement-mismatch path that drives `paymentAmountMismatchTotal`.

## Notes
- The counter names use the `*_total` suffix (Prometheus counter convention); the `help` strings are the operator-facing descriptions shown in the metrics endpoint.
- The zero-initialisation loop is intentional and idempotent (`inc` by 0), but it must stay in sync with whichever fields `settlement.ts` actually compares — adding a new comparison field without adding it here will produce a missing series in dashboards/alerts until the first real mismatch occurs.
