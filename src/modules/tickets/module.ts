/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. A message sent while signed
 * in records the sender's account; an anonymous one only the address typed. The export and the
 * erasure take both (see `./domain/ownership`). Announces `ticket.opened` / `ticket.assigned`; `notifications` does the telling. Opens and closes system tickets from other modules' events (`./services/system`).
 *
 * See: docs/modules/tickets.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { onDomainEvent } from '@kernel/events';
import { ACCOUNT_EXPORT_FAILED, ACCOUNT_EXPORT_READY } from '@modules/account';
import {
    FULFILLMENT_ORDER_CANCELLED,
    FULFILLMENT_ORDER_DELAYED,
    SHIPMENT_SHIPPED
} from '@modules/delivery';
import { HOLD_ORPHANED } from '@modules/inventory';
import { ORDER_CANCELLED } from '@modules/orders';
import {
    PAYMENT_AMOUNT_MISMATCH,
    PAYMENT_DISPUTE_OPENED,
    PAYMENT_DISPUTE_UPDATED,
    PAYMENT_REFUNDED,
    PAYMENT_REFUND_CANCELED,
    PAYMENT_REFUND_FAILED,
    PAYMENT_REFUND_OWED_BY_HAND
} from '@modules/payments';
import { USER_REVIEW_CLEARED, USER_REVIEW_FLAGGED } from '@modules/users';
import { router } from './routes';
import { systemTickets } from './services/system';
import { ticketsRateLimits } from './rate-limits';
import { ticketService } from './service';
import { ticketsConfig } from './config';

/** This module's manifest entry: public contact form, keyed triage (`tickets.*`). */
export default {
    name: 'tickets',
    mounts: [{ basePath: '/tickets', routes: router }],
    config: [ticketsConfig.slice],
    /** The contact-form budgets — see `./rate-limits.ts`. */
    rateLimits: ticketsRateLimits,
    personalData: [
        {
            section: 'tickets',
            // Always an array: the section is required in the contract. The set is the one
            // `erase` removes (`./domain/ownership`).
            collect: (subject) => ticketService.findOwnTicketsForExport(subject),
            // Inside the hard-delete transaction only, never at the reversible lock.
            erase: (subject, session) => ticketService.eraseOwnTickets(subject, session)
        },
        {
            // The tickets the system opened about the person, staff ids withheld. Erased by the
            // first section's hook, which owns the whole collection.
            section: 'systemTickets',
            collect: (subject) => ticketService.findSystemTicketsForExport(subject)
        }
    ],
    /** Each situation's opening event and the event that ends it: see `./services/system`. */
    subscribe: () => {
        onDomainEvent(USER_REVIEW_FLAGGED, systemTickets.onReviewFlagged);
        onDomainEvent(USER_REVIEW_CLEARED, systemTickets.onReviewCleared);
        onDomainEvent(PAYMENT_REFUND_OWED_BY_HAND, systemTickets.onRefundOwedByHand);
        onDomainEvent(PAYMENT_REFUND_FAILED, systemTickets.onRefundFailed);
        onDomainEvent(PAYMENT_REFUNDED, systemTickets.onRefundClosed);
        onDomainEvent(PAYMENT_REFUND_CANCELED, systemTickets.onRefundClosed);
        onDomainEvent(PAYMENT_AMOUNT_MISMATCH, systemTickets.onAmountMismatch);
        onDomainEvent(PAYMENT_DISPUTE_OPENED, systemTickets.onDispute);
        onDomainEvent(PAYMENT_DISPUTE_UPDATED, systemTickets.onDispute);
        onDomainEvent(HOLD_ORPHANED, systemTickets.onHoldOrphaned);
        onDomainEvent(ORDER_CANCELLED, systemTickets.onOrderCancelled);
        onDomainEvent(SHIPMENT_SHIPPED, systemTickets.onShipped);
        onDomainEvent(FULFILLMENT_ORDER_CANCELLED, systemTickets.onFulfillmentOrderCancelled);
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, systemTickets.onDelayed);
        onDomainEvent(ACCOUNT_EXPORT_FAILED, systemTickets.onExportFailed);
        onDomainEvent(ACCOUNT_EXPORT_READY, systemTickets.onExportReady);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
