/**
 * @module
 * Tasks the system opens and closes, whoever owns the situation. A producer's event opens (or
 * touches) one task per situation; the event that ends the situation closes it as `cleared`. Both
 * halves are idempotent: a redelivered event (same `eventId`) changes nothing, two racing events
 * open one task (the unique `openKey`), and a clearing event on a task staff already closed is a
 * no-op.
 *
 * @see docs/modules/tasks.md#system-tasks
 */

import { TaskKind } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { recordAudit } from '@infrastructure/observability/audit';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import type { ClientSession } from 'mongoose';
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
import { TASK_OPENED, taskFactOf } from '../events';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';

/** What `openSystemTask` can be told beyond the situation itself. */
export interface OpenSystemTaskOptions {
    /**
     * The open task of the same situation may be out of date: when its message differs from the
     * new one, close it as `cleared` (this note left on it) and open the new one in the same
     * transaction; when the message is the same, it is only touched, as without the option. It runs
     * after the redelivery check, so a redelivered event can never close the task its first
     * delivery opened.
     */
    replaceOpen?: { note: string };
}

/**
 * Close one open task as `cleared`, leaving the note on it. One conditional write on the status
 * read, so staff closing at the same moment wins and this one steps aside.
 *
 * @param task - the open task, as read
 * @param now - the clock
 * @param note - a system note (no author) naming how it ended
 * @param session - the open transaction, when the close is part of one
 * @returns the closed task, or `null` when it moved first
 */
const closeSystemTask = (
    task: TaskDocument,
    now: Date,
    note?: string,
    session?: ClientSession
): Promise<TaskDocument | null> =>
    taskRepository
        .moveFrom(String(task._id), task.status, clear(now), session)
        .then((moved) =>
            moved && note !== undefined
                ? taskRepository
                      .appendNote(String(moved._id), { body: note, at: now }, session)
                      .then(() => moved)
                : moved
        );

/**
 * The audit line of a system close; written after the close commits.
 *
 * @param task - the task that was closed
 */
const auditCleared = (task: TaskDocument): void =>
    recordAudit(systemCallerContext('Task'), {
        action: tasksAuditActions.SYSTEM_TASK_CLEARED,
        outcome: 'success',
        targetType: 'task',
        targetId: String(task._id),
        metadata: { kind: task.kind }
    });

/**
 * Close the open task holding a key, inside the open transaction. Nothing open, or a task staff
 * moved first, closes nothing.
 *
 * @param openKey - the situation's dedup key
 * @param note - how it ended, left on the task as a system note
 * @param session - the open transaction
 * @returns the closed task, to be audited once the transaction commits
 */
const clearOpenByKey = (
    openKey: string,
    note: string,
    session: ClientSession
): Promise<TaskDocument | null> =>
    taskRepository
        .findOpenByKey(openKey, session)
        .then((task) => (task ? closeSystemTask(task, new Date(), note, session) : null));

/**
 * Open one task for a situation, or stamp the open one seen again. Announces `task.opened`
 * (through the transactional outbox) only on an insert: a repeat tells nobody twice. With
 * `replaceOpen`, an open task whose message differs is closed and replaced instead.
 *
 * @param opening - the situation
 * @param meta - the event's delivery facts; its `eventId` makes a redelivery a no-op
 * @param options - see {@link OpenSystemTaskOptions}
 */
export const openSystemTask = (
    opening: SystemOpening,
    meta: DomainEventMeta,
    options: OpenSystemTaskOptions = {}
): Promise<void> => {
    const openKey = openKeyOf(opening.kind, opening.link);
    const now = new Date();
    const touch = () => taskRepository.touchOpen(openKey, meta.eventId, now).then(() => undefined);

    /**
     * The task and its `task.opened` row commit together: a crash or a failing listener cannot
     * lose the notice, the relay redelivers it. The duplicate-key catch wraps the WHOLE
     * transaction, so a lost race rolls back its row too and falls through to a touch.
     */
    const open = () =>
        announceInTransaction(
            (session) =>
                (options.replaceOpen
                    ? clearOpenByKey(openKey, options.replaceOpen.note, session)
                    : Promise.resolve(null)
                ).then((cleared) =>
                    taskRepository
                        .insertSystem(
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
                                ...(opening.noDueSoon ? { noDueSoon: opening.noDueSoon } : {}),
                                eventId: meta.eventId,
                                now
                            },
                            session
                        )
                        .then((created) => ({ created, cleared }))
                ),
            ({ created }) => ({
                name: TASK_OPENED,
                payload: taskFactOf(created),
                aggregateId: String(created._id)
            })
        )
            .then(({ created, cleared }) =>
                // After the commit: an audit line for a task that rolled back would be a lie.
                {
                    if (cleared) auditCleared(cleared);
                    recordAudit(systemCallerContext('Task'), {
                        action: tasksAuditActions.SYSTEM_TASK_OPENED,
                        outcome: 'success',
                        targetType: 'task',
                        targetId: String(created._id),
                        metadata: { kind: created.kind }
                    });
                }
            )
            // Another event opened it first: this one only touches.
            .catch((error: unknown) => {
                if (!isDuplicateKey(error)) throw error;
                return touch();
            });

    const seen = meta.eventId ? taskRepository.sawEvent(meta.eventId) : Promise.resolve(false);
    return seen.then((replayed) => {
        if (replayed) return undefined;
        if (!options.replaceOpen) return open();
        // The same words again: nothing changed, so staff keep their task (and its assignee).
        return taskRepository
            .findOpenByKey(openKey)
            .then((current) => (current?.message === opening.message ? touch() : open()));
    });
};

/**
 * Close the open system tasks a filter matches, as `cleared`. Each close is one conditional
 * write on the status read, so staff closing at the same moment wins and this one steps aside.
 *
 * @param filter - which open tasks the ending situation closes
 * @param note - a system note (no author) left on each task it closes, naming how it ended
 */
const clearMatching = (filter: Record<string, unknown>, note?: string): Promise<void> => {
    const now = new Date();
    return taskRepository
        .findOpenSystem(filter)
        .then((open) =>
            Promise.all(
                open.map((task) =>
                    closeSystemTask(task, now, note).then((moved) => {
                        if (moved) auditCleared(moved);
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
 * @param note - how the situation ended, left as a system note on each task closed
 */
export const clearSystemTasks = (
    kinds: readonly TaskKind[],
    link: { type: SystemOpening['link']['type']; id: string },
    note?: string
): Promise<void> =>
    clearMatching({ openKey: { $in: kinds.map((kind) => openKeyOf(kind, link)) } }, note);

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

/** The event handlers `module.ts` subscribes; each takes `(payload)`, plus `meta` if it opens one. */
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
