---
source: src/modules/payments/module.yaml
sha256: 980c1bbf68ff1e2b075478734157d6db5f8ffb9d9e6562ec29448510ae86fe7b
generated_at: 2026-11-14T21:01:47.359167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/module.yaml

## Purpose

Module manifest for the **payments** subdomain (group `shop`, subdomain `supporting`). It declares the module's identity, its cross-module dependencies, its rate-limit budgets, and its scheduled background jobs. The runtime reads this file to wire the module into the process; it contains no executable logic itself.

## Key elements

- **`summary` / `subdomain` / `group`** — Identifies the module as "An order's money, behind a provider port" within the `shop` group.
- **`dependsOn`** — Three module-level dependencies:
  - `access` — supplies the `ownOrderFlag` audit flag for money steps on the caller's own order.
  - `orders` — a payment freezes an order's total; a refunding cancel reopens the refund.
  - `shop` — provides the zone in which a transfer's pay-by deadline is printed.
- **`rateLimits`** — Five named budgets (all overridable via `NODE_*` env vars):
  - `paymentWebhook` (60/addr-block, shared window) — refusals on `POST /payments/webhook/{provider}`; **not audited** (a forged flood would bury the audit trail; refusal metric + signature-failure alert still fire).
  - `paymentsConfirmAttempts` (5/hour) — all outcomes on `POST /payments/:id/confirm`; **audited**.
  - `paymentsConfirmDeclines` (3/hour) — genuine DECLINE responses only, excluding race-condition 409s; **audited**.
  - `paymentsConfirmDeclinesBlock` (10/hour per address block) — cross-account card-testing detector; **audited**.
  - `paymentsIntentSync` (30/hour) — pooled budget for `POST /payments` and `POST /payments/:id/sync`; **audited**.
- **`jobs`** — Two cron-scheduled tasks:
  - `reapPayments` (`15 2 * * *`) — deletes never-settled payment attempts past retention.
  - `sweepPaymentEffects` (`*/5 * * * *`) — retries unanswered refunds; settles payments whose webhook never arrived. Runs well inside the 30-minute reservation hold a stuck `commit` would otherwise outlive.

## Relationships

- **`src/modules/invoicing/module.yaml`** — The payments module's `sweepPaymentEffects` job settles payments whose webhook never arrived and retries refunds; invoicing is the downstream consumer of those settled/refunded states.
- **`src/modules/payments/authorization.yaml`** — Same-module sibling that defines the authorization (permission) rules for the payment endpoints whose rate limits are declared here.
- **`src/modules/payments/openapi.yaml`** — Same-module sibling that provides the OpenAPI contract for the payment routes referenced by the rate-limit budgets (`POST /payments`, `POST /payments/:id/confirm`, `POST /payments/webhook/{provider}`, etc.).

## Notes

- The three confirm-velocity budgets are **fixed at one hour** by design: the duration is semantically part of the budget, not a side-effect of the shared browsing window (unlike `paymentWebhook`, which uses the shared window).
- `paymentWebhook` is the only budget with `audited: false`; the rationale is that a forged flood would itself overwhelm the audit log. Monitoring is delegated to a refusal counter and a signature-failure alert.
- `paymentsConfirmDeclines` explicitly excludes non-DECLINE 409s (e.g. race conditions), so the budget is not inflated by benign concurrent requests.
- `sweepPaymentEffects` cadence (5 min) is chosen to stay comfortably inside the 30-minute reservation hold; the comment in the file calls this out as intentional.
