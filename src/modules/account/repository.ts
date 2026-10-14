/**
 * @module
 * Queries for `accountexports`, `sessions` and `verificationtokens`. Plain lean reads and atomic
 * writes: nothing here is paged or searched, so the shared repository factory has nothing to add.
 */

import type { ClientSession, Types } from 'mongoose';
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import { isDuplicateKey } from '@infrastructure/persistence/mongo-errors';
import {
    accountExportModel,
    sessionModel,
    verificationTokenModel,
    type AccountExportDocument,
    type ExportStatus,
    type SessionDocument,
    type VerificationTokenDocument
} from './model';
import { ONE_LIVE_TOKEN_TYPES, type VerificationTokenType } from './token-types';
import type { SessionMode } from './session-mode';

/** One export row as the services read it. */
export type AccountExportRow = Lean<AccountExportDocument>;

/**
 * The row an account owns, if any — there is at most one per account.
 *
 * @param userId - the account
 */
const findByUserId = (userId: string): Promise<AccountExportRow | null> =>
    accountExportModel
        .findOne({ userId: toObjectId(userId) })
        .lean<AccountExportRow | null>()
        .exec();

/**
 * One row by its own id, whoever it belongs to — the worker's lookup, which holds an id and no
 * session.
 *
 * @param id - the row's id
 */
const findById = (id: string): Promise<AccountExportRow | null> =>
    accountExportModel.findById(toObjectId(id)).lean<AccountExportRow | null>().exec();

/**
 * One row, only if it belongs to this account. The ownership check IS the query: a row that is
 * someone else's is indistinguishable from one that does not exist.
 *
 * @param userId - the caller
 * @param id - the row's id
 */
const findOwned = (userId: string, id: string): Promise<AccountExportRow | null> =>
    accountExportModel
        .findOne({ _id: toObjectId(id), userId: toObjectId(userId) })
        .lean<AccountExportRow | null>()
        .exec();

/**
 * Insert a fresh row. Rejects with a duplicate-key error (`11000`) when the account already has
 * one — the unique index on `userId` is what makes "one live export" true under a race.
 *
 * @param row - the row, with its own `_id` already chosen so `file` can name it
 */
const insert = (
    row: Pick<AccountExportRow, '_id' | 'userId' | 'status' | 'file' | 'createdAt' | 'expiresAt'>
): Promise<void> => accountExportModel.create(row).then(() => undefined);

/**
 * Move a row out of `building`, exactly once. The filter on `status` is what lets two runs of one
 * job race safely: only the first matches, so only it goes on to mail the link.
 *
 * @param id - the row's id
 * @param status - `ready` or `failed`
 * @param expiresAt - the new deletion time (a ready file's retention starts when it is ready)
 * @returns the settled row, or `null` when it was no longer `building` (replaced, erased, or
 *   already settled by another run)
 */
const settleBuilding = (
    id: string,
    status: Exclude<ExportStatus, 'building'>,
    expiresAt: Date
): Promise<AccountExportRow | null> =>
    accountExportModel
        .findOneAndUpdate(
            { _id: toObjectId(id), status: 'building' },
            { $set: { status, expiresAt } },
            { new: true }
        )
        .lean<AccountExportRow | null>()
        .exec();

/**
 * Delete one row by id.
 *
 * @param id - the row's id
 */
const deleteById = (id: string): Promise<void> =>
    accountExportModel
        .deleteOne({ _id: toObjectId(id) })
        .exec()
        .then(() => undefined);

/**
 * Delete every row an account owns and say which files they named — what a hard account deletion
 * owes this collection, and the files the after-commit step still owes the disk.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 * @returns the names of the files the deleted rows pointed at
 */
const deleteByUserId = (userId: string, session: ClientSession): Promise<string[]> =>
    accountExportModel
        .find({ userId: toObjectId(userId) }, { file: 1 }, { session })
        .lean<Pick<AccountExportRow, 'file'>[]>()
        .exec()
        .then((rows) =>
            accountExportModel
                .deleteMany({ userId: toObjectId(userId) }, { session })
                .exec()
                .then(() => rows.map((row) => row.file))
        );

/**
 * A batch of rows past their deletion time.
 *
 * @param now - the moment to compare against
 * @param limit - the batch size; the reaper asks again until a batch comes back short
 */
const findExpired = (now: Date, limit: number): Promise<AccountExportRow[]> =>
    accountExportModel
        .find({ expiresAt: { $lte: now } })
        .limit(limit)
        .lean<AccountExportRow[]>()
        .exec();

