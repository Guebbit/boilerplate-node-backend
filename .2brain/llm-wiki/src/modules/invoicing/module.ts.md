---
source: src/modules/invoicing/module.ts
source_sha256: 63fec0aace1e821e4cebd7fe37ff90e4a25eaa691441f16092f9912783e058b7
context_sha256: 0b99e9c38746245cff445262eb713a1806061f0a8b517d5aea1d43bbf39ff83e
generated_at: 2026-11-22T05:32:29.653006+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/module.ts

## Purpose
Manifest entry for the `invoicing` module. It registers the module with the kernel and wires up the event listeners that freeze tax invoices and credit notes. The module owns the `Invoice`/`CreditNote` collections and their numbering series, and shares the `/orders` URL prefix with `orders`. No route creates an invoice or credit note. Both are issued only from this file's event subscriptions, reacting to facts that other modules have already recorded.

## Key elements
The default export is an object that `satisfies AppModule`. Its fields are:
- `name`: `'invoicing'`.
- `mounts`: mounts `router` (from `./routes`) at `/orders`.
- `jobs`: `invoicingJobs`.
- `config`: the config slices `invoicingConfig.slice` and `invoicingProviderProbe.slice`.
- `rateLimits`: `invoicingRateLimits`.
- `reencrypt`: `invoicingService.reencryptInvoices`. The buyer address frozen on each document is PII-encrypted.
- `personalData`: a single `invoicing` section whose `collect` calls `collectPersonalData(subject.userId)`. It defines no `erase`; a comment in the file points to the docblock in the invoicing module's personal-data service for the reason.
- `subscribe`: registers three domain-event listeners via `onDomainEvent`:
  - `ORDER_STATUS_CHANGED`: ignores any transition whose `to` is not `OrderStatus.paid`. For a paid order it re-reads the order with `orderService.getById`, then calls `invoicingService.issueInvoice(order)`. If an invoice results, it calls `creditSettledRefunds(orderId)`.
  - `ORDER_BILLING_CORRECTED`: calls `correctInvoice(orderId, eventId)`.
  - `PAYMENT_REFUNDED`: calls `issueCreditNote({ orderId, refundId, amount, full, goods? })`. `goods` is included only when present.
- `locales` and `templates`: the `locales` and `templates` directories next to the file.

## Relationships
- `@kernel/registry`: supplies the `AppModule` type that the export must satisfy. `src/modules.ts` is presumably where the manifest is collected, but that is not visible in this file.
- `@kernel/events`: supplies `onDomainEvent`, used for the three subscriptions. The failure behavior described in Notes comes from `emitDomainEvent`.
- `@modules/orders` and `@modules/payments`: supply the events listened to (`ORDER_STATUS_CHANGED`, `ORDER_BILLING_CORRECTED`, `PAYMENT_REFUNDED`) and `orderService`, which is used for the fresh order read.
- `./routes`, `./jobs`, `./config`, `./rate-limits` and `./providers`: supply the router, jobs, config slices, rate limits and provider probe that the manifest lists.
- `./services` (index): supplies `invoicingService`, which provides `issueInvoice` and `reencryptInvoices`.
- `./services/correct-invoice`, `./services/issue-credit-note` and `./services/personal-data`: supply `correctInvoice`, `issueCreditNote`, `creditSettledRefunds` and `collectPersonalData`.
- `src/modules/account/module.ts`: the file names the `account`/`addresses` split as the precedent for sharing a URL prefix. No code dependency is visible.
- The integration tests `correct-invoice.test.ts` and `credit-note-catch-up.test.ts` are neighbors in the graph, but this file does not reference them.

## Notes
- A failure in a listener is logged by `emitDomainEvent` and never rolls back the triggering write. A paid order stays paid even if its invoice freeze failed. A missing invoice is therefore possible, but a skipped invoice number is not.
- The `ORDER_STATUS_CHANGED` handler re-reads the order because the event payload carries only `{ orderId, from, to }`, and the invoice needs the order's frozen lines, address and currency.
- The `creditSettledRefunds` call after issuing covers refunds that settled while the invoice event was dead. Those refunds found no invoice to credit and skipped their note. Reviving the invoice brings the notes back.
- Delivery is at-least-once. `meta.eventId` serves as the credit note's `correctionKey`, so a redelivered `ORDER_BILLING_CORRECTED` issues nothing new.
- The module has no delete door by design, and documents are never re-rendered from live config. The only writes after issue are:
  - `reap:invoices`, which blanks the buyer block.
  - A buyer correction, which flips the old invoice to `corrected` beside its replacement.
- The file's `@see` tags link to design pages on the invoicing module's neighbourhood and on which contract fragment owns which operation.
