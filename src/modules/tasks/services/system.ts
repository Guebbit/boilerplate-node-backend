/**
 * @module
 * Tasks the system opens and closes, whoever owns the situation. A producer's event opens (or touches) one task per
 * situation; the event that ends the situation closes it as `cleared`. Both halves are idempotent:
 * a redelivered event (same `eventId`) changes nothing, two racing events open one task (the
 * unique `openKey`), and a clearing event on a task staff already closed is a no-op.
 *
 * See: docs/modules/tasks.md
 */

import { TaskKind } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { announceInTransaction } from '@kernel/outbox';
import type { DomainEventMap, DomainEventMeta } from '@kernel/events';
import { systemCallerContext } from '@kernel/permissions';
import { fillPath, FRONTEND_LINK_RULES } from '@infrastructure/http/frontend-link';
import { tasksAuditActions } from '../audit';
import {
    accountReviewOpening,
    clear,
    exportFailedOpening,
    openKeyOf,
    type SystemOpening
} from '../domain';
import { TASK_OPENED } from '../events';
import { taskRepository } from '../repository';

/**
 * Open one task for a situation, or stamp the open one seen again. Announces `task.opened`
 * (through the transactional outbox) only on an insert: a repeat tells nobody twice.
 *
 * @param opening - the situation
 * @param meta - the event's delivery facts; its `eventId` makes a redelivery a no-op
 */
export const openSystemTask = (opening: SystemOpening, meta: DomainEventMeta): Promise<void> => {
    const openKey = openKeyOf(opening.kind, opening.link);
    const now = new Date();
    const touch = () => taskRepository.touchOpen(openKey, meta.eventId, now).then(() => undefined);

    // The task and its `task.opened` row commit together: a crash or a failing listener cannot
    // lose the notice, the relay redelivers it. The duplicate-key catch wraps the WHOLE
    // transaction, so a lost race rolls back its row too and falls through to a touch.
    const open = () =>
        announceInTransaction(
            (session) =>
                taskRepository.insertSystem(
                    {
                        kind: opening.kind,
                        routeSet: opening.routeSet,
                        ...(opening.work ? { work: opening.work } : {}),
                        link: opening.link,
                        openKey,
                        ...(opening.subjectId ? { subjectId: opening.subjectId } : {}),
                        subject: opening.subject,
                        message: opening.message,
                        dueAt: opening.dueAt,
                        eventId: meta.eventId,
                        now
                    },
                    session
                ),
            (created) => ({
                name: TASK_OPENED,
                payload: {
                    tenantId: DEPLOYMENT_TENANT_ID,
                    taskId: String(created._id),
                    kind: created.kind,
                    routeSet: created.routeSet,
                    ...(created.work ? { work: created.work } : {})
                },
                aggregateId: String(created._id)
            })
        )
            .then((created) =>
                // After the commit: an audit line for a task that rolled back would be a lie.
                recordAudit(systemCallerContext('Task'), {
                    action: tasksAuditActions.SYSTEM_TASK_OPENED,
                    outcome: 'success',
                    targetType: 'task',
                    targetId: String(created._id),
                    metadata: { kind: created.kind }
                })
            )
            // Another event opened it first: this one only touches.
            .catch((error: unknown) => {
                if (!isDuplicateKey(error)) throw error;
                return touch();
            });

    const seen = meta.eventId ? taskRepository.sawEvent(meta.eventId) : Promise.resolve(false);
    return seen.then((replayed) => (replayed ? undefined : open()));
};

/**
 * Close the open system tasks a filter matches, as `cleared`. Each close is one conditional
 * write on the status read, so staff closing at the same moment wins and this one steps aside.
 *
 * @param filter - which open tasks the ending situation closes
 */
const clearMatching = (filter: Record<string, unknown>): Promise<void> => {
    const now = new Date();
    return taskRepository
        .findOpenSystem(filter)
        .then((open) =>
            Promise.all(
                open.map((task) =>
                    taskRepository
                        .moveFrom(String(task._id), task.status, clear(now))
                        .then((moved) => {
                            if (moved)
                                recordAudit(systemCallerContext('Task'), {
                                    action: tasksAuditActions.SYSTEM_TASK_CLEARED,
                                    outcome: 'success',
                                    targetType: 'task',
                                    targetId: String(moved._id),
                                    metadata: { kind: moved.kind }
                                });
                        })
                )
            )
        )
        .then(() => undefined);
};

/**
 * Close the open task of the given kinds on one record, as `cleared`. The door a module that owns
 * a situation's ending uses: no permission check, because the ending is a fact, not a request.
 *
 * @param kinds - the kinds the ending situation can have opened
 * @param link - the record
 * @param link.type - the record's type
 * @param link.id - the record's id
 */
export const clearSystemTasks = (
    kinds: readonly TaskKind[],
    link: { type: SystemOpening['link']['type']; id: string }
): Promise<void> => clearMatching({ openKey: { $in: kinds.map((kind) => openKeyOf(kind, link)) } });

/**
 * Log a handler's failure and let the outbox redeliver: a missed open is a lost task, so the
 * error propagates after it is logged.
 *
 * @param name - the event, for the log
 * @param work - the handler's work
 */
const guarded = (name: string, work: () => Promise<void>): Promise<void> =>
    work().catch((error: unknown) => {
        logger.error({ message: `tasks: could not handle ${name}`, error });
        throw error;
    });

/** The staff screen of an account: its page in the staff frontend. */
const userWork = (userId: string): string =>
    fillPath(FRONTEND_LINK_RULES.staffPages.user, { id: userId });

/** The event handlers `module.ts` subscribes; each is `(payload, meta)`. */
export const systemTasks = {
    /** `user.review_flagged`: an account to look at. */
    onReviewFlagged: (payload: DomainEventMap['user.review_flagged'], meta: DomainEventMeta) =>
        guarded('user.review_flagged', () =>
            openSystemTask(
                {
                    ...accountReviewOpening(payload.userId, new Date()),
                    work: userWork(payload.userId)
                },
                meta
            )
        ),

    /** `user.review_cleared`: staff acted on the flag. */
    onReviewCleared: (payload: DomainEventMap['user.review_cleared']) =>
        guarded('user.review_cleared', () =>
            clearSystemTasks([TaskKind.account_review], { type: 'user', id: payload.userId })
        ),

    /** `account.export_failed`: a person is owed their file. */
    onExportFailed: (payload: DomainEventMap['account.export_failed'], meta: DomainEventMeta) =>
        guarded('account.export_failed', () =>
            openSystemTask(
                { ...exportFailedOpening(payload, new Date()), work: userWork(payload.userId) },
                meta
            )
        ),

    /** `account.export_ready`: a later export is what closes an earlier failure. */
    onExportReady: (payload: DomainEventMap['account.export_ready']) =>
        guarded('account.export_ready', () =>
            clearMatching({
                kind: TaskKind.export_failed,
                subjectId: payload.userId
            })
        )
};
