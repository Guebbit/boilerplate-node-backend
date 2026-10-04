/**
 * @module
 * The export store: a built personal-data export kept on disk until it is downloaded or expires.
 *
 * Streamed both ways, unlike `document-store.ts`: an export can be large, so a file is written a
 * piece at a time and sent to the client as a stream. Nothing here ever holds the whole file.
 *
 * What it is NOT: a record. The export's row in Mongo says whose it is and whether it is ready;
 * the file is a regenerable copy, never backed up, and gone after its retention window.
 *
 * Private: OUTSIDE `NODE_PUBLIC_PATH` (it holds a person's whole data), and a name that does not
 * match the one shape this store writes is never joined onto a path at all. Plaintext on disk, on
 * purpose and in writing: at-rest protection is the host's, like the Mongo data files
 * (`docs/theory/defences/crypto-and-secrets.md`).
 *
 * See: docs/modules/account.md
 */

import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { reapDirectory, unlinkIfPresent, type ReapResult } from './filesystem';
import { exportStoreConfig } from '@infrastructure/adapters/config';

/** Where built exports live. Mount a volume here in a deployment; the default is dev-only. */
const exportRoot = (): string => path.resolve(exportStoreConfig().NODE_ACCOUNT_EXPORT_STORE_PATH);

/**
 * The only name shape this store reads or writes: a short slug and `.json`. Never a path, so
 * nothing a caller passes can name a file outside the root.
 */
const NAME_PATTERN = /^[\w-]{1,80}\.json$/;

/**
 * Resolve a stored export's name to a path inside the root, or `undefined` for a name that is not
 * of the shape this store writes.
 *
 * @param name - the export's file name, e.g. `<recordId>.json`
 */
const resolveName = (name: string): string | undefined =>
    NAME_PATTERN.test(name) ? path.join(exportRoot(), name) : undefined;

/**
 * Appends text to the file being built.
 *
 * @param text - the next piece of the file, written after everything appended before it
 */
export type AppendExport = (text: string) => Promise<void>;

/**
 * Build an export file piece by piece, atomically: `produce` appends to a temporary file in the
 * same directory, and only a `produce` that resolves has it renamed over the final name. A reader
 * sees either no file or a whole one, never half of one; a failed build leaves nothing behind.
 *
 * @param name - the export's file name
 * @param produce - writes the file by calling `append` in order
 * @throws {Error} for a name this store would not write, or whatever `produce` or the disk threw
 */
export const writeExport = (
    name: string,
    produce: (append: AppendExport) => Promise<void>
): Promise<void> => {
    const target = resolveName(name);
    if (!target) return Promise.reject(new Error(`Not a storable export name: ${name}`));

    // Random suffix, so two builds of one name never share a temporary file.
    const temporary = `${target}.${randomBytes(6).toString('hex')}.tmp`;

    return mkdir(exportRoot(), { recursive: true })
        .then(() => open(temporary, 'w'))
        .then((handle) =>
            // `FileHandle#write(string)` resolves once the bytes are handed to the OS, so a slow
            // disk paces the producer without a drain handler of our own.
            // https://nodejs.org/api/fs.html#filehandlewritestring-position-encoding
            produce((text) => handle.write(text).then(() => undefined)).finally(() =>
                handle.close()
            )
        )
        .then(() => rename(temporary, target))
        .catch((error: unknown) =>
            // A failed build must not leave its temporary file behind.
            unlinkIfPresent(temporary, 'Could not remove a temporary export.', { name }).then(
                () => {
                    throw error;
                }
            )
        );
};

/**
 * Open a stored export for streaming.
 *
 * @param name - the export's file name
 * @returns a read stream, or `undefined` when none is stored (or the name is not one this store
 *   writes). The stream closes the file when it ends or is destroyed.
 */
export const openExport = (name: string): Promise<Readable | undefined> => {
    const target = resolveName(name);
    if (!target) return Promise.resolve(undefined);

    return open(target, 'r').then(
        (handle) => handle.createReadStream(),
        (error: unknown) => {
            // Absent is the ordinary case (never built, or reaped); anything else is a real fault.
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
            throw error;
        }
    );
};

/**
 * Delete one stored export. Absent is fine: a delete racing the reaper is the ordinary case.
 *
 * @param name - the export's file name
 * @returns whether a file was actually deleted
 */
export const removeExport = (name: string): Promise<boolean> => {
    const target = resolveName(name);
    if (!target) return Promise.resolve(false);

    return unlinkIfPresent(target, 'Could not remove a stored export.', { name });
};

/**
 * Delete every file last modified at or before the retention window's edge — the sweep behind
 * `reap:account-exports` for files no record points at any more (a failed delete, an abandoned
 * temporary file). By modification time, so a file is kept from the moment it was built.
 *
 * @param retentionMs - how long a file may stay
 * @returns how many files were checked and deleted
 */
export const reapExports = (retentionMs: number): Promise<ReapResult> =>
    reapDirectory(exportRoot(), Date.now() - retentionMs, 'Stored export');
