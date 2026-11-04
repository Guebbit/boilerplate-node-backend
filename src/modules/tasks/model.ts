/**
 * @module
 * Task schema — one collection: a visitor's message or a situation the system opened.
 *
 * The dates are overridden from the generated `Task` type (string → Date): Mongoose holds native dates, and serialization is what narrows them back to
 * the wire's ISO strings.
 *
 * See: docs/modules/tasks.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import {
    TaskCategory,
    TaskKind,
    TaskLinkType,
    TaskResolution,
    TaskSource,
    TaskStatus
} from '@types';
import type { Task } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { tasksConfig } from './config';
import { CONTACT_ROUTE_SET } from './domain';

/**
 * How long a CLOSED task survives, in days, before Mongo's TTL index removes it. Read at import time
 * because a TTL index is created once, at startup, from whatever value is configured then —
 * see the note on the index below. Default: 730 (24 months) — a contact request can be evidence
 * in a commercial dispute, and 24 months sits inside the common limitation periods.
 */
const retentionDays = tasksConfig().NODE_TASKS_RETENTION_DAYS;

/** One staff note: append-only, author and time. */
export interface TaskNoteDocument {
    authorId?: Types.ObjectId;
    body: string;
    at: Date;
}

/** Mongoose document type for tasks. Overrides the API-generated Task's dates (string vs Date),
 * its ObjectId references (string vs ObjectId) and the fields computed per caller or per read. */
export interface TaskDocument
    extends
        Omit<
            Task,
            | 'id'
            | 'subjectId'
            | 'assigneeId'
            | 'assigneeName'
            | 'notes'
            | 'overdue'
            | 'actions'
            | 'earlierTasks'
            | 'dueAt'
            | 'lastSeenAt'
            | 'closedAt'
            | 'respondedAt'
            | 'createdAt'
            | 'updatedAt'
        >,
        Document {
    subjectId?: Types.ObjectId;
    assigneeId?: Types.ObjectId;
    notes: TaskNoteDocument[];
    /** Set only while a linked system task is open: the dedup key. */
    openKey?: string;
    /**
     * The staff screen the opener says does this work, as an opaque path under the staff
     * frontend's locale (`orders/<id>`). Frozen beside `routeSet`, never on the Task API.
     */
    work?: string;
    /** The last system events that opened or touched it: what makes a redelivered event a no-op. */
    eventIds?: string[];
    dueAt?: Date;
    /** When the one overdue reminder was claimed; absent until then, and never written twice. */
    overdueNotifiedAt?: Date;
    lastSeenAt?: Date;
    closedAt?: Date;
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link TaskDocument}. */
export type TaskModel = Model<TaskDocument>;