/** Explicit annotation: same TS7056 reason as every other module's repository. */
export const accountExportRepository: {
    findByUserId: typeof findByUserId;
    findById: typeof findById;
    findOwned: typeof findOwned;
    insert: typeof insert;
    settleBuilding: typeof settleBuilding;
    deleteById: typeof deleteById;
    deleteByUserId: typeof deleteByUserId;
    findExpired: typeof findExpired;
} = {
    findByUserId,
    findById,
    findOwned,
    insert,
    settleBuilding,
    deleteById,
    deleteByUserId,
    findExpired
};

/** One `sessions` row as the services read it. */
export type SessionRow = Lean<SessionDocument>;

/** What a new session row is built from — everything but `purgeAt` (a live row's is its own expiry) and `supersededAt` (only rotation sets it). */
export type NewSessionRow = Omit<SessionRow, '_id' | 'purgeAt' | 'supersededAt' | '__v'>;

/**
 * Insert a session row. A live row's `purgeAt` is its `expiresAt`: the database deletes it the
 * moment it would no longer be honoured anyway.
 *
 * @param row - the session, without `purgeAt`
 */
const insertSession = (row: NewSessionRow): Promise<void> =>
    sessionModel.create({ ...row, purgeAt: row.expiresAt }).then(() => undefined);

/**
 * The row holding this credential digest, whatever state it is in — live, superseded or expired.
 * The caller decides what each state means; the TTL monitor lags, so an expired row can still be here.
 *
 * @param tokenHash - the credential's digest
 */
const findSessionByHash = (tokenHash: string): Promise<SessionRow | null> =>
    sessionModel.findOne({ tokenHash }).lean<SessionRow | null>().exec();

/**
 * Claim a `jwt` row for rotation, exactly once: stamps `supersededAt` and shortens `purgeAt` to the
 * reuse-detection window (never past the row's own expiry). Of N concurrent callers presenting the
 * same token, exactly one sees `true`.
 *
 * An aggregation-pipeline update, because the new `purgeAt` depends on the row's own `expiresAt`.
 * https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/
 *
 * @param tokenHash - the presented refresh token's digest
 * @param at - when the rotation happens
 * @param retentionMs - how long a rotated-away row is kept so a replay still reads as theft
 * @returns whether THIS call superseded the row
 */
const supersedeSession = (tokenHash: string, at: Date, retentionMs: number): Promise<boolean> =>
    sessionModel
        .findOneAndUpdate(
            { tokenHash, mode: 'jwt', supersededAt: { $exists: false } },
            [
                {
                    $set: {
                        supersededAt: at,
                        purgeAt: { $min: ['$expiresAt', new Date(at.getTime() + retentionMs)] }
                    }
                }
            ],
            // `updatePipeline`: Mongoose refuses an array update unless told it is a pipeline.
            { updatePipeline: true, projection: { _id: 1 } }
        )
        .lean<{ _id: Types.ObjectId } | null>()
        .exec()
        .then((claimed) => claimed !== null);

/**
 * Stamp a row as used. A single update on the row itself, so two devices refreshing at once cannot
 * overwrite each other. Throttled when `minIntervalMs` is given: a busy tab does not write per request.
 *
 * @param tokenHash - the credential's digest
 * @param now - the moment of use
 * @param minIntervalMs - skip the write when the row was stamped more recently than this; 0 always writes
 * @returns whether a write happened
 */
const touchSession = (tokenHash: string, now: Date, minIntervalMs = 0): Promise<boolean> =>
    sessionModel
        .updateOne(
            {
                tokenHash,
                ...(minIntervalMs > 0 && {
                    $or: [
                        { lastUsedAt: { $exists: false } },
                        { lastUsedAt: { $lt: new Date(now.getTime() - minIntervalMs) } }
                    ]
                })
            },
            { $set: { lastUsedAt: now } }
        )
        .exec()
        .then(({ modifiedCount }) => modifiedCount > 0);

/**
 * The account's live sessions of one mode, newest sign-in first. Live means not rotated away and
 * not past its expiry — the TTL monitor lags, so expiry is checked here too.
 *
 * @param userId - the account
 * @param mode - the mode whose rows are listed; the other mode's are never shown
 * @param now - the moment to compare expiry against
 */
const listLiveSessions = (userId: string, mode: SessionMode, now: Date): Promise<SessionRow[]> =>
    sessionModel
        .find({
            userId: toObjectId(userId),
            mode,
            supersededAt: { $exists: false },
            expiresAt: { $gt: now }
        })
        .sort({ startedAt: -1, _id: -1 })
        .lean<SessionRow[]>()
        .exec();

/**
 * Delete the row holding this credential — a logout of the current session. Idempotent: a digest
 * no row holds is a success.
 *
 * @param tokenHash - the credential's digest
 * @returns how many rows went
 */
