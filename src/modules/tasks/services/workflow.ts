/**
 * @module
 * The doors that move a task: resolve, mark as spam, reopen, assign, unassign, add a note, and
 * the staff badge's counts. Every move is ONE conditional write filtered on the status the caller
 * read, so two clicks produce one 200 and one 409. The rules (which status may go where, which
 * stamps a move owes) are `./domain`; this file is the write path around them.
 *
 * See: docs/modules/tasks.md
 */

import { Types } from 'mongoose';
import type { CallerContext, Task, TaskSummary } from '@types';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { accessService } from '@modules/access';
import { userService } from '@modules/users';
import { tasksAuditActions } from '../audit';
import { inJurisdiction, jurisdictionScope, mayWork, roleMayWorkRouteSet } from '../access';
import {
    isOpen,
    markSpam,
    OPEN_STATUSES,
    reopen,
    resolve,
    type TaskFacts,
    type TaskRefusal,
    type Transition
} from '../domain';
import { TASK_ASSIGNED } from '../events';
import type { TaskDocument } from '../model';
import { presentTask } from '../presenter';
import { taskRepository } from '../repository';
import { assigneeNamesOf, viewerOf } from '../views';

/** The doors that change a task's status by the domain's rules. */
type Door = 'resolve' | 'markSpam' | 'reopen';

/** Each door's rule and the audit action it records. */
const DOORS: Record<
    Door,
    { rule: (facts: TaskFacts, now: Date) => Transition; audit: keyof typeof tasksAuditActions }
> = {
    resolve: { rule: (facts, now) => resolve(facts, now), audit: 'ADMIN_TASK_RESOLVED' },
    markSpam: { rule: (facts, now) => markSpam(facts, now), audit: 'ADMIN_TASK_MARKED_SPAM' },
    reopen: { rule: (facts) => reopen(facts), audit: 'ADMIN_TASK_REOPENED' }
};

/** The 409 code and message key of each refusal. */
const REFUSALS: Record<TaskRefusal, { code: ErrorCode; key: string }> = {
    already_resolved: {
        code: ERROR_CODES.TASK_ALREADY_RESOLVED,
        key: 'tasks.already-resolved'
    },
    already_spam: { code: ERROR_CODES.TASK_ALREADY_SPAM, key: 'tasks.already-spam' },
    already_open: { code: ERROR_CODES.TASK_ALREADY_OPEN, key: 'tasks.already-open' }
};

/** Whether an error is Mongo's duplicate-key refusal (E11000). */
const isDuplicateKey = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;

/** The 409 for assigning a task that is closed. */
const notOpen = (): ResponseReject =>
    generateReject(409, [{ code: ERROR_CODES.TASK_NOT_OPEN, message: t('tasks.not-open') }]);

/** The 404 a missing or out-of-jurisdiction task earns: it does not admit to existing. */
const notFound = (): ResponseReject => generateReject(404, [t('generic.error-item-gone')]);

/**
 * A task's facts, as the lifecycle rules read them.
 *
 * @param task - the stored task
 */
const factsOf = (task: TaskDocument): TaskFacts => ({
    status: task.status,
    closedAt: task.closedAt,
    respondedAt: task.respondedAt,
    assigned: task.assigneeId !== undefined,
    kind: task.kind,
    link: task.link ? { type: task.link.type, id: task.link.id } : undefined
});

/**
 * The task as the caller reads it now: assignee name and the caller's actions added.
 *
 * @param task - the stored task
 * @param context - the caller
 */
const present = (task: TaskDocument, context: CallerContext): Promise<Task> =>
    assigneeNamesOf([task.assigneeId]).then((names) =>
        presentTask(task, viewerOf(context.caller, names).of(task))
    );

/**
 * Load a task the caller may work, or the refusal that tells them why not. A task outside the
 * caller's jurisdiction is a 404; one inside it that they may not act on is a 403.
 *
 * @param id - the task
 * @param context - the caller
 */
