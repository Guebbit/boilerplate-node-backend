/**
 * @module
 * Every read and write of this module's three collections. The sweeps claim a row with a lease
 * (one atomic update stamps a token and an expiry) so two runners never send the same message; a
 * write that finishes a row is filtered on the token, so a runner whose lease lapsed cannot undo a
 * newer attempt.
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { randomUUID } from 'node:crypto';
import type { ClientSession, QueryFilter } from 'mongoose';
import { MINUTE_MS } from '@domain-primitives/time';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import type { ContactMessage } from '@modules/tasks';
import {
    zammadContactModel,
    zammadCustomerModel,
    zammadProfileSyncModel,
    type ZammadContactDocument,
    type ZammadCustomerDocument,
    type ZammadProfileSyncDocument
} from './model';

/**
 * How long one attempt's claim lasts. Well above the adapter's 5 s timeout and a database round
 * trip: long enough that a live attempt is never taken over, short enough that a crashed one is
 * retried within the sweep's own few minutes.
 */
const LEASE_MS = 2 * MINUTE_MS;

/** A fresh claim: who holds the row, and until when. */
const lease = (): { leaseToken: string; leaseExpiresAt: Date } => ({
    leaseToken: randomUUID(),
    leaseExpiresAt: new Date(Date.now() + LEASE_MS)
});

/** The filter for "no live claim": never claimed, or the claim lapsed. */
const unclaimed = (now: Date): QueryFilter<ZammadContactDocument> => ({
    $or: [{ leaseExpiresAt: { $exists: false } }, { leaseExpiresAt: { $lt: now } }]
});

/** The fields a tombstone does not keep: everything the visitor wrote, and who they were. */
const CONTACT_PERSONAL_FIELDS = {
    name: '',
    email: '',
    subject: '',
    message: '',
    category: '',
    orderNumber: '',
    subjectId: '',
    leaseToken: '',
    leaseExpiresAt: ''
} as const;

/**
 * Store a contact message for hand-over, due now.
 *
 * @param message - the screened message
 */
export const addPendingContact = (message: ContactMessage): Promise<ZammadContactDocument> =>
    zammadContactModel.create({
        state: 'pending',
        ...(message.name ? { name: message.name } : {}),
        email: message.email,
        subject: message.subject,
        message: message.message,
        ...(message.category ? { category: message.category } : {}),
        ...(message.orderNumber ? { orderNumber: message.orderNumber } : {}),
        ...(message.subjectId ? { subjectId: toObjectId(message.subjectId) } : {}),
        attempts: 0,
        nextAttemptAt: message.receivedAt,
        unclear: false
    });

/**
 * Claim the oldest due pending message: one atomic update, so a second runner gets the next row
 * or none. A row whose earlier claim lapsed comes back `unclear`.
 *
 * @returns the claimed row (its `leaseToken` is what finishes it), or `null` when nothing is due
 */
export const claimDueContact = (): Promise<ZammadContactDocument | null> => {
    const now = new Date();
    return zammadContactModel
        .findOneAndUpdate(
            { state: 'pending', nextAttemptAt: { $lte: now }, ...unclaimed(now) },
            /**
             * An aggregation-pipeline update: `unclear` is read and written in the same step. A due
             * row that still carries a `leaseToken` was claimed and never released, so the process
             * died mid-call and a ticket may exist: the lookup must run before anything is created.
             * A released row has its token unset (`rescheduleContact`).
             * https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/
             */
            [
                {
                    $set: {
                        ...lease(),
                        unclear: { $or: ['$unclear', { $gt: ['$leaseToken', null] }] }
                    }
                }
            ],
            /**
             * `updatePipeline`: Mongoose refuses an array update without it.
             * https://mongoosejs.com/docs/api/query.html#Query.prototype.findOneAndUpdate()
             */
            { sort: { nextAttemptAt: 1 }, returnDocument: 'after', updatePipeline: true }
        )
        .exec();
};

/**
 * Whether the claim is still ours and the row still there. False when an erasure deleted the row
 * meanwhile: the caller then does nothing with the message.
 *
 * @param id - the row
 * @param token - the claim's token
 */
