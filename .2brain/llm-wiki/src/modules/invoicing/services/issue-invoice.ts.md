---
source: src/modules/invoicing/services/issue-invoice.ts
sha256: c1615220663ce0be691879f79b33e59573ad76c9aedc2a29d1a0709b6b309304
generated_at: 2026-11-08T06:14:58.623141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/issue-invoice.ts

## Purpose

The single write path in the invoicing module. When an order transitions to `paid` (via the `ORDER_STATUS_CHANGED` listener in `module.ts`), this file freezes that order into an immutable `InvoiceDocument` — allocating a number, encrypting the billing address, and inserting the row — all inside one transaction. Idempotent by construction: a duplicate-key abort returns the already-issued invoice rather than creating a second.

## Key elements

- **`issueInvoice(order: OrderDocument)`** — exported. Orchestrates the full issue: computes the tax breakdown, allocates a number, inserts the invoice, appends an `invoice_issued` timeline entry, and on duplicate-key falls through to `readWinner` to return the existing row. Returns `undefined` if the order has no lines.
- **`findInvoiceForOrder(orderId: string)`** — exported. Thin read-through to `invoicingRepository.findInvoiceByOrderId`; the service-level gate so callers (credit-note service, `GET /orders/{id}/invoice`) never reach the repository directly. Returns `null` when no invoice exists.
- **`frozenSeller()`** *(internal)* — Builds `InvoiceSeller` from `operatorIdentity()` at call time. `vatNumber` is optional; all other fields are required at boot.
- **`frozenLines(order)`** *(internal)* — Maps order items to `InvoiceLine[]`. Deliberately stores only the raw fields (unit price, tax rate, rate type); net/tax/gross per line is re-derived downstream by `orderTaxBreakdown` to avoid a second source of truth.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the insert + timeline append as a single unit of work.
- **`@modules/orders`** (index, model, services, `domain/totals`) — imports `orderService` (read order, `billingAddressOf`, `appendTimeline`), `orderTaxBreakdown`, `orderTotal`, and the `OrderDocument` type. `orderTotal(order)` is the authoritative `grandTotal` source, identical to what `applyOrderTotals` and the placed-order email use.
- **`@modules/account`** (`services/operator-identity.ts` via barrel) — `operatorIdentity()` supplies the seller's legal identity at issue time.
- **`../model`** — type-only: `InvoiceDocument`, `InvoiceLine`, `InvoiceSeller`.
- **`../pii`** — `encryptInvoiceParty` re-encrypts the billing address under the invoice's own `_id`.
- **`../repository`** — `invoicingRepository.insertInvoice` / `findInvoiceByOrderId`.
- **`./numbering`** — `allocateInvoiceNumber` (in-transaction number allocation) and `readWinner` (duplicate-key fallback).
- **`services/index.ts`** — this module is re-exported through the services barrel; consumers import from there.
- **`services/issue-credit-note.ts`** — calls `findInvoiceForOrder` to locate the invoice a credit note corrects.

## Notes

- **Retry stability:** `_id` and `issuedAt` are allocated *before* the transaction so a driver retry reuses the same values rather than generating new ones.
- **Billing vs. shipping address:** the buyer address is always the order's own `billingAddress` (Art. 226), never the ship-to. A digital-only order has no ship-to at all.
- **`grandTotal` is never hand-computed** — it comes from `orderTotal(order)`, the same function the order model and the confirmation email quote, eliminating drift.
- **Locale** is taken from `order.items[0].locale` (the language product titles were resolved into at checkout), not from any request-level setting.
- **Return-type asymmetry:** `issueInvoice` → `InvoiceDocument | undefined` (empty order); `findInvoiceForOrder` → `InvoiceDocument | null` (no row yet).
