/**
 * @module
 * Task factories that touch the test database: a task a producer would have opened, written
 * past the domain rules a service enforces (so tests, and only tests, reach it).
 */

import { TaskKind, TaskLinkType, TaskResolution, TaskSource, TaskStatus } from '@types';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { TaskDocument } from '../model';
import { taskRepository } from '../repository';
import { taskModel } from '../model';
import { DAY_MS, HOUR_MS } from '@domain-primitives/time';

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
 * Persist an open system task pointing at a record, about one account.
 *
 * @param link - the record it points at
 * @param subjectId - the account the task is about
 * @returns the stored task
 */
export const createSystemTaskAbout = (
    link: { type: TaskLinkType; id: string },
    subjectId: string
): Promise<TaskDocument> =>
    taskRepository.create({
        source: TaskSource.system,
        kind: TaskKind.export_failed,
        routeSet: 'UserErasure',
        subject: 'A task about a record',
        message: 'A person must look.',
        link,
        subjectId: toObjectId(subjectId)
    });

/**
 * Push a task's deadline into the past, as if time had gone by.
 *
 * @param id - the task
 * @param hoursAgo - how long ago it fell due (negative: still ahead)
 */
export const backdateDue = (id: string, hoursAgo = 1): Promise<unknown> =>
    taskModel
        .updateOne({ _id: id }, { $set: { dueAt: new Date(Date.now() - hoursAgo * HOUR_MS) } })
        .exec();

/**
 * Give a task a life: opened `lifeDays` before its deadline, which falls `dueInDays` from now.
 *
 * @param id - the task
 * @param dueInDays - how far ahead the deadline is (negative: already past)
 * @param lifeDays - how long the task had to live when it opened
 */
export const giveLife = (id: string, dueInDays: number, lifeDays: number): Promise<unknown> => {
    const dueAt = Date.now() + dueInDays * DAY_MS;
    return taskModel
        .updateOne(
            { _id: id },
            { $set: { dueAt: new Date(dueAt), createdAt: new Date(dueAt - lifeDays * DAY_MS) } },
            // Mongoose: `createdAt` is immutable by default; this lets a test move it.
            // https://mongoosejs.com/docs/timestamps.html
            { overwriteImmutable: true }
        )
        .exec();
};

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
