/**
 * @module
 * Who hears what: for each work notice, the permission sets whose holders do that work, whether it
 * is worth an email, and where the notice points. One file to read to audit "who is told" for the
 * notices every project has. A module that adds its own notices keeps its own table and hands it
 * over with each call (`StaffNotice.route`, `StaffNotice.link`); this file lists none of them.
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
import type { NotificationBody, NotificationCode } from './model';

/** One work notice's routing: its audience, its mail class and how loud it is. */
export interface StaffRoute {
    /**
     * Permission sets whose holders are told, plus every unrestricted role. Empty means
     * administrators only. `per-notice`: the producer names them (a task's set depends on its
     * kind), see {@link setsOfRoute}.
     */
    sets: readonly PermissionSetName[] | 'per-notice';
    /**
     * `now`: one mail per recipient when the notice is first written. `digest`: a summary row,
     * mailed in a daily digest when it appears or grows. `none`: the bell only.
     */
    email: 'now' | 'digest' | 'none';
    severity: NotificationSeverity;
}

/** A page of the paired frontend: the path template (no locale) and its placeholder values. */
export interface StaffLink {
    template: string;
    parameters: Record<string, string>;
}

/** The body of a work notice: a code of the `<module>.staff.<name>` shape with its own params. */
export type StaffNoticeBody = Extract<NotificationBody, { code: `${string}.staff.${string}` }>;

/** A work notice code this module owns: the ones that ship with every project. */
type FoundationStaffCode = Extract<NotificationCode, `notifications.staff.${string}`>;

/** The five work notices every project has, and their routing. A code missing here does not compile. */
export const STAFF_ROUTES = {
    // Fix the endpoint and re-enable it: worth a look, not worth waking anyone.
    'notifications.staff.webhook-disabled': {
        sets: ['WebhookManagement'],
        email: 'none',
        severity: NotificationSeverity.warning
    },
    // A task opened: whoever works its kind takes it. Mailed now because a person waits on it
    // (a visitor's message, a refund owed, a legal clock).
    'notifications.staff.task-opened': {
        sets: 'per-notice',
        email: 'now',
        severity: NotificationSeverity.info
    },
    // The same people as the opener, once, when the task passes its due date and nobody closed
    // it: this is the "overdue" mail the digest's rule describes. Warning, since something is late.
    'notifications.staff.task-overdue': {
        sets: 'per-notice',
        email: 'now',
        severity: NotificationSeverity.warning
    },
    // Told to the one person it was given to: the bell is enough, they are already working.
    'notifications.staff.task-assigned': {
        sets: 'per-notice',
        email: 'none',
        severity: NotificationSeverity.info
    },
    // No set does this work: an empty list is administrators only. Prometheus pages the operator
    // too, so the bell is enough here.
    'notifications.staff.outbox-dead': {
        sets: [],
        email: 'none',
        severity: NotificationSeverity.error
    }
} as const satisfies Record<FoundationStaffCode, StaffRoute>;

/**
 * The sets a notice is for: its route's, or the ones the producer named for a `per-notice` route.
 * A `per-notice` route with none named is administrators only, never everyone.
 *
 * @param route - the notice's routing
 * @param named - the producer's sets, for a `per-notice` route
 */
export const setsOfRoute = (route: StaffRoute, named: readonly string[] = []): readonly string[] =>
    route.sets === 'per-notice' ? named : route.sets;

/** Where the staff screens live: the shared `staffPages` paths, in the frontend's own router. */
const PAGES = FRONTEND_LINK_RULES.staffPages;

/**
 * The screen of the record a dead outbox event was about, read off the event name's first segment
 * (`user.updated` is about a user). An event of any other kind has no screen: the link is the
 * admin's home, never a guess. An order event has none either: the frontend builds that link
 * itself, and only when the shop is there.
 *
 * @param eventName - the parked event
 * @param aggregateId - what it was about
 */
const outboxAggregateLink = (eventName: string, aggregateId: string): StaffLink =>
    eventName.split('.', 1).join('') === 'user'
        ? { template: PAGES.user, parameters: { id: aggregateId } }
        : { template: '', parameters: {} };

/**
 * The to-do's work screen when its opener named one, else the to-do's own page. `work` is an
 * opaque path the opener supplied; nothing here knows which screen it is.
 *
 * @param params - the task notice's params
 * @param params.taskId - the task
 * @param params.work - the opener's screen, if any
 */
const taskLink = ({ taskId, work }: { taskId: string; work?: string | undefined }): StaffLink =>
    work
        ? { template: work, parameters: {} }
        : { template: PAGES.task, parameters: { id: taskId } };

/**
 * The frontend screen a notice points at: the subscription for a disabled webhook, the screen of
 * the work for a task. Ids only, as the params carry; the screen has the rest.
 *
 * @param body - the notice
 */
export const staffLinkOf = (
    body: Extract<StaffNoticeBody, { code: keyof typeof STAFF_ROUTES }>
): StaffLink => {
    switch (body.code) {
        case 'notifications.staff.webhook-disabled': {
            return {
                template: PAGES.webhookSubscription,
                parameters: { id: body.params.subscriptionId }
            };
        }
        case 'notifications.staff.task-opened':
        case 'notifications.staff.task-overdue': {
            return taskLink(body.params);
        }
        case 'notifications.staff.task-assigned': {
            return { template: PAGES.task, parameters: { id: body.params.taskId } };
        }
        case 'notifications.staff.outbox-dead': {
            return outboxAggregateLink(body.params.eventName, body.params.aggregateId);
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
