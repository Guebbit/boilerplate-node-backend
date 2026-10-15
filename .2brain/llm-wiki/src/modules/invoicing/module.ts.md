---
source: src/modules/invoicing/module.ts
sha256: 900b37e6751fe3b79e55cdd0d4482b0465b0ba009052a26dbb608e28266ab738
generated_at: 2026-10-15T10:38:43.060213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/module.ts

## Purpose

The module manifest for the Invoicing module. It declares the module's identity (`AppModule`) and wires together its routes, config, rate limits, PII hooks, and the two event-driven listeners that freeze invoices and credit notes. No HTTP request ever creates a document; both are produced solely in reaction to domain events published by `orders` and `payments`.

## Key elements

- **`export default` (satisfies `AppModule`)** — the single manifest object the kernel registers. Sets `name: 'invoicing'`, `basePath: '/orders'`, and points at the module's `locales` and `templates` directories.
- **`subscribe()`** — registers two `onDomainEvent` handlers:
  - `ORDER_STATUS_CHANGED` → if `to === OrderStatus.paid`, re-reads the full order via `getOrderById` and calls `issueInvoice`.
  - `PAYMENT_REFUNDED` → calls `issueCreditNote` with the event payload (`orderId`, `refundId`, `amount`, `full`, optional `goods`).
- **`reencrypt: reencryptInvoices`** — hook the kernel calls to re-encrypt PII (buyer addresses) on invoices and credit notes.
- **`personalData`** — registers a `collect` callback (`collectPersonalData`) for GDPR data-export. No `erase` is registered; documents are never deleted.
- **`config`** — array of config slices from `invoicingConfig` and `invoicingProviderProbe`, exposed to the kernel's config system.
- **`rateLimits`** — the module's rate-limit definitions from `./rate-limits`.
- **`routes`** — the Hono (or equivalent) router from `./routes`, mounted under the shared `/orders` prefix.

## Relationships

- **`src/kernel/events.ts`** — provides `onDomainEvent`, the subscription mechanism used inside `subscribe()`.
- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/modules.ts`** — imports this module's default export to register it in the application's module list.
- **`src/modules/invoicing/config.ts`** — source of `invoicingConfig.slice` included in the manifest's `config` array.
- **`src/modules/invoicing/providers/index.ts`** — source of `invoicingProviderProbe.slice` in the manifest.
- **`src/modules/invoicing/rate-limits.ts`** — source of `invoicingRateLimits`.
- **`src/modules/invoicing/routes.ts`** — source of the `router` mounted at `basePath`.
- **`src/modules/invoicing/services/index.ts`** — re-exports `issueInvoice`, `issueCreditNote`, `reencryptInvoices` consumed by this file.
- **`src/modules/invoicing/services/issue-invoice.ts`** — called by the `ORDER_STATUS_CHANGED` listener after a fresh order read.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — called by the `PAYMENT_REFUNDED` listener.
- **`src/modules/invoicing/services/personal-data.ts`** — provides `collectPersonalData` used in the `personalData` hook.
- **`src/modules/invoicing/services/reencrypt.ts`** — provides `reencryptInvoices` for the PII re-encryption hook.
- **Integration tests** (`tests/integration/issue-invoice.test.ts`, `issue-credit-note.test.ts`, `reencrypt.test.ts`) — exercise the services this manifest wires up.

## Notes

- **Shared `/orders` prefix.** Invoicing routes live under the same URL prefix as the `orders` module. This is intentional (precedent: `account`/`addresses`) and documented in `docs/api/contract-fragmentation.md`.
- **Event listeners never roll back the source write.** If `issueInvoice` throws, the order stays `paid`; a missing invoice is acceptable, a skipped invoice number is not.
- **No delete/erase path.** Neither invoices nor credit notes can be deleted or erased. The `personalData` entry deliberately omits `erase`.
- **Fresh read, not event payload.** The `ORDER_STATUS_CHANGED` event carries only `{ orderId, from, to }`; the listener issues a full `getOrderById` read to obtain frozen lines, address, and currency.