export const holdsContact = (id: string, token: string): Promise<boolean> =>
    zammadContactModel.exists({ _id: toObjectId(id), leaseToken: token }).then(Boolean);

/**
 * Delete the row once the ticket exists. By id alone, not by token: the erasure race ends here,
 * and a row an erasure already deleted answers `false`.
 *
 * @param id - the row
 * @returns whether this call deleted it
 */
export const deleteContactById = (id: string): Promise<boolean> =>
    zammadContactModel
        .deleteOne({ _id: toObjectId(id) })
        .exec()
        .then(({ deletedCount }) => deletedCount === 1);

/**
 * Put a failed attempt back in the queue: count it, release the claim, push the next try out.
 *
 * @param id - the row
 * @param token - the claim's token; a lapsed claim writes nothing
 * @param retry - what the attempt learned
 */
export const rescheduleContact = (
    id: string,
    token: string,
    retry: { attempts: number; nextAttemptAt: Date; unclear: boolean }
): Promise<unknown> =>
    zammadContactModel
        .updateOne(
            { _id: toObjectId(id), leaseToken: token },
            {
                $set: retry,
                $unset: { leaseToken: '', leaseExpiresAt: '' }
            }
        )
        .exec();

/**
 * Turn a message that fell back to a to-do into a tombstone: the visitor's words are removed, a
 * dated marker stays for the alert that counts fallbacks.
 *
 * @param id - the row
 * @param token - the claim's token
 */
export const tombstoneContact = (id: string, token: string): Promise<unknown> =>
    zammadContactModel
        .updateOne(
            { _id: toObjectId(id), leaseToken: token },
            {
                $set: { state: 'fell_back', fellBackAt: new Date() },
                $unset: CONTACT_PERSONAL_FIELDS
            }
        )
        .exec();

/**
 * Whose a pending message is, by the one rule the export and the erasure share: the account it was
 * sent under, or the address it came from once the account proved that address. Anyone can sign
 * up with a stranger's address, so an unverified one matches nothing.
 *
 * @param subject - who the export or erasure is about
 */
const ownContactsFilter = (subject: {
    userId: string;
    email: string;
    emailVerified: boolean;
}): QueryFilter<ZammadContactDocument> => ({
    state: 'pending',
    $or: [
        { subjectId: toObjectId(subject.userId) },
        ...(subject.emailVerified ? [{ email: subject.email }] : [])
    ]
});

/**
 * A person's pending messages, for the export.
 *
 * @param subject - who the export is about
 */
export const findOwnContacts = (subject: {
    userId: string;
    email: string;
    emailVerified: boolean;
}): Promise<ZammadContactDocument[]> =>
    zammadContactModel.find(ownContactsFilter(subject)).sort({ createdAt: 1 }).exec();

/**
 * Delete a person's pending messages inside the erasure's transaction.
 *
 * @param subject - the erased account
 * @param session - the erasure's transaction
 */
export const deleteOwnContacts = (
    subject: { userId: string; email: string; emailVerified: boolean },
    session: ClientSession
): Promise<unknown> =>
    zammadContactModel.deleteMany(ownContactsFilter(subject), { session }).exec();

/** Age in seconds of the oldest pending message, `0` when none waits. Read at scrape time. */
export const oldestPendingContactAgeSeconds = (): Promise<number> =>
    zammadContactModel
        .findOne({ state: 'pending' })
        .sort({ createdAt: 1 })
        .select({ createdAt: 1 })
        .lean()
        .exec()
        .then((row) =>
            row?.createdAt ? Math.max(0, (Date.now() - row.createdAt.getTime()) / 1000) : 0
        );

/** How many messages fell back to a to-do and have not expired yet. Read at scrape time. */
export const countFallbackTombstones = (): Promise<number> =>
    zammadContactModel.countDocuments({ state: 'fell_back' }).exec();

/**
 * The Zammad customer an account is, if a ticket ever linked them.
 *
 * @param userId - the account
 */
