/**
 * @module
 * What each domain event becomes in the inbox, for the notices every project has: a webhook
 * switched off, an outbox event parked, a to-do opened, overdue or handed over. One function per
 * event, each a mapping from a payload to the work notice to write — the module's `subscribe()`
 * wires them to the bus, and the writing itself stays in `./staff`.
 *
 * Notices a project adds (the shop's) live in the module that adds them and call
 * `notificationsService.notifyStaff` / `create` with their own routing.
 */

import type { DomainEventMap } from '@kernel/events';
import type { PermissionSetName } from '@kernel/permissions';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { taskService } from '@modules/tasks';
import { STAFF_ROUTES, staffLinkOf } from '../staff-routing';
import { notifyStaff, notifyStaffMember } from './staff';

/** A subscription was switched off: the staff who manage webhooks hear of it, once per disable. */
export const onWebhookSubscriptionAutoDisabled = ({
    tenantId,
    subscriptionId,
    disabledAt
}: DomainEventMap['webhook.subscription_auto_disabled']): Promise<void> =>
    notifyStaff({
        tenantId,
        body: { code: 'notifications.staff.webhook-disabled', params: { subscriptionId } },
        route: STAFF_ROUTES['notifications.staff.webhook-disabled'],
        dedupeKey: `webhook-disabled:${subscriptionId}:${disabledAt}`
    }).then(() => undefined);

/** An outbox event was parked after its last retry: the administrators hear of it, once per event. */
export const onOutboxEventDead = ({
    eventId,
    eventName,
    aggregateId
}: DomainEventMap['outbox.event_dead']): Promise<void> =>
    notifyStaff({
        tenantId: DEPLOYMENT_TENANT_ID,
        body: { code: 'notifications.staff.outbox-dead', params: { eventName, aggregateId } },
        route: STAFF_ROUTES['notifications.staff.outbox-dead'],
        dedupeKey: `outbox-dead:${eventId}`
    }).then(() => undefined);

/** The set that works a contact message; a typo here would alert nobody. */
const CONTACT_ALERT_SET: PermissionSetName = 'TaskManagement';

/**
 * Who hears of a new task: the sets that WORK it. A contact message is read by those who may
 * read it (`TaskDisplay`, which includes managers) but worked by `TaskManagement`; alerting
 * the readers too would tell people who cannot act on it.
 *
 * @param opened - the `task.opened` fact
 */
const alertSetsOf = ({ kind, routeSet }: DomainEventMap['task.opened']): string[] =>
    kind === 'contact' ? [CONTACT_ALERT_SET] : [routeSet];

/**
 * The params of a to-do notice: ids and closed codes, plus the screen that does the work when the
 * opener named one.
 *
 * @param fact - the `task.opened` or `task.overdue` fact
 */
const taskParametersOf = (fact: DomainEventMap['task.opened']) => ({
    taskId: fact.taskId,
    kind: fact.kind,
    ...(fact.category ? { category: fact.category } : {}),
    ...(fact.work ? { work: fact.work } : {})
});

/**
 * A task was opened: everyone who works its kind hears of it once, by id and kind alone.
 *
 * A contact message nobody could be told of (no staff with an address) goes to the fallback
 * mailbox instead, with the message in it: that mailbox is then the whole inbox. With even one
 * permitted recipient the mailbox hears nothing.
 */
export const onTaskOpened = (opened: DomainEventMap['task.opened']): Promise<void> => {
    const body = {
        code: 'notifications.staff.task-opened',
        params: taskParametersOf(opened)
    } as const;
    return notifyStaff({
        tenantId: opened.tenantId,
        body,
        route: STAFF_ROUTES[body.code],
        link: staffLinkOf(body),
        sets: alertSetsOf(opened),
        dedupeKey: `task-opened:${opened.taskId}`
    }).then((told) =>
        told === 0 && opened.kind === 'contact'
            ? taskService.mailFallbackMailbox(opened.taskId)
            : undefined
    );
};

/**
 * An open task went overdue: the people the opener told hear of it once more, the same sets, the
 * same fallback mailbox for a contact message nobody could be told of. The sweep claims a task
 * once, so this runs once per task; the dedupe key is the second guard.
 */
export const onTaskOverdue = (overdue: DomainEventMap['task.overdue']): Promise<void> => {
    const body = {
        code: 'notifications.staff.task-overdue',
        params: taskParametersOf(overdue)
    } as const;
    return notifyStaff({
        tenantId: overdue.tenantId,
        body,
        route: STAFF_ROUTES[body.code],
        link: staffLinkOf(body),
        sets: alertSetsOf(overdue),
        dedupeKey: `task-overdue:${overdue.taskId}`
    }).then((told) =>
        told === 0 && overdue.kind === 'contact'
            ? taskService.mailFallbackMailbox(overdue.taskId, true)
            : undefined
    );
};

/** A task was given to a colleague: the one who now holds it hears, and nobody else. */
export const onTaskAssigned = (assigned: DomainEventMap['task.assigned']): Promise<void> =>
    notifyStaffMember(assigned.assigneeId, {
        tenantId: assigned.tenantId,
        body: {
            code: 'notifications.staff.task-assigned',
            params: { taskId: assigned.taskId, kind: assigned.kind }
        },
        route: STAFF_ROUTES['notifications.staff.task-assigned'],
        sets: [assigned.routeSet],
        dedupeKey: `task-assigned:${assigned.taskId}:${assigned.assignedAt}`
    });
