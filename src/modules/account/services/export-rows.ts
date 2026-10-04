/**
 * @module
 * Deleting export rows: the one row-and-file delete the request, the erasure path and the reaper
 * share, and the nightly reaper itself. Kept apart from `./export.ts` so the module barrel can
 * publish the reaper without publishing the build, which reaches every sibling's data.
 *
 * See: docs/modules/account.md#data-export
 */

import { removeExport, reapExports } from '@infrastructure/adapters/export-store';
import { exportRetentionMs } from '../config';
import { accountExportRepository, type AccountExportRow } from '../repository';

/**
 * Delete a row and its file. File first: a row with no file is harmless (the reaper clears it), a
 * file with no row is invisible to the account and to everything but the age sweep.
 *
 * @param row - the row to remove
 */
export const removeRow = (row: AccountExportRow): Promise<void> =>
    removeExport(row.file).then(() => accountExportRepository.deleteById(String(row._id)));

/** How many due rows one reaper query fetches. */
const REAP_BATCH = 200;

/**
 * Delete every export past its retention — file and row — then sweep files no row points at. The
 * nightly `reap:account-exports` job.
 *
 * @returns how many rows were deleted, and how many stray files the age sweep deleted
 */
export const reapExpiredExports = (): Promise<{ rows: number; files: number }> => {
    const drain = (deleted: number): Promise<number> =>
        accountExportRepository.findExpired(new Date(), REAP_BATCH).then((due) => {
            if (due.length === 0) return deleted;
            return Promise.all(due.map((row) => removeRow(row))).then(() =>
                due.length < REAP_BATCH ? deleted + due.length : drain(deleted + due.length)
            );
        });

    return drain(0).then((rows) =>
        reapExports(exportRetentionMs()).then(({ reaped }) => ({ rows, files: reaped }))
    );
};