const removeSessionByHash = (tokenHash: string): Promise<number> =>
    sessionModel
        .deleteOne({ tokenHash })
        .exec()
        .then(({ deletedCount }) => deletedCount);

/**
 * Delete a whole session by its public id — "log out that device": the live row and any
 * rotated-away predecessor in its retention window go together. Scoped to the owner, so a leaked
 * id from someone else's session removes nothing.
 *
 * @param userId - the caller
 * @param familyId - the session id `GET /account/sessions` published
 * @returns how many rows went; 0 for an unknown id or someone else's session
 */
const removeSessionFamily = (userId: string, familyId: string): Promise<number> =>
    sessionModel
        .deleteMany({ userId: toObjectId(userId), familyId: toObjectId(familyId) })
        .exec()
        .then(({ deletedCount }) => deletedCount);

/**
 * Whether a `jwt` session family still has an unexpired row — the check an access token's `sid`
 * claim is held to. ANY unexpired row counts, rotated-away or not: a rotation supersedes the old
 * row before it inserts the successor, and a mid-refresh access token must not be refused.
 *
 * @param userId - the account the token names
 * @param familyId - the `sid` claim
 * @param now - the moment to compare expiry against
 */
const sessionFamilyIsLive = (userId: string, familyId: string, now: Date): Promise<boolean> =>
    sessionModel
        .exists({
            userId: toObjectId(userId),
            familyId: toObjectId(familyId),
            mode: 'jwt',
            expiresAt: { $gt: now }
        })
        .exec()
        .then((found) => found !== null);

/**
 * Delete the whole session a credential belongs to: the row it names and every sibling of its
 * family, such as a predecessor still inside the rotation grace window. Nothing when the credential
 * names no row.
 *
 * @param tokenHash - the credential's digest
 * @returns how many rows went
 */
const removeSessionFamilyByHash = (tokenHash: string): Promise<number> =>
    findSessionByHash(tokenHash).then((row) =>
        row ? removeSessionFamily(String(row.userId), String(row.familyId)) : 0
    );

/**
 * Delete every session an account holds — logout everywhere, a password change, an erasure.
 *
 * @param userId - the account
 * @param session - the caller's transaction, when the delete must commit with other writes
 * @returns how many rows went
 */
const removeAllSessions = (userId: string, session?: ClientSession): Promise<number> =>
    sessionModel
        .deleteMany({ userId: toObjectId(userId) }, { session })
        .exec()
        .then(({ deletedCount }) => deletedCount);

/** Explicit annotation: same TS7056 reason as every other module's repository. */
export const sessionRepository: {
    insert: typeof insertSession;
    findByHash: typeof findSessionByHash;
    supersede: typeof supersedeSession;
    touch: typeof touchSession;
    listLive: typeof listLiveSessions;
    removeByHash: typeof removeSessionByHash;
    removeFamily: typeof removeSessionFamily;
    familyIsLive: typeof sessionFamilyIsLive;
    removeFamilyByHash: typeof removeSessionFamilyByHash;
    removeAll: typeof removeAllSessions;
} = {
    insert: insertSession,
    findByHash: findSessionByHash,
    supersede: supersedeSession,
    touch: touchSession,
    listLive: listLiveSessions,
    removeByHash: removeSessionByHash,
    removeFamily: removeSessionFamily,
    familyIsLive: sessionFamilyIsLive,
    removeFamilyByHash: removeSessionFamilyByHash,
    removeAll: removeAllSessions
};

/** One `verificationtokens` row as the services read it. */
export type VerificationTokenRow = Lean<VerificationTokenDocument>;

/**
 * What issuing a token needs. `amr` rides only on an MFA challenge.
 */
export interface NewVerificationToken {
    userId: string;
    type: VerificationTokenType;
    tokenHash: string;
    sentAt: Date;
    expiresAt: Date;
    amr?: string[];
}

/**
 * The one-live-link kinds: replace whatever the account holds with the new row, in one atomic
 * upsert. Two simultaneous requests both end with exactly one row; the loser of the index race
 * simply retries as an update.
 *
 * @param token - the token to store
 */
const upsertLiveToken = (token: NewVerificationToken): Promise<void> => {
    const write = (): Promise<unknown> =>
        verificationTokenModel
            .updateOne(
                { userId: toObjectId(token.userId), type: token.type },
                {
                    $set: {
                        tokenHash: token.tokenHash,
                        sentAt: token.sentAt,
                        expiresAt: token.expiresAt
                    },
                    ...(token.amr === undefined ? { $unset: { amr: '' } } : {})
                },
                { upsert: true }
            )
            .exec();

    return write()
        .catch((error: unknown) => {
            // The upsert raced another upsert for the same (user, type): the row now exists, so
            // the same call is a plain update.
            if (isDuplicateKey(error)) return write();
            throw error;
        })
        .then(() => undefined);
};

