# src/modules/payments/metrics.ts

## Purpose

Defines the PromQL counters owned by the payments module. It keeps domain-level metrics colocated with the module that produces them (rather than in `infrastructure`) so ownership is obvious and the overview endpoint can read them without creating a reverse import.

## Key elements

- **`paymentConfirmTotal`** (exported `Counter`, `payment_confirm_total`) — Counts payment-confirmation attempts. Labeled by `outcome` so that the *ratio* of successes to declines is observable; a flat total would mask a fraud or provider incident.

## Relationships

- **`src/infrastructure/observability/metrics-http.ts`** — Supplies the shared `metricsRegistry` into which `paymentConfirmTotal` registers. This is the only import into infrastructure from this file.
- **`src/modules/payments/controllers/post-payment-confirm.ts`** — The confirm handler is the expected increment site: it would call `paymentConfirmTotal.inc({ outcome })` after each confirm attempt.

## Notes

- The module doc-comment points to `modules/account/metrics.ts` as the reference implementation of the "metrics live in the module, not in infrastructure" convention. If you add a new counter here, follow that file's placement rules.
- The overview endpoint reads these counters *without* importing this file (per the header comment); do not add a re-export from `infrastructure` or the metric will be double-counted in discovery.
