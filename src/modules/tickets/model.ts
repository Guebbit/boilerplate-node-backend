/**
 * @module
 * Ticket schema — one collection: a visitor's message or a situation the system opened.
 *
 * The dates are overridden from the generated `Ticket` type (string → Date): Mongoose holds native dates, and serialization is what narrows them back to
 * the wire's ISO strings.
 *
 * See: docs/modules/tickets.md
 */

import { model, Schema, Types } from 'mongoose';
import type { Document, Model } from 'mongoose';
import {
    TicketCategory,
    TicketKind,
    TicketLinkType,
    TicketResolution,
    TicketSource,
    TicketStatus
} from '@types';
import type { Ticket } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { ticketsConfig } from './config';
import { routeSetOf } from './domain';

/**
 * How long a CLOSED ticket survives, in days, before Mongo's TTL index removes it. Read at import time
 * because a TTL index is created once, at startup, from whatever value is configured then —
 * see the note on the index below. Default: 730 (24 months) — a contact request can be evidence
 * in a commercial dispute, and 24 months sits inside the common limitation periods.
 */
const retentionDays = ticketsConfig().NODE_TICKETS_RETENTION_DAYS;

/** One staff note: append-only, author and time. */
export interface TicketNoteDocument {
    authorId?: Types.ObjectId;
    body: string;
    at: Date;
}

/** Mongoose document type for tickets. Overrides the API-generated Ticket's dates (string vs Date),
 * its ObjectId references (string vs ObjectId) and the fields computed per caller or per read. */
export interface TicketDocument
    extends
        Omit<
            Ticket,
            | 'id'
            | 'subjectId'
            | 'assigneeId'
            | 'assigneeName'
            | 'notes'
            | 'overdue'
            | 'actions'
            | 'earlierTickets'
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
    notes: TicketNoteDocument[];
    /** Set only while a linked system ticket is open: the dedup key. */
    openKey?: string;
    dueAt?: Date;
    lastSeenAt?: Date;
    closedAt?: Date;
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link TicketDocument}. */
export type TicketModel = Model<TicketDocument>;

/** Tickets collection schema. */
export const ticketSchema = new Schema<TicketDocument, TicketModel>(
    {
        // Who opened it: a visitor through the form, or the system for a situation.
        source: {
            type: String,
            enum: Object.values(TicketSource),
            default: TicketSource.visitor
        },
        kind: {
            type: String,
            enum: Object.values(TicketKind),
            default: TicketKind.contact
        },
        name: {
            type: String
        },
        // The sender's account when they were signed in; absent for an anonymous sender, and for a
        // system ticket the account the situation is about. Export and erasure follow it.
        subjectId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        // Required for a visitor ticket by the service, not by the schema: a system ticket has none.
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
            enum: Object.values(TicketCategory)
        },
        orderNumber: {
            type: String
        },
        // The record a system ticket is about.
        link: {
            type: new Schema(
                {
                    type: { type: String, enum: Object.values(TicketLinkType), required: true },
                    id: { type: String, required: true }
                },
                { _id: false }
            )
        },
        // The permission set that works it, frozen when it opens (`./domain/routing`).
        routeSet: {
            type: String,
            required: true,
            default: () => routeSetOf(TicketKind.contact)
        },
        openKey: {
            type: String
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
        lastSeenAt: {
            type: Date
        },
        seenCount: {
            type: Number,
            default: 1
        },
        status: {
            type: String,
            enum: Object.values(TicketStatus),
            default: TicketStatus.new
        },
        closedAt: {
            type: Date
        },
        resolution: {
            type: String,
            enum: Object.values(TicketResolution)
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
ticketSchema.index({ routeSet: 1, status: 1, dueAt: 1 });

/*
 * "Mine": one staff member's open work.
 */
ticketSchema.index(
    { assigneeId: 1, status: 1 },
    { partialFilterExpression: { assigneeId: { $exists: true } } }
);

/*
 * Two racing events open ONE ticket: the loser of this unique key gets E11000 and touches instead.
 * Partial, so tickets without an open key (visitor messages, closed tickets) are not constrained.
 */
ticketSchema.index(
    { openKey: 1 },
    { unique: true, partialFilterExpression: { openKey: { $exists: true } } }
);

/*
 * The two branches of the data-subject query (`./domain/ownership`): an account's own id, and an
 * exact verified address. An `$or` is served by an index only when every branch has one. The
 * staff search on `email` is a case-insensitive unanchored regex that no B-tree serves; it scans
 * regardless, so these indexes are for the subject query alone.
 */
ticketSchema.index({ subjectId: 1 }, { partialFilterExpression: { subjectId: { $exists: true } } });
ticketSchema.index({ email: 1 }, { partialFilterExpression: { email: { $exists: true } } });

/*
 * TTL index — Mongo deletes a CLOSED ticket once it has been closed for the retention window. On
 * `closedAt`, not `createdAt`: an open ticket is work owed and must never vanish, and a reopen
 * unsets `closedAt` so the clock stops. Its OWN single-field ascending index, because Mongo only
 * honours `expireAfterSeconds` there. A document without `closedAt` is never expired. Spam is
 * closed at birth, so it ages from creation.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` in
 * place. Raising or lowering `NODE_TICKETS_RETENTION_DAYS` and restarting FAILS THE BOOT —
 * `autoIndex` asks for the new window and Mongo refuses the conflicting options. `npm run db:sync`
 * is what applies it, by dropping the index and rebuilding it. See `audit-logs/model.ts` for the
 * identical caveat on that module's own TTL index.
 */
ticketSchema.index({ closedAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Normalizes a serialized ticket: `_id` → `id`, drops `__v`.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see `./service` `search()`.
 */
export const applyTicketTransform = applySerialization(ticketSchema, {
    omit: ['openKey'],
    after: (serialized) => {
        // References and dates leave as the strings the wire declares, not as ObjectId and Date.
        for (const [key, value] of Object.entries(serialized)) {
            if (value instanceof Date) serialized[key] = value.toISOString();
            else if (value instanceof Types.ObjectId) serialized[key] = String(value);
        }
        if (Array.isArray(serialized.notes))
            serialized.notes = serialized.notes.map((note: TicketNoteDocument) => ({
                ...(note.authorId ? { authorId: String(note.authorId) } : {}),
                body: note.body,
                at: note.at.toISOString()
            }));
    }
});

/** Tickets model entrypoint. */
export const ticketModel = model<TicketDocument, TicketModel>('Ticket', ticketSchema);
