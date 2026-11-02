/**
 * @module
 * Task factories that touch the test database: a task a producer would have opened, written
 * past the domain rules a service enforces (so tests, and only tests, reach it).
 */

import { TaskKind, TaskResolution, TaskSource, TaskStatus } from '@types';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';
import { taskModel } from '../model';

/**
 * Persist an open system task about a refund owed by hand, the kind routed to
 * `PaymentRefunding`.
 *
 * @param subjectId - the account the task is about, when it is about one
 * @returns the stored task
 */
export const createRefundTask = (subjectId?: string): Promise<TaskDocument> =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.manual_refund_owed,
        routeSet: 'PaymentRefunding',
        subject: 'A refund is owed by hand',
        message: 'Refund r1 needs a person.',
        ...(subjectId === undefined ? {} : { subjectId: toObjectId(subjectId) })
    });

/**
 * Push a task's deadline into the past, as if time had gone by.
 *
 * @param id - the task
 * @param hoursAgo - how long ago it fell due (negative: still ahead)
 */
export const backdateDue = (id: string, hoursAgo = 1): Promise<unknown> =>
    taskModel
        .updateOne({ _id: id }, { $set: { dueAt: new Date(Date.now() - hoursAgo * 3_600_000) } })
        .exec();

/**
 * Close a task straight in storage, past the doors, as staff would have.
 *
 * @param id - the task
 */
export const closeDirectly = (id: string): Promise<unknown> =>
    taskModel
        .updateOne(
            { _id: id },
            { $set: { status: TaskStatus.resolved, resolution: TaskResolution.staff } }
        )
        .exec();
