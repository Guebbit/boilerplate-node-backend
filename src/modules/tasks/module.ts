/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. A message sent while signed
 * in records the sender's account; an anonymous one only the address typed. The export and the
 * erasure take both (see `./domain/ownership`). Announces `task.opened` / `task.assigned`; `notifications` does the telling. Opens and closes system tasks from other modules' events (`./services/system`).
 *
 * See: docs/modules/tasks.md
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
import { tasksJobs } from './jobs';
import { systemTasks } from './services/system';
import { tasksRateLimits } from './rate-limits';
import { taskService } from './service';
import { tasksConfig } from './config';

/** This module's manifest entry: public contact form, keyed triage (`tasks.*`). */
export default {
    name: 'tasks',
    mounts: [{ basePath: '/tasks', routes: router }],
    config: [tasksConfig.slice],
    /** The contact-form budgets — see `./rate-limits.ts`. */
    rateLimits: tasksRateLimits,
    jobs: tasksJobs,
    personalData: [
        {
            section: 'tasks',
            // Always an array: the section is required in the contract. The set is the one
            // `erase` removes (`./domain/ownership`).
            collect: (subject) => taskService.findOwnTasksForExport(subject),
            // Inside the hard-delete transaction only, never at the reversible lock.
            erase: (subject, session) => taskService.eraseOwnTasks(subject, session)
        },
        {
            // The tasks the system opened about the person, staff ids withheld. Erased by the
            // first section's hook, which owns the whole collection.
            section: 'systemTasks',
            collect: (subject) => taskService.findSystemTasksForExport(subject)
        }
    ],
    /** Each situation's opening event and the event that ends it: see `./services/system`. */
    subscribe: () => {
        onDomainEvent(USER_REVIEW_FLAGGED, systemTasks.onReviewFlagged);
        onDomainEvent(USER_REVIEW_CLEARED, systemTasks.onReviewCleared);
        onDomainEvent(PAYMENT_REFUND_OWED_BY_HAND, systemTasks.onRefundOwedByHand);
        onDomainEvent(PAYMENT_REFUND_FAILED, systemTasks.onRefundFailed);
        onDomainEvent(PAYMENT_REFUNDED, systemTasks.onRefundClosed);
        onDomainEvent(PAYMENT_REFUND_CANCELED, systemTasks.onRefundClosed);
        onDomainEvent(PAYMENT_AMOUNT_MISMATCH, systemTasks.onAmountMismatch);
        onDomainEvent(PAYMENT_DISPUTE_OPENED, systemTasks.onDispute);
        onDomainEvent(PAYMENT_DISPUTE_UPDATED, systemTasks.onDispute);
        onDomainEvent(HOLD_ORPHANED, systemTasks.onHoldOrphaned);
        onDomainEvent(ORDER_CANCELLED, systemTasks.onOrderCancelled);
        onDomainEvent(SHIPMENT_SHIPPED, systemTasks.onShipped);
        onDomainEvent(FULFILLMENT_ORDER_CANCELLED, systemTasks.onFulfillmentOrderCancelled);
        onDomainEvent(FULFILLMENT_ORDER_DELAYED, systemTasks.onDelayed);
        onDomainEvent(ACCOUNT_EXPORT_FAILED, systemTasks.onExportFailed);
        onDomainEvent(ACCOUNT_EXPORT_READY, systemTasks.onExportReady);
    },
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
