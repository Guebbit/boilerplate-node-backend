/**
 * @module
 * Who hears what: for each work notice, the permission sets whose holders do that work, whether it
 * is worth an email, and where the notice points. One file to read to audit "who is told".
 *
 * The mail rule: `now` only where someone must act soon (money, a legal clock, security). Every
 * other code is inbox-only, so the bell is the default and the mailbox is the exception.
 *
 * See: docs/modules/notifications.md#work-notices-for-staff
 */

import { NotificationSeverity } from '@types';
import type { Caller } from '@types';
import type { PermissionSetName } from '@api/permission-vocabulary';
import { holdsSet } from '@kernel/ability';
import { FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import type { NotificationBody, StaffNotificationCode, StaffSummaryCode } from './model';

/** One work notice's routing: its audience, its mail class and how loud it is. */
export interface StaffRoute {
    /**
     * Permission sets whose holders are told, plus every unrestricted role. Empty means
     * administrators only. `per-notice`: the producer names them (a ticket's set depends on its
     * kind), see {@link setsOfRoute}.
     */
    sets: readonly PermissionSetName[] | 'per-notice';
    /**
     * `now`: one mail per recipient when the notice is first written. `digest`: a summary row,
     * mailed in the daily digest when it appears or grows. `none`: the bell only.
     */
    email: 'now' | 'digest' | 'none';
    severity: NotificationSeverity;
}

/** Every work notice code and its routing. A code missing here does not compile. */
export const STAFF_ROUTES: Readonly<Record<StaffNotificationCode, StaffRoute>> = {
    // Abuse defence: a bot or a loop is placing and cancelling orders, and a person steps in soon.
    'notifications.staff.purchase-hold-placed': {
        sets: ['UserBanning'],
        email: 'now',
        severity: NotificationSeverity.warning
    },
    // Fix the endpoint and re-enable it: worth a look, not worth waking anyone.
    'notifications.staff.webhook-disabled': {
        sets: ['WebhookManagement'],
        email: 'none',
        severity: NotificationSeverity.warning
    },
    // A ticket opened: whoever works its kind takes it. Mailed now because a person waits on it
    // (a visitor's message, a refund owed, a legal clock).
    'notifications.staff.ticket-opened': {
        sets: 'per-notice',
        email: 'now',
        severity: NotificationSeverity.info
    },
    // The same people as the opener, once, when the ticket passes its due date and nobody closed
    // it: this is the "overdue" mail the digest's rule describes. Warning, since something is late.
    'notifications.staff.ticket-overdue': {
        sets: 'per-notice',
        email: 'now',
        severity: NotificationSeverity.warning
    },
    // Told to the one person it was given to: the bell is enough, they are already working.
    'notifications.staff.ticket-assigned': {
        sets: 'per-notice',
        email: 'none',
        severity: NotificationSeverity.info
    },
    // The buyer waits for an answer and the shop owes one: the people who decide returns take it.
    'notifications.staff.return-requested': {
        sets: ['ReturnManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    // No set does this work: an empty list is administrators only. Prometheus pages the operator
    // too, so the bell is enough here.
    'notifications.staff.outbox-dead': {
        sets: [],
        email: 'none',
        severity: NotificationSeverity.error
    },
    // The summary rows below are counts the daily digest rewrites. The ones that mail are the
    // overdue ones (something is late and nobody has acted); a count of work in the normal course
    // is the bell's alone.
    'notifications.staff.transfers-due': {
        sets: ['PaymentRecording'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    'notifications.staff.preorders-late': {
        sets: ['OrderEditing'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'notifications.staff.delivery-holds-open': {
        sets: ['DeliveryManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'notifications.staff.withdrawals-awaiting-goods': {
        sets: ['ReturnReceiving'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    'notifications.staff.returns-undecided': {
        sets: ['ReturnManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'notifications.staff.low-stock': {
        sets: ['InventoryManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    'notifications.staff.unshipped': {
        sets: ['DeliveryStart'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    'notifications.staff.awaiting-tracking': {
        sets: ['DeliveryManagement'],
        email: 'none',
        severity: NotificationSeverity.info
    },
    // Until a parcel is marked arrived, the buyer's withdrawal window and guarantee have not started.
    'notifications.staff.undelivered': {
        sets: ['DeliveryManagement'],
        email: 'digest',
        severity: NotificationSeverity.warning
    },
    // A refund open past the attention threshold runs against the 14-day refund clock.
    'notifications.staff.stale-refunds': {
        sets: ['PaymentRefunding'],
        email: 'digest',
        severity: NotificationSeverity.warning
    }
};

/**
 * The sets a notice is for: its route's, or the ones the producer named for a `per-notice` route.
 * A `per-notice` route with none named is administrators only, never everyone.
 *
 * @param route - the code's routing
 * @param named - the producer's sets, for a `per-notice` route
 */
export const setsOfRoute = (route: StaffRoute, named: readonly string[] = []): readonly string[] =>
    route.sets === 'per-notice' ? named : route.sets;

/** The body of a work notice: a staff code with its own params. */
export type StaffNoticeBody = Extract<NotificationBody, { code: StaffNotificationCode }>;

/** A page of the paired frontend: the path template (no locale) and its placeholder values. */
export interface StaffLink {
    template: string;
    parameters: Record<string, string>;
}

/** Where the staff screens live: the shared `staffPages` paths, in the frontend's own router. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

/** The admin page that lists what each summary row counts. */
const SUMMARY_PAGES: Readonly<Record<StaffSummaryCode, string>> = {
    'notifications.staff.transfers-due': PAGES.salesOrders,
    'notifications.staff.preorders-late': PAGES.salesPreorders,
    'notifications.staff.delivery-holds-open': PAGES.salesOrders,
    'notifications.staff.withdrawals-awaiting-goods': PAGES.returns,
    'notifications.staff.returns-undecided': PAGES.returns,
    'notifications.staff.low-stock': PAGES.inventory,
    'notifications.staff.unshipped': PAGES.salesOrders,
    'notifications.staff.awaiting-tracking': PAGES.salesOrders,
    'notifications.staff.undelivered': PAGES.salesOrders,
    'notifications.staff.stale-refunds': PAGES.salesPayments
};

/**
 * The screen of the record a dead outbox event was about, read off the event name's first segment
 * (`user.updated` is about a user). An event of any other kind has no screen: the link is the
 * admin's home, never a guess. An order event has none either: the frontend builds that link
 * itself, and only when the shop is there.
 *
 * @param eventName - the parked event
 * @param aggregateId - what it was about
 */
const outboxAggregateLink = (eventName: string, aggregateId: string): StaffLink => {
    switch (eventName.split('.', 1).join('')) {
        case 'user': {
            return { template: PAGES.user, parameters: { id: aggregateId } };
        }
        default: {
            return { template: '', parameters: {} };
        }
    }
};

/**
 * The frontend screen a notice points at: the account for a hold, the subscription for a disabled
 * webhook. Ids only, as the params carry; the screen has the rest.
 *
 * @param body - the notice
 */
export const staffLinkOf = (body: StaffNoticeBody): StaffLink => {
    switch (body.code) {
        case 'notifications.staff.purchase-hold-placed': {
            return { template: PAGES.user, parameters: { id: body.params.userId } };
        }
        case 'notifications.staff.webhook-disabled': {
            return {
                template: PAGES.webhookSubscription,
                parameters: { id: body.params.subscriptionId }
            };
        }
        case 'notifications.staff.ticket-opened':
        case 'notifications.staff.ticket-overdue':
        case 'notifications.staff.ticket-assigned': {
            return { template: PAGES.ticket, parameters: { id: body.params.ticketId } };
        }
        case 'notifications.staff.return-requested': {
            return { template: PAGES.return, parameters: { id: body.params.returnId } };
        }
        case 'notifications.staff.outbox-dead': {
            return outboxAggregateLink(body.params.eventName, body.params.aggregateId);
        }
        default: {
            return { template: SUMMARY_PAGES[body.code], parameters: {} };
        }
    }
};

/**
 * Does the caller hold one of these permission sets right now? Read at the moment of asking, so a
 * member who lost the role stops seeing the notice, and an administrator sees every one.
 *
 * An empty list is for administrators alone.
 *
 * @param caller - the reader, in tenant scope
 * @param sets - the notice's `sets`
 */
export const callerHoldsAnySet = (caller: Caller, sets: readonly string[]): boolean =>
    caller.unrestricted || sets.some((setName) => holdsSet(caller, setName));