/**
 * Store a one-time token. The kinds that allow only one live link per account replace the old one
 * atomically; the others (a delete confirmation, an MFA challenge) just add a row.
 *
 * @param token - the token to store, already hashed
 */
const issueVerificationToken = (token: NewVerificationToken): Promise<void> =>
    ONE_LIVE_TOKEN_TYPES.includes(token.type)
        ? upsertLiveToken(token)
        : verificationTokenModel
              .create({ ...token, userId: toObjectId(token.userId) })
              .then(() => undefined);

/**
 * The live token of this kind carrying this digest. Expiry is checked here as well as by the TTL
 * monitor, which lags by up to a minute.
 *
 * @param type - which kind the link claims to be
 * @param tokenHash - the digest of the presented value
 * @param now - the moment to compare expiry against
 */
const findLiveVerificationToken = (
    type: VerificationTokenType,
    tokenHash: string,
    now: Date
): Promise<VerificationTokenRow | null> =>
    verificationTokenModel
        .findOne({ type, tokenHash, expiresAt: { $gt: now } })
        .lean<VerificationTokenRow | null>()
        .exec();

/**
 * Spend a token: delete its row. Of two simultaneous uses of one link, only one deletes anything.
 *
 * @param type - the kind the link must be
 * @param tokenHash - the digest of the presented value
 * @returns whether THIS call removed the row
 */
const spendVerificationToken = (type: VerificationTokenType, tokenHash: string): Promise<boolean> =>
    verificationTokenModel
        .deleteOne({ type, tokenHash })
        .exec()
        .then(({ deletedCount }) => deletedCount > 0);

/**
 * Remove every token of the given kinds an account holds.
 *
 * @param userId - the account
 * @param types - the kinds to remove
 */
const removeVerificationTokens = (
    userId: string,
    types: readonly VerificationTokenType[]
): Promise<void> =>
    verificationTokenModel
        .deleteMany({ userId: toObjectId(userId), type: { $in: [...types] } })
        .exec()
        .then(() => undefined);

/**
 * When the account was last sent a token of this kind — what a resend cooldown measures from.
 *
 * @param userId - the account
 * @param type - the kind
 * @returns the newest `sentAt`, or `undefined` when none is in flight
 */
const lastVerificationTokenSentAt = (
    userId: string,
    type: VerificationTokenType
): Promise<Date | undefined> =>
    verificationTokenModel
        .findOne({ userId: toObjectId(userId), type }, { sentAt: 1 })
        .sort({ sentAt: -1 })
        .lean<Pick<VerificationTokenRow, 'sentAt'> | null>()
        .exec()
        .then((row) => row?.sentAt);

/**
 * The accounts holding a live token of this kind — the nightly previous-email sweep keeps exactly
 * these, since their undo link still works.
 *
 * @param type - the kind
 * @param now - the moment to compare expiry against
 */
const userIdsWithLiveVerificationToken = (
    type: VerificationTokenType,
    now: Date
): Promise<string[]> =>
    verificationTokenModel
        .distinct('userId', { type, expiresAt: { $gt: now } })
        .exec()
        .then((ids) => ids.map(String));

/**
 * Delete every token an account holds — what a hard account deletion owes this collection.
 *
 * @param userId - the erased account
 * @param session - the erasure's transaction
 */
const removeAllVerificationTokens = (userId: string, session?: ClientSession): Promise<void> =>
    verificationTokenModel
        .deleteMany({ userId: toObjectId(userId) }, { session })
        .exec()
        .then(() => undefined);

/** Explicit annotation: same TS7056 reason as every other module's repository. */
export const verificationTokenRepository: {
    issue: typeof issueVerificationToken;
    findLive: typeof findLiveVerificationToken;
    spend: typeof spendVerificationToken;
    removeOfTypes: typeof removeVerificationTokens;
    lastSentAt: typeof lastVerificationTokenSentAt;
    userIdsWithLive: typeof userIdsWithLiveVerificationToken;
    removeAll: typeof removeAllVerificationTokens;
} = {
    issue: issueVerificationToken,
    findLive: findLiveVerificationToken,
    spend: spendVerificationToken,
    removeOfTypes: removeVerificationTokens,
    lastSentAt: lastVerificationTokenSentAt,
    userIdsWithLive: userIdsWithLiveVerificationToken,
    removeAll: removeAllVerificationTokens
};
