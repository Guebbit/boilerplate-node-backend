---
source: src/modules/payments/module.yaml
sha256: 27c7d181716c2b882a96f4a42ebd1ec0ea42005b7495fde2339b38d753c679fb
generated_at: 2026-11-08T07:22:26.084619+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.yaml

## Purpose

Module declaration for the **payments** supporting subdomain (group: *shop*). It registers the module's cross-module dependencies, its rate-limit budgets, and its scheduled background jobs, so the runtime can wire up payment handling ("an order's money, behind a provider port") without hard-coding those concerns into handler code.

## Key elements

- **`dependsOn`** – Declares three upstream modules the payments handlers read from or write to: `access` (the `ownOrderFlag` audit flag), `orders` (freezing an order's total on payment; opening a refund on a refunding cancel), and `shop` (the zone a pay-by deadline is printed in).
- **`rateLimits`** – Five budgets, all audited:
  - `paymentWebhook` – bounds deliveries to `POST /payments/webhook/{provider}` (default 60 / shared window).
  - `paymentsConfirmAttempts` – bounds attempts on `POST /payments/:id/confirm` regardless of outcome (5 / 1 h).
  - `paymentsConfirmDeclines` – bounds genuine DECLINE responses on the same route (3 / 1 h).
  - `paymentsConfirmDeclinesBlock` – bounds declines per address block across accounts (10 / 1 h), catching card-testing spread.
  - `paymentsIntentSync` – pools `POST /payments` and `POST /payments/:id/sync` calls (30 / 1 h).
- **`jobs`** – Two cron jobs:
  - `reapPayments` (`reap:payments`, daily 02:15) – deletes never-settled payment attempts past their retention window.
  - `sweepPaymentEffects` (`sweep:payment-effects`, every 5 min) – retries unanswered refunds and settles payments whose webhook never arrived.

## Relationships

- **`src/modules/payments/openapi.yaml`** – The OpenAPI spec in the same directory defines the endpoints referenced by every rate-limit bound (e.g. `POST /payments/:id/confirm`, `POST /payments/webhook/{provider}`); the budgets here gate those routes at the transport layer.
- **`src/modules/payments/authorization.yaml`** – Sibling file in the same module that likely holds the authorization/permission rules guarding the payment routes; the `audited: true` flag on each budget and the `access` dependency (`ownOrderFlag`) point to authorization logic defined there.
- **`src/modules/invoicing/module.yaml`** – Adjacent money-flow module; the `orders` dependency (freezing totals, opening refunds) is the shared seam between payments and invoicing.

## Notes

- The three 1-hour payment-velocity budgets (`paymentsConfirmAttempts`, `paymentsConfirmDeclines`, `paymentsConfirmDeclinesBlock`) intentionally use a **fixed** `windowMs: 3600000` rather than the shared browsing window — the one-hour duration is semantically part of the budget, not a reuse of the shared window.
- `paymentsConfirmDeclines` counts only genuine provider DECLINE responses, deliberately excluding other 409 results (e.g. a race condition) on the confirm route.
- `paymentWebhook` uses `windowMs: shared`, meaning it rides the global shared-window duration rather than a fixed one; its counter is consumed on success only.
- `sweepPaymentEffects` runs every 5 minutes specifically to stay well inside the 30-minute reservation hold that a stuck `commit` would otherwise outlive.
- Each rate-limit's `environmentVariable` exposes a `NODE_*` override for ops; `defaultMax` is the fallback when the variable is unset.
