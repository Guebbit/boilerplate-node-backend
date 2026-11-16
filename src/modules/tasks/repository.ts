/**
 * @module
 * Task repository — standard CRUD via the shared repository factory, plus the conditional moves
 * the doors need and the bulk writes the erasure needs. A move is ONE `findOneAndUpdate` filtered
 * on the status the caller read, so two clicks cannot both win.
 *
 * @see docs/modules/tasks.md#the-story
 */

import type { ClientSession } from 'mongoose';
import { taskModel, applyTaskTransform } from './model';
import type { TaskDocument, TaskNoteDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import { TaskCategory, TaskKind, TaskLinkType, TaskSource, TaskStatus } from '@types';
import { updateStatusIfIn as conditionalStatus } from '@infrastructure/persistence/conditional-status';
import type { StoredTask } from './presenter';
import { DUE_SOON_MS, OPEN_STATUSES, type OwnTasksFilter, type TaskPatch } from './domain';

/**
 * `status`, `category`, `kind` and `source` are deliberately absent from the filter spec: each is
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
    /** Clear the assignee; an `in_progress` task goes back to `new`. `null`: no such task, or nobody held it. */
    unassign: (id: string) => Promise<TaskDocument | null>;
    /** Append a note. `null`: no such task. */
    appendNote: (id: string, note: TaskNoteDocument) => Promise<TaskDocument | null>;
    /**
     * Claim ONE open task past its due date that was never reminded: stamp `overdueNotifiedAt`
     * and return it. One conditional write, so two sweeps cannot claim the same task. `null`:
     * nothing is left to claim.
     */
    claimOverdue: (now: Date, session?: ClientSession) => Promise<TaskDocument | null>;
    /**
     * Claim ONE open task due within `DUE_SOON_MS` that was never reminded and had longer than
     * that to live when it opened: stamp `dueSoonNotifiedAt` and return it. A contact message and
     * a task that opted out are never claimed, except a privacy request (a month's deadline).
     * `null`: nothing is left to claim.
     */
    claimDueSoon: (now: Date, session?: ClientSession) => Promise<TaskDocument | null>;
    /** Whether a system event already opened or touched a task (a redelivery). */
    sawEvent: (eventId: string) => Promise<boolean>;
    /** Insert a system task. Rejects with a duplicate-key error when its dedup key is open. */
    insertSystem: (opening: NewSystemTask, session?: ClientSession) => Promise<TaskDocument>;
    /** A repeat of an open situation: stamp it seen once more. `false`: nothing open matched. */
    touchOpen: (openKey: string, eventId: string | undefined, now: Date) => Promise<boolean>;
    /** The open system tasks matching a filter, to be cleared one by one. */
    findOpenSystem: (filter: Record<string, unknown>) => Promise<TaskDocument[]>;
    /** The open task currently holding a dedup key. */
    findOpenByKey: (openKey: string) => Promise<TaskDocument | null>;
    /** Delete a person's visitor tasks, inside the erasure's transaction. Resolves to their ids. */
    deleteOwned: (filter: OwnTasksFilter, session: ClientSession) => Promise<string[]>;
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
    noDueSoon?: true | undefined;
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
        /**
         * Mongoose: findOneAndUpdate with `returnDocument: 'after'` returns the document AFTER it.
         * https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
         */
        taskModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: from },
                {
                    $set: patch.set,
                    ...(patch.unset.length > 0
                        ? { $unset: Object.fromEntries(patch.unset.map((key) => [key, 1])) }
                        : {})
                },
                { returnDocument: 'after' }
            )
            .exec(),

    assign: (id, userId, session) =>
        conditionalStatus(
            taskModel,
            { _id: toObjectId(id) },
            [TaskStatus.new],
            TaskStatus.in_progress,
            { set: { assigneeId: toObjectId(userId) }, session }
        ).then(
            (moved) =>
                moved ??
                taskModel
                    .findOneAndUpdate(
                        { _id: toObjectId(id), status: TaskStatus.in_progress },
                        { $set: { assigneeId: toObjectId(userId) } },
                        { returnDocument: 'after', session }
                    )
                    .exec()
        ),

    unassign: (id) =>
        taskModel
            .updateOne(
                {
                    _id: toObjectId(id),
                    status: TaskStatus.in_progress,
                    assigneeId: { $exists: true }
                },
                { $set: { status: TaskStatus.new } }
            )
            .exec()
            .then(() =>
                taskModel
                    .findOneAndUpdate(
                        { _id: toObjectId(id), assigneeId: { $exists: true } },
                        { $unset: { assigneeId: 1 } },
                        { returnDocument: 'after' }
                    )
                    .exec()
            ),

    appendNote: (id, note) =>
        taskModel
            .findOneAndUpdate(
                { _id: toObjectId(id) },
                { $push: { notes: note } },
                { returnDocument: 'after' }
            )
            .exec(),

    claimOverdue: (now, session) =>
        /**
         * Mongoose: findOneAndUpdate with `returnDocument: 'after'` returns the document AFTER it.
         * The filter and the stamp are one atomic step.
         * https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
         */
        taskModel
            .findOneAndUpdate(
                {
                    status: { $in: OPEN_STATUSES },
                    dueAt: { $lt: now },
                    overdueNotifiedAt: { $exists: false }
                },
                { $set: { overdueNotifiedAt: now } },
                /**
                 * Oldest deadline first: the claim (and outbox write) order. Delivery order across
                 * tasks is not promised: each task is its own aggregate.
                 */
                { returnDocument: 'after', sort: { dueAt: 1 }, session }
            )
            .exec(),

    claimDueSoon: (now, session) =>
        /**
         * Mongo: `$expr` compares two fields of the same document, here the task's whole life.
         * https://www.mongodb.com/docs/manual/reference/operator/query/expr/
         */
        taskModel
            .findOneAndUpdate(
                {
                    status: { $in: OPEN_STATUSES },
                    /**
                     * A contact message owes only a short SLA, so it is skipped; a privacy request
                     * owes a month, so it gets the warning.
                     */
                    $or: [{ kind: { $ne: TaskKind.contact } }, { category: TaskCategory.privacy }],
                    noDueSoon: { $exists: false },
                    dueAt: { $gt: now, $lte: new Date(now.getTime() + DUE_SOON_MS) },
                    $expr: { $gt: [{ $subtract: ['$dueAt', '$createdAt'] }, DUE_SOON_MS] },
                    dueSoonNotifiedAt: { $exists: false }
                },
                { $set: { dueSoonNotifiedAt: now } },
                // Nearest deadline first, as the overdue claim does.
                { returnDocument: 'after', sort: { dueAt: 1 }, session }
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
                ...(opening.noDueSoon ? { noDueSoon: true } : {}),
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
                    /**
                     * Mongo: `$push` with `$each` + `$slice: -N` keeps only the last N entries.
                     * https://www.mongodb.com/docs/manual/reference/operator/update/slice/
                     */
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
        /**
         * Mongoose: Model.deleteMany(filter, { session }) joins the caller's transaction.
         * https://mongoosejs.com/docs/api/model.html#Model.deleteMany()
         * Ids first, in the same transaction: `deleteMany` reports only a count.
         */
        taskModel
            .find(filter)
            .select('_id')
            .session(session)
            .lean()
            .exec()
            .then((rows) => rows.map(({ _id }) => String(_id)))
            .then((ids) =>
                taskModel
                    .deleteMany({ _id: { $in: ids } }, { session })
                    .exec()
                    .then(() => ids)
            ),

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
                /**
                 * Mongoose: `arrayFilters` addresses every matching element of `notes`.
                 * https://mongoosejs.com/docs/tutorials/findoneandupdate.html#arrayfilters
                 */
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
