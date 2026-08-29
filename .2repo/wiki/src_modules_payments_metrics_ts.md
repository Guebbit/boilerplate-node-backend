# src/modules/payments/metrics.ts

## Purpose

Declares the Prometheus domain counters owned by the payments module. By living here (in the module) rather than in infrastructure, the counter co-locates with the business logic that increments it, following the same convention as `modules/account/metrics.ts`.

## Key elements

- **`paymentConfirmTotal`** (exported `Counter`) — tracks payment-confirmation attempts, labelled by `outcome`. Registered against `metricsRegistry`. The label is intentional: the decline/total *ratio* is the operational signal (fraud or provider incident), which would be masked if outcomes were summed into a single unlabelled counter.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — provides the shared `metricsRegistry` instance into which `paymentConfirmTotal` registers itself. This is the sole import from infrastructure.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — the confirm-endpoint controller; the natural caller that increments `paymentConfirmTotal` with the appropriate `outcome` label on each request.

## Notes

- The file-level doc comment points to `modules/account/metrics.ts` for the rationale behind per-module metric placement and for how the overview endpoint reads counters *without* importing this file (avoids a runtime dependency from the read path into the module).
- Only one counter exists here today; any new payment-domain counters should be added to this file rather than to the infrastructure layer.
