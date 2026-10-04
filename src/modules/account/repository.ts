/**
 * @module
 * Queries for `accountexports`. Plain lean reads and atomic writes: nothing here is paged or
 * searched, so the shared repository factory has nothing to add.
 */

import type { ClientSession } from 'mongoose';
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import { accountExportModel, type AccountExportDocument, type ExportStatus } from './model';

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