const loadWorkable = (
    id: string,
    context: CallerContext
): Promise<{ task: TaskDocument } | { refusal: ResponseReject }> =>
    taskRepository.findById(id).then((task) => {
        if (!task || !inJurisdiction(context.caller, task)) return { refusal: notFound() };
        if (!mayWork(context.caller, task))
            return { refusal: generateReject(403, [t('generic.error-forbidden')]) };
        return { task };
    });

/**
 * The 409 for a reopen that collided with a newer open task on the same dedup key.
 *
 * @param task - the task being reopened
 */
const superseded = (task: TaskDocument): Promise<ResponseReject> =>
    taskRepository
        .findOpenByKey(`${task.kind}:${task.link?.type ?? ''}:${task.link?.id ?? ''}`)
        .then((newer) =>
            generateReject(409, [
                {
                    code: ERROR_CODES.TASK_SUPERSEDED,
                    message: t('tasks.superseded'),
                    ...(newer ? { details: { taskId: String(newer._id) } } : {})
                }
            ])
        );

/**
 * Apply one door. The write is conditional on the status that was read; losing the race re-reads
 * and either answers the 409 the new state earns or tries the door again from where the task now
 * stands.
 *
 * @param door - which door
 * @param id - the task
 * @param context - the caller
 * @param attempts - how many re-reads remain
 */
const move = (
    door: Door,
    id: string,
    context: CallerContext,
    attempts = 3
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        const { task } = loaded;
        const decision = DOORS[door].rule(factsOf(task), new Date());
        if ('refusal' in decision) {
            const { code, key } = REFUSALS[decision.refusal];
            return generateReject(409, [{ code, message: t(key) }]);
        }

        return taskRepository
            .moveFrom(id, task.status, decision.patch)
            .then((moved) => {
                if (!moved)
                    return attempts > 1
                        ? move(door, id, context, attempts - 1)
                        : generateReject(409, [
                              {
                                  code: ERROR_CODES.TASK_ALREADY_OPEN,
                                  message: t('tasks.already-open')
                              }
                          ]);

                recordAudit(context, {
                    action: tasksAuditActions[DOORS[door].audit],
                    outcome: 'success',
                    targetType: 'task',
                    targetId: id,
                    metadata: { from: task.status, to: moved.status }
                });
                return present(moved, context).then((wire) => generateSuccess(wire));
            })
            .catch((error: unknown) => {
                if (door === 'reopen' && isDuplicateKey(error)) return superseded(task);
                throw error;
            });
    });

/**
 * Whether a person may be given a task: they exist, are live, and hold the permission set that
 * works it.
 *
 * @param userId - the proposed assignee
 * @param routeSet - the task's route set
 */
const mayBeAssigned = (userId: string, routeSet: string): Promise<boolean> =>
    userService.getById(userId).then((user) => {
        if (!user || user.deletedAt) return false;
        return accessService
            .rolesOf(userId, DEPLOYMENT_TENANT_ID)
            .then(({ tenant }) => roleMayWorkRouteSet(tenant, routeSet));
    });

/**
 * Tell the bus a colleague was given a task. Taking your own does not: you know. The emit never
 * rejects (a failing subscriber is logged by the bus), so the assignment already made stands.
 *
 * @param task - the task as assigned
 * @param assigneeId - who now holds it
 * @param context - the caller who assigned it
 */
const announceAssigned = (
    task: TaskDocument,
    assigneeId: string,
    context: CallerContext
): Promise<void> =>
    assigneeId === context.caller.id
        ? Promise.resolve()
        : emitDomainEvent(TASK_ASSIGNED, {
              tenantId: DEPLOYMENT_TENANT_ID,
              taskId: String(task._id),
              kind: task.kind,
              routeSet: task.routeSet,
              assigneeId,
              assignedAt: new Date().toISOString()
          }).then(() => undefined);

