/**
 * @module
 * What each domain event becomes in the inbox, for the notices every project has: a webhook
 * switched off, an outbox event parked, a to-do opened, due soon, overdue or handed over. One
 * function per event, each a mapping from a payload to the work notice to write — the module's
 * `subscribe()` wires them to the bus, and the writing itself stays in `./staff`.
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

/** The to-do notices that go to the people who work a kind: the same sets, the same link. */
type TaskAlertCode =
    | 'notifications.staff.task-opened'
    | 'notifications.staff.task-overdue'
    | 'notifications.staff.task-due-soon';

/**
 * Write one to-do notice to everyone who works its kind.
 *
 * @param code - which of the three notices
 * @param dedupePrefix - the dedupe key's front half; the task id is the back half
 * @param fact - the task event's payload
 * @returns how many people were told
 */
const notifyTaskStaff = (
    code: TaskAlertCode,
    dedupePrefix: string,
    fact: DomainEventMap['task.opened']
): Promise<number> => {
    const body = { code, params: taskParametersOf(fact) } as const;
    const notice = {
        tenantId: fact.tenantId,
        body,
        link: staffLinkOf(body),
        sets: alertSetsOf(fact),
        dedupeKey: `${dedupePrefix}:${fact.taskId}`
    };
    /**
     * A contact message is answered from the main mailbox, so here it is the bell's alone: no
     * mail to each person. The other kinds keep theirs.
     */
    return notifyStaff(
        fact.kind === 'contact'
            ? { ...notice, route: { ...STAFF_ROUTES[code], email: 'none' as const } }
            : { ...notice, route: STAFF_ROUTES[code] }
    );
};

/**
 * A task was opened: everyone who works its kind hears of it once, by id, kind, category and work
 * alone.
 *
 * A contact message also goes, with the message in it, to the main mailbox: staff answer from
 * there, so that mailbox is the inbox whoever else was told.
 */
export const onTaskOpened = (opened: DomainEventMap['task.opened']): Promise<void> =>
    notifyTaskStaff('notifications.staff.task-opened', 'task-opened', opened).then(() =>
        opened.kind === 'contact' ? taskService.mailMainMailbox(opened.taskId) : undefined
    );

/**
 * An open task went overdue: the people the opener told hear of it once more, the same sets, and
 * the main mailbox gets the one reminder for a contact message. The sweep claims a task once, but
 * the outbox delivers at least once, so the dedupe key is what keeps it to one notice.
 */
export const onTaskOverdue = (overdue: DomainEventMap['task.overdue']): Promise<void> =>
    notifyTaskStaff('notifications.staff.task-overdue', 'task-overdue', overdue).then(() =>
        overdue.kind === 'contact'
            ? taskService.mailMainMailbox(overdue.taskId, 'overdue')
            : undefined
    );

/**
 * An open task is three days from its due date: the same people hear of it once. The sweep claims
 * a contact message only when it is a privacy request (a month's deadline), and that one also gets
 * the main mailbox's reminder, in the same thread as the first mail.
 */
export const onTaskDueSoon = (dueSoon: DomainEventMap['task.due_soon']): Promise<void> =>
    notifyTaskStaff('notifications.staff.task-due-soon', 'task-due-soon', dueSoon).then(() =>
        dueSoon.kind === 'contact'
            ? taskService.mailMainMailbox(dueSoon.taskId, 'due-soon')
            : undefined
    );

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
