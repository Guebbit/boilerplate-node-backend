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
import { holdsSet } from '@kernel/ability';
import type { NotificationBody, StaffNotificationCode } from './model';

/** One work notice's routing: its audience, its mail class and how loud it is. */
export interface StaffRoute {
    /**
     * Permission sets whose holders are told, plus every unrestricted role. Empty means
     * administrators only. `per-notice`: the producer names them (a ticket's set depends on its
     * kind), see {@link setsOfRoute}.
     */
    sets: readonly string[] | 'per-notice';
    /** `now`: one mail per recipient when the notice is first written. `none`: the bell only. */
    email: 'now' | 'none';
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
    // Told to the one person it was given to: the bell is enough, they are already working.
    'notifications.staff.ticket-assigned': {
        sets: 'per-notice',
        email: 'none',
        severity: NotificationSeverity.info
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

/**
 * The frontend screen a notice points at: the account for a hold, the subscription for a disabled
 * webhook. Ids only, as the params carry; the screen has the rest.
 *
 * @param body - the notice
 */
export const staffLinkOf = (body: StaffNoticeBody): StaffLink => {
    switch (body.code) {
        case 'notifications.staff.purchase-hold-placed': {
            return { template: 'users/{id}', parameters: { id: body.params.userId } };
        }
        case 'notifications.staff.webhook-disabled': {
            return {
                template: 'webhooks/subscriptions/{id}',
                parameters: { id: body.params.subscriptionId }
            };
        }
        case 'notifications.staff.ticket-opened':
        case 'notifications.staff.ticket-assigned': {
            return { template: 'tickets/{id}', parameters: { id: body.params.ticketId } };
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