export const findCustomer = (userId: string): Promise<ZammadCustomerDocument | null> =>
    zammadCustomerModel.findOne({ userId: toObjectId(userId) }).exec();

/**
 * Remember which Zammad customer an account is.
 *
 * @param userId - the account
 * @param zammadUserId - the customer Zammad answered with
 */
export const upsertCustomer = (userId: string, zammadUserId: number): Promise<unknown> =>
    zammadCustomerModel
        .updateOne(
            { userId: toObjectId(userId) },
            { $set: { zammadUserId }, $setOnInsert: { userId: toObjectId(userId) } },
            { upsert: true }
        )
        .exec();

/**
 * Delete an account's mapping inside the erasure's transaction.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 */
export const deleteCustomer = (userId: string, session: ClientSession): Promise<unknown> =>
    zammadCustomerModel.deleteOne({ userId: toObjectId(userId) }, { session }).exec();

/**
 * Note that an account's profile changed: one row per account, due now. A change while a row
 * waits only moves its `requestedAt`.
 *
 * @param userId - the account
 */
export const requestProfileSync = (userId: string): Promise<unknown> => {
    const now = new Date();
    return zammadProfileSyncModel
        .updateOne(
            { userId: toObjectId(userId) },
            {
                $set: { requestedAt: now, nextAttemptAt: now, attempts: 0 },
                $setOnInsert: { userId: toObjectId(userId) }
            },
            { upsert: true }
        )
        .exec();
};

/** Claim the oldest due profile sync, as {@link claimDueContact} claims a message. */
export const claimDueProfileSync = (): Promise<ZammadProfileSyncDocument | null> => {
    const now = new Date();
    return zammadProfileSyncModel
        .findOneAndUpdate(
            {
                nextAttemptAt: { $lte: now },
                $or: [{ leaseExpiresAt: { $exists: false } }, { leaseExpiresAt: { $lt: now } }]
            },
            { $set: lease() },
            { sort: { nextAttemptAt: 1 }, returnDocument: 'after' }
        )
        .exec();
};

/**
 * Finish a profile sync: delete the row unless the account changed again after it was claimed, in
 * which case the row stays, due, for the next pass.
 *
 * @param row - the claimed row
 */
export const finishProfileSync = (row: ZammadProfileSyncDocument): Promise<unknown> =>
    zammadProfileSyncModel
        .deleteOne({
            _id: row._id,
            leaseToken: row.leaseToken,
            requestedAt: row.requestedAt
        })
        .exec()
        .then(({ deletedCount }) =>
            deletedCount === 1
                ? undefined
                : zammadProfileSyncModel
                      .updateOne(
                          { _id: row._id, leaseToken: row.leaseToken },
                          {
                              $set: { nextAttemptAt: new Date() },
                              $unset: { leaseToken: '', leaseExpiresAt: '' }
                          }
                      )
                      .exec()
        );

/**
 * Push a failed profile sync out by the retry ladder.
 *
 * @param row - the claimed row
 * @param nextAttemptAt - not before this instant
 */
export const rescheduleProfileSync = (
    row: ZammadProfileSyncDocument,
    nextAttemptAt: Date
): Promise<unknown> =>
    zammadProfileSyncModel
        .updateOne(
            { _id: row._id, leaseToken: row.leaseToken },
            {
                $set: { attempts: row.attempts + 1, nextAttemptAt },
                $unset: { leaseToken: '', leaseExpiresAt: '' }
            }
        )
        .exec();

/**
 * Drop a profile sync that cannot succeed (the account is gone, or Zammad refused it for good).
 *
 * @param row - the claimed row
 */
export const dropProfileSync = (row: ZammadProfileSyncDocument): Promise<unknown> =>
    zammadProfileSyncModel.deleteOne({ _id: row._id }).exec();

/**
 * Delete an account's profile-sync row inside the erasure's transaction.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 */
export const deleteProfileSync = (userId: string, session: ClientSession): Promise<unknown> =>
    zammadProfileSyncModel.deleteOne({ userId: toObjectId(userId) }, { session }).exec();
