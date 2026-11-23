/**
 * @module
 * Invoicing: the frozen tax invoice and credit-note documents `orders`' receipt never was — the
 * full design and why it is a module
 * of its own are the linked page's.
 *
 * Owns:        the `Invoice`/`CreditNote` collections and their own numbering series, outright.
 * Shares:      the `/orders` URL prefix with `orders` — see `./routes.ts`; the
 * `account`/`addresses`
 *              split is the precedent.
 *
 * No route requests an invoice or a credit note into existence — both are frozen ONLY from this
 * module's own event listeners below, reacting to a fact another module already recorded. Neither
 * document is ever deleted or re-rendered from live config: this module has no delete door, on
 * purpose. The writes after issue are `reap:invoices`, which blanks the buyer block, and a
 * correction of the buyer, which flips the old invoice to `corrected` beside its replacement.
 *
 * @see docs/modules/invoicing.md#its-neighbourhood
 * @see docs/build/contract-fragmentation.md#which-fragment-owns-which-operation
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { orderService, ORDER_BILLING_CORRECTED, ORDER_STATUS_CHANGED } from '@modules/orders';
import { PAYMENT_REFUNDED } from '@modules/payments';
import { OrderStatus } from '@types';
import { router } from './routes';
import { invoicingService } from './services';
import { correctInvoice } from './services/correct-invoice';
import { creditSettledRefunds, issueCreditNote } from './services/issue-credit-note';
import { collectPersonalData } from './services/personal-data';
import { invoicingRateLimits } from './rate-limits';
import { invoicingConfig } from './config';
import { invoicingProviderProbe } from './providers';
import { invoicingJobs } from './jobs';
import { invoicingAuditActions } from './audit';

/** This module's manifest entry: routes, the two issuing subscriptions, and locales. */
export default {
    name: 'invoicing',
    mounts: [{ basePath: '/orders', routes: router }],
    jobs: invoicingJobs,
    config: [invoicingConfig.slice, invoicingProviderProbe.slice],
    rateLimits: invoicingRateLimits,
    // The buyer address frozen on each invoice and credit note is PII-encrypted.
    reencrypt: invoicingService.reencryptInvoices,
    staffReadPurposes: {
        [invoicingAuditActions.ADMIN_INVOICE_VIEWED]: 'handling your invoice',
        [invoicingAuditActions.ADMIN_CREDIT_NOTE_VIEWED]: 'handling your credit note'
    },
    personalData: [
        {
            section: 'invoicing',
            collect: (subject) => collectPersonalData(subject.userId)
            // No `erase` — see `services/personal-data.ts`'s own docblock.
        }
    ],
    /**
     * No listener requests a fact — both react to one `orders`/`payments` already recorded
     * and announced. A failure here is logged by `emitDomainEvent` and never rolls back the write
     * that triggered it: an order that reached `paid` stays `paid` whether or not its invoice
     * freeze succeeded. A missing invoice is possible; a skipped invoice number is not.
     */
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to !== OrderStatus.paid) return undefined;
            /**
             * A fresh read, not the event's own payload: `ORDER_STATUS_CHANGED` carries only
             * `{ orderId, from, to }`, and this needs the order's full frozen lines, address and
             * currency to freeze onto the invoice.
             */
            return (
                orderService
                    .getById(orderId)
                    .then((order) => (order ? invoicingService.issueInvoice(order) : undefined))
                    /**
                     * A refund that settled while the invoice event was dead found no invoice to
                     * credit and skipped its note; reviving the invoice brings the notes back.
                     */
                    .then((invoice) => (invoice ? creditSettledRefunds(orderId) : undefined))
            );
        });
        // At-least-once: `meta.eventId` is the credit note's `correctionKey`, so a redelivery issues nothing.
        onDomainEvent(ORDER_BILLING_CORRECTED, ({ orderId }, { eventId }) =>
            correctInvoice(orderId, eventId)
        );
        onDomainEvent(PAYMENT_REFUNDED, ({ orderId, refundId, amount, full, goods }) =>
            issueCreditNote({
                orderId,
                refundId,
                amount,
                full,
                ...(goods ? { goods } : {})
            })
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
