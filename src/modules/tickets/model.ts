/**
 * @module
 * Ticket schema — one collection, a leaf in both directions (see `./module`).
 *
 * `respondedAt`/`createdAt`/`updatedAt` are overridden from the generated `Ticket` type
 * (string → Date): Mongoose holds native dates, and serialization is what narrows them back to
 * the wire's ISO strings.
 *
 * See: docs/modules/tickets.md
 */

import { model, Schema } from 'mongoose';
import type { Document, Model, Types } from 'mongoose';
import { TicketCategory, TicketStatus } from '@types';
import type { Ticket } from '@types';
import { applySerialization } from '@infrastructure/persistence/serialize';
import { ticketsConfig } from './config';

/**
 * How long a ticket survives, in days, before Mongo's TTL index removes it. Read at import time
 * because a TTL index is created once, at startup, from whatever value is configured then —
 * see the note on the index below. Default: 730 (24 months) — a contact request can be evidence
 * in a commercial dispute, and 24 months sits inside the common limitation periods.
 */
const retentionDays = ticketsConfig().NODE_TICKETS_RETENTION_DAYS;

/** Mongoose document type for tickets. Overrides the API-generated Ticket's
 * 'respondedAt'/'createdAt'/'updatedAt' (string vs Date) and 'subjectId' (string vs ObjectId). */
export interface TicketDocument
    extends Omit<Ticket, 'id' | 'subjectId' | 'respondedAt' | 'createdAt' | 'updatedAt'>, Document {
    subjectId?: Types.ObjectId;
    respondedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Mongoose model type for {@link TicketDocument}. */
export type TicketModel = Model<TicketDocument>;

/** Tickets collection schema. */
export const ticketSchema = new Schema<TicketDocument, TicketModel>(
    {
        name: {
            type: String
        },
        // The sender's account when they were signed in; absent for an anonymous sender. Export and
        // erasure follow it (see `./domain/ownership`).
        subjectId: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        },
        email: {
            type: String,
            required: true
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
        status: {
            type: String,
            enum: Object.values(TicketStatus),
            default: TicketStatus.new
        },
        adminNotes: {
            type: String
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
 * The admin list filters by status and sorts newest-first, which is exactly this key.
 */
ticketSchema.index({ status: 1, createdAt: -1 });

/*
 * The two branches of the data-subject query (`./domain/ownership`): an account's own id, and an
 * exact verified address. An `$or` is served by an index only when every branch has one. The
 * staff search on `email` is a case-insensitive unanchored regex that no B-tree serves; it scans
 * regardless, so these indexes are for the subject query alone.
 */
ticketSchema.index({ subjectId: 1 }, { partialFilterExpression: { subjectId: { $exists: true } } });
ticketSchema.index({ email: 1 });

/*
 * TTL index — Mongo deletes tickets older than the retention window on its own. Its OWN index,
 * not the compound one above: Mongo only honours `expireAfterSeconds` on a single-field
 * ASCENDING index, and `{ status: 1, createdAt: -1 }` is both compound and descending —
 * attaching the option there would produce an index that silently never deletes anything.
 *
 * Caveat worth knowing: Mongo will not modify an existing TTL index's `expireAfterSeconds` in
 * place. Raising or lowering `NODE_TICKETS_RETENTION_DAYS` and restarting FAILS THE BOOT —
 * `autoIndex` asks for the new window and Mongo refuses the conflicting options. `npm run db:sync`
 * is what applies it, by dropping the index and rebuilding it. See `audit-logs/model.ts` for the
 * identical caveat on that module's own TTL index.
 */
ticketSchema.index({ createdAt: 1 }, { expireAfterSeconds: retentionDays * 24 * 60 * 60 });

/**
 * Normalizes a serialized ticket: `_id` → `id`, drops `__v`.
 * Exported so lean results (which bypass `toJSON`) can be mapped through the
 * same logic — see `./service` `search()`.
 */
export const applyTicketTransform = applySerialization(ticketSchema);

/** Tickets model entrypoint. */
export const ticketModel = model<TicketDocument, TicketModel>('Ticket', ticketSchema);
