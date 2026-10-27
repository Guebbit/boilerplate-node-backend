/**
 * @module
 * Ticket repository — standard CRUD via the shared repository factory, plus the conditional moves
 * the doors need and the bulk writes the erasure needs. A move is ONE `findOneAndUpdate` filtered
 * on the status the caller read, so two clicks cannot both win.
 *
 * See: docs/modules/tickets.md
 */

import type { ClientSession } from 'mongoose';
import { ticketModel, applyTicketTransform } from './model';
import type { TicketDocument, TicketNoteDocument } from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import { TicketKind, TicketLinkType, TicketSource, TicketStatus } from '@types';
import type { StoredTicket } from './presenter';
import type { OwnTicketsFilter, TicketPatch } from './domain';

/**
 * `status`, `category`, `kind` and `source` are deliberately absent from the search spec: each is
 * a closed enum, and mapping a raw string onto it is a domain decision the service makes before
 * handing the result down as a scope.
 */
const base = createRepository<TicketDocument, StoredTicket>(ticketModel, {
    transform: applyTicketTransform,
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
export interface TicketRepository extends Repository<TicketDocument, StoredTicket> {
    /** Apply a transition's patch, only if the ticket is still in `from`. `null`: it moved first. */
    moveFrom: (
        id: string,
        from: TicketStatus,
        patch: TicketPatch
    ) => Promise<TicketDocument | null>;
    /** Give an open ticket to someone; a `new` one becomes `in_progress`. `null`: not open. */
    assign: (id: string, userId: string) => Promise<TicketDocument | null>;
    /** Clear the assignee; an `in_progress` ticket goes back to `new`. `null`: no such ticket. */
    unassign: (id: string) => Promise<TicketDocument | null>;
    /** Append a note. `null`: no such ticket. */
    appendNote: (id: string, note: TicketNoteDocument) => Promise<TicketDocument | null>;
    /** Whether a system event already opened or touched a ticket (a redelivery). */
    sawEvent: (eventId: string) => Promise<boolean>;
    /** Insert a system ticket. Rejects with a duplicate-key error when its dedup key is open. */
    insertSystem: (opening: NewSystemTicket) => Promise<TicketDocument>;
    /** A repeat of an open situation: stamp it seen once more. `null`: not open any more. */
    touchOpen: (openKey: string, eventId: string | undefined, now: Date) => Promise<boolean>;
    /** The open system tickets matching a filter, to be cleared one by one. */
    findOpenSystem: (filter: Record<string, unknown>) => Promise<TicketDocument[]>;
    /** The open ticket currently holding a dedup key. */
    findOpenByKey: (openKey: string) => Promise<TicketDocument | null>;
    /** Delete a person's visitor tickets, inside the erasure's transaction. */
    deleteOwned: (filter: OwnTicketsFilter, session: ClientSession) => Promise<number>;
    /** Delete the system tickets whose subject is a record that goes with the person. */
    deleteSystemAbout: (userId: string, session: ClientSession) => Promise<number>;
    /** Detach the person from the system tickets that outlive them. */
    detachSubject: (userId: string, session: ClientSession) => Promise<void>;
    /** Remove an erased member of staff from every ticket they assigned or wrote on. */
    forgetStaff: (userId: string, session: ClientSession) => Promise<void>;
}

/** What a system ticket is born with. */
export interface NewSystemTicket {
    kind: TicketKind;
    routeSet: string;
    link: { type: TicketLinkType; id: string };
    openKey: string;
    subjectId?: string;
    subject: string;
    message: string;
    dueAt: Date;
    eventId?: string | undefined;
    now: Date;
}

/** Most recent system events remembered per ticket. */
const REMEMBERED_EVENTS = 20;

/** Link types whose ticket goes with the person: the record IS the person's. */
const LINKS_THAT_GO_WITH_THE_PERSON = [TicketLinkType.user, TicketLinkType.export];

/** The standard repository, plus the moves and bulk writes above. */
export const ticketRepository: TicketRepository = {
    ...base,

    moveFrom: (id, from, patch) =>
        // Mongoose: findOneAndUpdate with `new: true` returns the document AFTER the update.
        // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
        ticketModel
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

    assign: (id, userId) =>
        ticketModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: TicketStatus.new },
                { $set: { assigneeId: toObjectId(userId), status: TicketStatus.in_progress } },
                { new: true }
            )
            .exec()
            .then(
                (moved) =>
                    moved ??
                    ticketModel
                        .findOneAndUpdate(
                            { _id: toObjectId(id), status: TicketStatus.in_progress },
                            { $set: { assigneeId: toObjectId(userId) } },
                            { new: true }
                        )
                        .exec()
            ),

    unassign: (id) =>
        ticketModel
            .updateOne(
                { _id: toObjectId(id), status: TicketStatus.in_progress },
                { $set: { status: TicketStatus.new } }
            )
            .exec()
            .then(() =>
                ticketModel
                    .findOneAndUpdate(
                        { _id: toObjectId(id) },
                        { $unset: { assigneeId: 1 } },
                        { new: true }
                    )
                    .exec()
            ),

    appendNote: (id, note) =>
        ticketModel
            .findOneAndUpdate({ _id: toObjectId(id) }, { $push: { notes: note } }, { new: true })
            .exec(),

    sawEvent: (eventId) =>
        ticketModel
            .exists({ eventIds: eventId })
            .exec()
            .then((found) => found !== null),

    insertSystem: (opening) =>
        base.create({
            source: TicketSource.system,
            kind: opening.kind,
            routeSet: opening.routeSet,
            link: opening.link,
            openKey: opening.openKey,
            ...(opening.subjectId ? { subjectId: toObjectId(opening.subjectId) } : {}),
            subject: opening.subject,
            message: opening.message,
            dueAt: opening.dueAt,
            lastSeenAt: opening.now,
            ...(opening.eventId ? { eventIds: [opening.eventId] } : {})
        }),

    touchOpen: (openKey, eventId, now) =>
        ticketModel
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
        ticketModel
            .find({ source: TicketSource.system, openKey: { $exists: true }, ...filter })
            .exec(),

    findOpenByKey: (openKey) => ticketModel.findOne({ openKey }).exec(),

    deleteOwned: (filter, session) =>
        // Mongoose: Model.deleteMany(filter, { session }) joins the caller's transaction.
        // https://mongoosejs.com/docs/api/model.html#Model.deleteMany()
        ticketModel
            .deleteMany(filter, { session })
            .exec()
            .then(({ deletedCount }) => deletedCount),

    deleteSystemAbout: (userId, session) =>
        ticketModel
            .deleteMany(
                {
                    source: TicketSource.system,
                    subjectId: toObjectId(userId),
                    'link.type': { $in: LINKS_THAT_GO_WITH_THE_PERSON }
                },
                { session }
            )
            .exec()
            .then(({ deletedCount }) => deletedCount),

    detachSubject: (userId, session) =>
        ticketModel
            .updateMany(
                { source: TicketSource.system, subjectId: toObjectId(userId) },
                { $unset: { subjectId: 1 } },
                { session }
            )
            .exec()
            .then(() => undefined),

    forgetStaff: (userId, session) =>
        ticketModel
            .updateMany(
                { assigneeId: toObjectId(userId) },
                { $unset: { assigneeId: 1 } },
                { session }
            )
            .exec()
            .then(() =>
                // Mongoose: `arrayFilters` addresses every matching element of `notes`.
                // https://mongoosejs.com/docs/tutorials/findoneandupdate.html#arrayfilters
                ticketModel
                    .updateMany(
                        { 'notes.authorId': toObjectId(userId) },
                        { $unset: { 'notes.$[note].authorId': 1 } },
                        { session, arrayFilters: [{ 'note.authorId': toObjectId(userId) }] }
                    )
                    .exec()
            )
            .then(() => undefined)
};
