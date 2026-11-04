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
 * Persist an open system task about a failed data export, the kind routed to `UserErasure`.
 *
 * @param subjectId - the account the task is about, when it is about one
 * @returns the stored task
 */
export const createSystemTask = (subjectId?: string): Promise<TaskDocument> =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.export_failed,
        routeSet: 'UserErasure',
        subject: 'A data export failed',
        message: 'Export e1 needs a person.',
        work: 'users/u1',
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

/**
 * Every task in the test database, oldest first — what a test that reads storage past the doors sees.
 */
export const findAllTasks = (): Promise<TaskDocument[]> =>
    taskModel.find().sort({ createdAt: 1 }).exec();

/**
 * The tasks of one kind, read straight from storage.
 *
 * @param kind - the situation they were opened for
 */
export const findTasksOfKind = (kind: TaskKind): Promise<TaskDocument[]> =>
    taskModel.find({ kind }).exec();
