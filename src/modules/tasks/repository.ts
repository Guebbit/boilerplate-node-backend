/**
 * @module
 * Task repository — standard CRUD via the shared repository factory, plus the conditional moves
 * the doors need and the bulk writes the erasure needs. A move is ONE `findOneAndUpdate` filtered
 * on the status the caller read, so two clicks cannot both win.
 *
 * See: docs/modules/tasks.md
 */

import type { ClientSession } from 'mongoose';
import { taskModel, applyTaskTransform } from './model';
import type { TaskDocument, TaskNoteDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import { TaskKind, TaskLinkType, TaskSource, TaskStatus } from '@types';
import type { StoredTask } from './presenter';
import { OPEN_STATUSES, type OwnTasksFilter, type TaskPatch } from './domain';

/**
 * `status`, `category`, `kind` and `source` are deliberately absent from the search spec: each is
 * a closed enum, and mapping a raw string onto it is a domain decision the service makes before
 * handing the result down as a scope.
 */
const base = createRepository<TaskDocument, StoredTask>(taskModel, {
    transform: applyTaskTransform,
    searchable: {
        objectIds: { id: '_id' },
        regex: { email: 'email' },
        text: ['name', 'email', 'subject', 'message'],
        sortable: {
            createdAt: 'createdAt',
            dueAt: 'dueAt',
            status: 'status',
            email: 'email'
        }
    }
});

/** What the repository adds to the standard factory. */
export interface TaskRepository extends Repository<TaskDocument, StoredTask> {
    /** Apply a transition's patch, only if the task is still in `from`. `null`: it moved first. */
    moveFrom: (id: string, from: TaskStatus, patch: TaskPatch) => Promise<TaskDocument | null>;
    /** Give an open task to someone; a `new` one becomes `in_progress`. `null`: not open. */
    assign: (id: string, userId: string, session?: ClientSession) => Promise<TaskDocument | null>;
    /** Clear the assignee; an `in_progress` task goes back to `new`. `null`: no such task. */
    unassign: (id: string) => Promise<TaskDocument | null>;
    /** Append a note. `null`: no such task. */
    appendNote: (id: string, note: TaskNoteDocument) => Promise<TaskDocument | null>;
    /**
     * Claim ONE open task past its due date that was never reminded: stamp `overdueNotifiedAt`
     * and return it. One conditional write, so two sweeps cannot claim the same task. `null`:
     * nothing is left to claim.
     */
    claimOverdue: (now: Date, session?: ClientSession) => Promise<TaskDocument | null>;
    /** Whether a system event already opened or touched a task (a redelivery). */
    sawEvent: (eventId: string) => Promise<boolean>;
    /** Insert a system task. Rejects with a duplicate-key error when its dedup key is open. */
    insertSystem: (opening: NewSystemTask, session?: ClientSession) => Promise<TaskDocument>;
    /** A repeat of an open situation: stamp it seen once more. `null`: not open any more. */
    touchOpen: (openKey: string, eventId: string | undefined, now: Date) => Promise<boolean>;
    /** The open system tasks matching a filter, to be cleared one by one. */
    findOpenSystem: (filter: Record<string, unknown>) => Promise<TaskDocument[]>;
    /** The open task currently holding a dedup key. */
    findOpenByKey: (openKey: string) => Promise<TaskDocument | null>;
    /** Delete a person's visitor tasks, inside the erasure's transaction. */
    deleteOwned: (filter: OwnTasksFilter, session: ClientSession) => Promise<number>;
    /** Delete the system tasks whose subject is a record that goes with the person. */
    deleteSystemAbout: (userId: string, session: ClientSession) => Promise<number>;
    /** Detach the person from the system tasks that outlive them. */
    detachSubject: (userId: string, session: ClientSession) => Promise<void>;
    /** Remove an erased member of staff from every task they assigned or wrote on. */
    forgetStaff: (userId: string, session: ClientSession) => Promise<void>;
}

/** What a system task is born with. */
export interface NewSystemTask {
    kind: TaskKind;
    routeSet: string;
    /** The staff screen that does the work, handed over by the opener. */
    work?: string | undefined;
    link: { type: TaskLinkType; id: string };
    openKey: string;
    subjectId?: string;
    subject: string;
    message: string;
    dueAt: Date;
    eventId?: string | undefined;
    now: Date;
}

/** Most recent system events remembered per task. */
const REMEMBERED_EVENTS = 20;

/** Link types whose task goes with the person: the record IS the person's. */
const LINKS_THAT_GO_WITH_THE_PERSON = [TaskLinkType.user, TaskLinkType.export];

/** The standard repository, plus the moves and bulk writes above. */
export const taskRepository: TaskRepository = {
    ...base,

    moveFrom: (id, from, patch) =>
        // Mongoose: findOneAndUpdate with `new: true` returns the document AFTER the update.
        // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
        taskModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: from },
                {
                    $set: patch.set,
                    ...(patch.unset.length > 0
                        ? { $unset: Object.fromEntries(patch.unset.map((key) => [key, 1])) }
                        : {})
                },
                { new: true }
            )
            .exec(),

    assign: (id, userId, session) =>
        taskModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: TaskStatus.new },
                { $set: { assigneeId: toObjectId(userId), status: TaskStatus.in_progress } },
                { new: true, session }
            )
            .exec()
            .then(
                (moved) =>
                    moved ??
                    taskModel
                        .findOneAndUpdate(
                            { _id: toObjectId(id), status: TaskStatus.in_progress },
                            { $set: { assigneeId: toObjectId(userId) } },
                            { new: true, session }
                        )
                        .exec()
            ),

    unassign: (id) =>
        taskModel
            .updateOne(
                { _id: toObjectId(id), status: TaskStatus.in_progress },
                { $set: { status: TaskStatus.new } }
            )
            .exec()
            .then(() =>
                taskModel
                    .findOneAndUpdate(
                        { _id: toObjectId(id) },
                        { $unset: { assigneeId: 1 } },
                        { new: true }
                    )
                    .exec()
            ),

    appendNote: (id, note) =>
        taskModel
            .findOneAndUpdate({ _id: toObjectId(id) }, { $push: { notes: note } }, { new: true })
            .exec(),

    claimOverdue: (now, session) =>
        // Mongoose: findOneAndUpdate with `new: true` returns the document AFTER the update; the
        // filter and the stamp are one atomic step.
        // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
        taskModel
            .findOneAndUpdate(
                {
                    status: { $in: OPEN_STATUSES },
                    dueAt: { $lt: now },
                    overdueNotifiedAt: { $exists: false }
                },
                { $set: { overdueNotifiedAt: now } },
                // Oldest deadline first, so a backlog is told in the order it went late.
                { new: true, sort: { dueAt: 1 }, session }
            )
            .exec(),

    sawEvent: (eventId) =>
        taskModel
            .exists({ eventIds: eventId })
            .exec()
            .then((found) => found !== null),

    insertSystem: (opening, session) =>
        base.create(
            {
                source: TaskSource.system,
                kind: opening.kind,
                routeSet: opening.routeSet,
                ...(opening.work ? { work: opening.work } : {}),
                link: opening.link,
                openKey: opening.openKey,
                ...(opening.subjectId ? { subjectId: toObjectId(opening.subjectId) } : {}),
                subject: opening.subject,
                message: opening.message,
                dueAt: opening.dueAt,
                lastSeenAt: opening.now,
                ...(opening.eventId ? { eventIds: [opening.eventId] } : {})
            },
            session
        ),

    touchOpen: (openKey, eventId, now) =>
        taskModel
            .updateOne(
                { openKey, ...(eventId ? { eventIds: { $ne: eventId } } : {}) },
                {
                    $set: { lastSeenAt: now },
                    $inc: { seenCount: 1 },
                    // Mongo: `$push` with `$each` + `$slice: -N` keeps only the last N entries.
                    // https://www.mongodb.com/docs/manual/reference/operator/update/slice/
                    ...(eventId
                        ? { $push: { eventIds: { $each: [eventId], $slice: -REMEMBERED_EVENTS } } }
                        : {})
                }
            )
            .exec()
            .then(({ modifiedCount }) => modifiedCount > 0),

    findOpenSystem: (filter) =>
        taskModel.find({ source: TaskSource.system, openKey: { $exists: true }, ...filter }).exec(),

    findOpenByKey: (openKey) => taskModel.findOne({ openKey }).exec(),

    deleteOwned: (filter, session) =>
        // Mongoose: Model.deleteMany(filter, { session }) joins the caller's transaction.
        // https://mongoosejs.com/docs/api/model.html#Model.deleteMany()
        taskModel
            .deleteMany(filter, { session })
            .exec()
            .then(({ deletedCount }) => deletedCount),

    deleteSystemAbout: (userId, session) =>
        taskModel
            .deleteMany(
                {
                    source: TaskSource.system,
                    subjectId: toObjectId(userId),
                    'link.type': { $in: LINKS_THAT_GO_WITH_THE_PERSON }
                },
                { session }
            )
            .exec()
            .then(({ deletedCount }) => deletedCount),

    detachSubject: (userId, session) =>
        taskModel
            .updateMany(
                { source: TaskSource.system, subjectId: toObjectId(userId) },
                { $unset: { subjectId: 1 } },
                { session }
            )
            .exec()
            .then(() => undefined),

    forgetStaff: (userId, session) =>
        taskModel
            .updateMany(
                { assigneeId: toObjectId(userId) },
                { $unset: { assigneeId: 1 } },
                { session }
            )
            .exec()
            .then(() =>
                // Mongoose: `arrayFilters` addresses every matching element of `notes`.
                // https://mongoosejs.com/docs/tutorials/findoneandupdate.html#arrayfilters
                taskModel
                    .updateMany(
                        { 'notes.authorId': toObjectId(userId) },
                        { $unset: { 'notes.$[note].authorId': 1 } },
                        { session, arrayFilters: [{ 'note.authorId': toObjectId(userId) }] }
                    )
                    .exec()
            )
            .then(() => undefined)
};