/**
 * Give an open task to one person — taking it is assigning yourself. A `new` task becomes
 * `in_progress`.
 *
 * @param id - the task
 * @param userId - who gets it
 * @param context - the caller
 */
const assign = (
    id: string,
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        const { task } = loaded;
        if (!isOpen(task.status)) return notOpen();

        return mayBeAssigned(userId, task.routeSet).then((allowed) => {
            if (!allowed)
                return generateReject(422, [
                    {
                        code: ERROR_CODES.TASK_ASSIGNEE_INVALID,
                        message: t('tasks.assignee-invalid')
                    }
                ]);

            return taskRepository.assign(id, userId).then((assigned) => {
                if (!assigned) return notOpen();
                recordAudit(context, {
                    action: tasksAuditActions.ADMIN_TASK_ASSIGNED,
                    outcome: 'success',
                    targetType: 'task',
                    targetId: id,
                    metadata: { assigneeId: userId }
                });
                return announceAssigned(assigned, userId, context).then(() =>
                    present(assigned, context).then((wire) => generateSuccess(wire))
                );
            });
        });
    });

/**
 * Give a task back. An `in_progress` task goes back to `new`. Answers the task whether or
 * not anyone held it.
 *
 * @param id - the task
 * @param context - the caller
 */
const unassign = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        return taskRepository.unassign(id).then((released) => {
            if (!released) return notFound();
            recordAudit(context, {
                action: tasksAuditActions.ADMIN_TASK_UNASSIGNED,
                outcome: 'success',
                targetType: 'task',
                targetId: id
            });
            return present(released, context).then((wire) => generateSuccess(wire));
        });
    });

/**
 * Append a note to the staff thread. Allowed on a closed task too: what staff learn after a
 * close is still worth writing down.
 *
 * @param id - the task
 * @param body - the note
 * @param context - the caller, who becomes its author
 */
const addNote = (
    id: string,
    body: string,
    context: CallerContext
): Promise<ResponseSuccess<Task> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        // An API key has no account to name; its note carries no author.
        const callerId = context.caller.id;
        const authorId =
            callerId && Types.ObjectId.isValid(callerId) ? toObjectId(callerId) : undefined;
        return taskRepository
            .appendNote(id, {
                ...(authorId === undefined ? {} : { authorId }),
                body: body.trim(),
                at: new Date()
            })
            .then((noted) => {
                if (!noted) return notFound();
                recordAudit(context, {
                    action: tasksAuditActions.ADMIN_TASK_NOTED,
                    outcome: 'success',
                    targetType: 'task',
                    targetId: id
                });
                return present(noted, context).then((wire) => generateSuccess(wire));
            });
    });

/**
 * The staff badge: open, the caller's own, overdue and unassigned tasks, inside their
 * jurisdiction. Four counts on the indexes of the queue.
 *
 * @param context - the caller
 */
const summary = (context: CallerContext): Promise<TaskSummary> => {
    const { caller } = context;
    const open = { $and: [jurisdictionScope(caller), { status: { $in: OPEN_STATUSES } }] };
    const mine =
        caller.id === null
            ? Promise.resolve(0)
            : taskRepository.count({
                  $and: [...open.$and, { assigneeId: toObjectId(caller.id) }]
              });

    return Promise.all([
        taskRepository.count(open),
        mine,
        taskRepository.count({ $and: [...open.$and, { dueAt: { $lt: new Date() } }] }),
        taskRepository.count({ $and: [...open.$and, { assigneeId: { $exists: false } }] })
    ]).then(([openCount, mineCount, overdue, unassigned]) => ({
        open: openCount,
        mine: mineCount,
        overdue,
        unassigned
    }));
};

/** The doors, for `taskService`. */
export const workflow = {
    resolve: (id: string, context: CallerContext) => move('resolve', id, context),
    markSpam: (id: string, context: CallerContext) => move('markSpam', id, context),
    reopen: (id: string, context: CallerContext) => move('reopen', id, context),
    assign,
    unassign,
    addNote,
    summary
};
