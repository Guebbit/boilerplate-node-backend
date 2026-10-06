/**
 * @module
 * Invoicing: the frozen tax invoice and credit-note documents `orders`' receipt never was — see
 * `docs/modules/invoicing.md` for the full design and why it is a module of its own.
 *
 * Owns:        the `Invoice`/`CreditNote` collections and their own numbering series, outright.
 * Depends on:  `orders` (the VAT breakdown, the seller's jurisdiction, an auth-scoped order read)
 *              and `payments` (`PAYMENT_REFUNDED`) — both reached through their own public
 *              barrels, same as `payments/module.ts` reaches `orders`' `ORDER_REFUND_OWED`.
 * Shares:      the `/orders` URL prefix with `orders` — see `./routes.ts` and
 *              `docs/api/contract-fragmentation.md`'s `account`/`addresses` precedent.
 *
 * No route requests an invoice or a credit note into existence — both are frozen ONLY from this
 * module's own event listeners below, reacting to a fact another module already recorded. Neither
 * document is ever deleted, updated or re-rendered from live config: this module has no delete
 * door, on purpose.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ORDER_STATUS_CHANGED, getById as getOrderById } from '@modules/orders';
import { PAYMENT_REFUNDED } from '@modules/payments';
import { OrderStatus } from '@types';
import { router } from './routes';
import { issueInvoice, issueCreditNote } from './services';
import { collectPersonalData } from './services/personal-data';
import { invoicingRateLimits } from './rate-limits';
import { invoicingConfig } from './config';
import { invoicingProviderProbe } from './providers';

/** This module's manifest entry: routes, the two issuing subscriptions, and locales. */
export default {
    name: 'invoicing',
    basePath: '/orders',
    routes: router,
    config: [invoicingConfig.slice, invoicingProviderProbe.slice],
    rateLimits: invoicingRateLimits,
    personalData: [
        {
            section: 'invoicing',
            collect: (subject) => collectPersonalData(subject.userId)
            // No `erase` — see `services/personal-data.ts`'s own docblock.
        }
    ],
    /*
     * Neither listener requests a fact — both react to one `orders`/`payments` already recorded
     * and announced. A failure here is logged by `emitDomainEvent` and never rolls back the write
     * that triggered it: an order that reached `paid` stays `paid` whether or not its invoice
     * freeze succeeded. A missing invoice is possible; a skipped invoice number is not.
     */
    subscribe: () => {
        onDomainEvent(ORDER_STATUS_CHANGED, ({ orderId, to }) => {
            if (to !== OrderStatus.paid) return undefined;
            // A fresh read, not the event's own payload: `ORDER_STATUS_CHANGED` carries only
            // `{ orderId, from, to }`, and this needs the order's full frozen lines, address and
            // currency to freeze onto the invoice.
            return getOrderById(orderId).then((order) => (order ? issueInvoice(order) : undefined));
        });
        onDomainEvent(PAYMENT_REFUNDED, ({ orderId, refundId, amount, full }) =>
            issueCreditNote({ orderId, refundId, amount, full })
        );
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