/** Tasks collection schema. */
export const taskSchema = new Schema<TaskDocument, TaskModel>(
    {
        // Who opened it: a visitor through the form, or the system for a situation.
        source: {
            type: String,
            enum: Object.values(TaskSource),
            default: TaskSource.visitor
        },
        kind: {
            type: String,
            enum: Object.values(TaskKind),
            default: TaskKind.contact
        },
        name: {
            type: String
        },
        // The sender's account when they were signed in; absent for an anonymous sender, and for a
        // system task the account the situation is about. Export and erasure follow it.
        subjectId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        // Required for a visitor task by the service, not by the schema: a system task has none.
        email: {
            type: String
        },
        subject: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        category: {
            type: String,
            enum: Object.values(TaskCategory)
        },
        orderNumber: {
            type: String
        },
        // The record a system task is about.
        link: {
            type: new Schema(
                {
                    type: { type: String, enum: Object.values(TaskLinkType), required: true },
                    id: { type: String, required: true }
                },
                { _id: false }
            )
        },
        // The permission set that works it, frozen when it opens (`./domain/routing`).
        routeSet: {
            type: String,
            required: true,
            default: () => CONTACT_ROUTE_SET
        },
        // The staff screen that does the work: handed over by the opener, frozen with the set.
        work: {
            type: String
        },
        openKey: {
            type: String
        },
        eventIds: {
            type: [String],
            default: undefined
        },
        assigneeId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        notes: {
            type: [
                new Schema(
                    {
                        authorId: { type: Schema.Types.ObjectId, ref: 'User' },
                        body: { type: String, required: true },
                        at: { type: Date, required: true }
                    },
                    { _id: false }
                )
            ],
            default: []
        },
        dueAt: {
            type: Date
        },
        // Stamped by the overdue sweep in the same write that claims the task: the stamp IS
        // the "already reminded" memory. Internal, not on the wire.
        overdueNotifiedAt: {
            type: Date
        },
        lastSeenAt: {
            type: Date
        },
        seenCount: {
            type: Number,
            default: 1
        },
        status: {
            type: String,
            enum: Object.values(TaskStatus),
            default: TaskStatus.new
        },
        closedAt: {
            type: Date
        },
        resolution: {
            type: String,
            enum: Object.values(TaskResolution)
        },
        respondedAt: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

/*
 * The jurisdiction queue: a route set's open work, soonest due first.
 */
taskSchema.index({ routeSet: 1, status: 1, dueAt: 1 });

/*
 * "Mine": one staff member's open work.
 */
taskSchema.index(
    { assigneeId: 1, status: 1 },
    { partialFilterExpression: { assigneeId: { $exists: true } } }
);

/*
 * Two racing events open ONE task: the loser of this unique key gets E11000 and touches instead.
 * Partial, so tasks without an open key (visitor messages, closed tasks) are not constrained.
 */
taskSchema.index(
    { openKey: 1 },
    { unique: true, partialFilterExpression: { openKey: { $exists: true } } }
);

/*
 * "Have I seen this event?" - asked before every system open, so a redelivery after the task
 * closed cannot open a second one. Partial: visitor tasks carry none.
 */
taskSchema.index({ eventIds: 1 }, { partialFilterExpression: { eventIds: { $exists: true } } });

/*
 * The two branches of the data-subject query (`./domain/ownership`): an account's own id, and an
 * exact verified address. An `$or` is served by an index only when every branch has one. The
 * staff search on `email` is a case-insensitive unanchored regex that no B-tree serves; it scans
 * regardless, so these indexes are for the subject query alone.
 */
taskSchema.index({ subjectId: 1 }, { partialFilterExpression: { subjectId: { $exists: true } } });
taskSchema.index({ email: 1 }, { partialFilterExpression: { email: { $exists: true } } });

/*
 * TTL index — Mongo deletes a CLOSED task once it has been closed for the retention window. On
 * `closedAt`, not `createdAt`: an open task is work owed and must never vanish, and a reopen
 * unsets `closedAt` so the clock stops. Its OWN single-field ascending index, because Mongo only
 * honours `expireAfterSeconds` there. A document without `closedAt` is never expired. Spam is
 * closed at birth, so it ages from creation.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` in
 * place. Raising or lowering `NODE_TASKS_RETENTION_DAYS` and restarting FAILS THE BOOT —
 * `autoIndex` asks for the new window and Mongo refuses the conflicting options. `npm run db:sync`
 * is what applies it, by dropping the index and rebuilding it. See `audit-logs/model.ts` for the
 * identical caveat on that module's own TTL index.
 */
taskSchema.index({ closedAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Normalizes a serialized task: `_id` → `id`, drops `__v`.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see `./service` `search()`.
 */
export const applyTaskTransform = applySerialization(taskSchema, {
    omit: ['openKey', 'eventIds', 'overdueNotifiedAt', 'work'],
    after: (serialized) => {
        // References and dates leave as the strings the wire declares, not as ObjectId and Date.
        for (const [key, value] of Object.entries(serialized)) {
            if (value instanceof Date) serialized[key] = value.toISOString();
            else if (value instanceof Types.ObjectId) serialized[key] = String(value);
        }
        if (Array.isArray(serialized.notes))
            serialized.notes = serialized.notes.map((note: TaskNoteDocument) => ({
                ...(note.authorId ? { authorId: String(note.authorId) } : {}),
                body: note.body,
                at: note.at.toISOString()
            }));
    }
});

/** Tasks model entrypoint. */
export const taskModel = model<TaskDocument, TaskModel>('Task', taskSchema);
