---
source: src/modules/invoicing/module.ts
sha256: 8443734bfecf2721361868473933fb99d39d2e44961362294795cdb8f2c616ac
generated_at: 2026-11-08T06:11:53.939041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/module.ts

## Purpose

Module manifest for the invoicing domain. It registers routes, jobs, config, rate limits, event subscriptions, and personal-data hooks into the kernel's `AppModule` contract. Its core responsibility is to issue **frozen** `Invoice` and `CreditNote` documents exclusively via event listeners (never via HTTP routes), reacting to facts already recorded by `orders` or `payments`. Once issued, these documents are immutable—there is no delete, update, or re-render path.

## Key elements

- **Default export** — an `AppModule` object that wires everything together:
  - `mounts` — mounts `./routes` under the shared `/orders` prefix.
  - `jobs` — registers `invoicingJobs` (includes `reap:invoices`, the sole post-issue write that blanks the buyer block).
  - `config` — exposes `invoicingConfig.slice` and `invoicingProviderProbe.slice` to the kernel.
  - `rateLimits` — `invoicingRateLimits` for the routes.
  - `reencrypt` — points to `invoicingService.reencryptInvoices` (PII-encrypted buyer addresses).
  - `personalData` — collects via `collectPersonalData`; deliberately omits `erase` (see `services/personal-data.ts`).
  - `subscribe` — registers two domain-event listeners (see Relationships).
  - `locales` / `templates` — file-system paths for i18n and rendering templates.

- **`ORDER_STATUS_CHANGED` listener** — fires when an order transitions to `paid`. Re-reads the full order (the event payload carries only `{ orderId, from, to }`), calls `invoicingService.issueInvoice(order)`, then calls `creditSettledRefunds(orderId)` to back-fill credit notes that were skipped while the invoice was missing.

- **`PAYMENT_REFUNDED` listener** — calls `issueCreditNote({ orderId, refundId, amount, full, goods? })` directly with the event payload.

## Relationships

- **`@kernel/registry`** — provides the `AppModule` type that the default export satisfies.
- **`@kernel/events`** — provides `onDomainEvent`, the subscription mechanism used in `subscribe`.
- **`@modules/orders`** — subscribes to `ORDER_STATUS_CHANGED`; calls `orderService.getById` to fetch the full order for freezing.
- **`@modules/payments`** — subscribes to `PAYMENT_REFUNDED`.
- **`./routes`** — the `router` mounted under `/orders`.
- **`./services`** — `invoicingService.issueInvoice` and `invoicingService.reencryptInvoices`.
- **`./services/issue-credit-note`** — `issueCreditNote` (refund listener) and `creditSettledRefunds` (catch-up after a late invoice).
- **`./services/personal-data`** — `collectPersonalData` for the GDPR/data-subject request hook.
- **`./config`**, **`./providers/index`**, **`./rate-limits`**, **`./jobs`** — each contributes a slice to the manifest.
- **`module.yaml`** — static manifest metadata for this module (name, dependencies, etc.).
- **Tests** — `tests/integration/issue-credit-note.test.ts` and `tests/integration/credit-note-catch-up.test.ts` exercise the two listener paths end-to-end.

## Notes

- **Failure isolation:** a listener failure is logged by `emitDomainEvent` and never rolls back the triggering write. An order that reached `paid` stays `paid` even if the invoice freeze fails. A missing invoice is possible; a skipped invoice number is not (numbering is owned here, not by the caller).
- **Shared URL prefix:** invoicing mounts under `/orders`, the same prefix as the `orders` module. This is an intentional contract-fragmentation pattern (precedent: `account`/`addresses` in `docs/api/contract-fragmentation.md`).
- **No creation via routes:** no HTTP endpoint creates an invoice or credit note. Both documents exist only because a domain event fired. If the event is lost, the document simply does not exist.
- **`creditSettledRefunds` catch-up:** if a refund settled while the invoice was still missing (e.g., the `ORDER_STATUS_CHANGED` event was dead), the credit note was skipped. When the invoice is eventually issued, `creditSettledRefunds(orderId)` re-runs the issuance for those orphaned refunds.
