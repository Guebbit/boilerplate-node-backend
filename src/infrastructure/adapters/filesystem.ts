/**
 * @module
 * Filesystem helpers: a move that works across mounts, a delete that never throws, and an
 * age-based sweep of a flat directory. Kept small and dependency-light so every other adapter
 * that touches disk builds on these instead of re-deriving the EXDEV fallback, the
 * log-and-swallow pattern, or the `readdir`/`stat`/`unlink` sweep on its own.
 */

import { copyFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
// Shared toolkit helper: unlinks a file and routes any error to the callback instead of
// throwing, so callers do not need their own try/catch.
import { deleteFile as toolkitDeleteFile } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';

/**
 * Move a file, across filesystems if necessary.
 *
 * `rename` is atomic and free but cannot cross a device boundary — it fails with `EXDEV`. That's
 * the normal case here: uploads stage on a tmpfs while the public directory is a mounted volume,
 * so this falls back to copy-then-unlink (that order: a crash between the two leaves a stale
 * staged file rather than losing the upload). Unlike {@link deleteFile}, this THROWS — a failed
 * move means the bytes the client sent aren't where the database is about to say they are.
 *
 * @param source - path to move from
 * @param destination - path to move to; its directory must exist
 */
export const moveFile = async (source: string, destination: string) => {
    // eslint-disable-next-line no-restricted-syntax -- rename() throws EXDEV across mounts; the catch IS the copy-then-unlink fallback
    try {
        await rename(source, destination);
    } catch (error) {
        // EXDEV only: upload tmp and storage on different mounts, where rename cannot work at all.
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
        // Copy-then-unlink is the manual rename; the unlink is what keeps it a move, not a copy.
        await copyFile(source, destination);
        await unlink(source);
    }
};

/**
 * Delete a file, logging unexpected failures instead of throwing.
 *
 * Cleans up multer uploads when a request fails validation after writing them — a failed cleanup
 * must not itself become a failed HTTP response.
 *
 * @param filePath - absolute path as produced by multer (`request.file.path`)
 */
export const deleteFile = (filePath: string) =>
    // Second argument is the error callback the toolkit invokes instead of rejecting.
    toolkitDeleteFile(filePath, (error) =>
        // `error` level, not `warn`: an undeletable file usually points at a permissions or
        // mount misconfiguration a human should look at.
        // The Error stays nested under `error`, never spread into its own fields: `redactFormat`
        // routes it to `serializeError`, the one place deciding stacks stay out of production
        // logs — spreading it would bypass that and leak container paths.
        // Stryker disable next-line all
        logger.error({ message: 'Could not delete file.', error })
    );

/**
 * Rewrite a filesystem path as a URL path: every backslash becomes a forward slash.
 *
 * `path.posix.normalize()` won't do this — it leaves existing backslashes alone, since on POSIX
 * one is a legal filename character. The literal replacement is safe here because upload
 * filenames are random hex and can never contain a backslash of their own.
 *
 * @param value - a path in whatever separator style the platform produced
 */
export const toPosixPath = (value: string): string => value.replaceAll('\\', '/');

/** How many files a sweep looked at, and how many it actually deleted. */
export interface ReapResult {
    checked: number;
    reaped: number;
}

/**
 * Deletes every file directly under `root` whose `mtime` is at or before `cutoffMs` — the one
 * sweep every retention reaper in this codebase needs (`scripts/ops/reap-quarantine.ts`,
 * `mail-spool.ts#reapSpooled`). A missing `root` is not a failure — a store that never wrote
 * anything has nothing to sweep — it is logged and reported as zero. A subdirectory is left
 * alone; none of these stores ever writes one.
 *
 * @param root - the directory to sweep, resolved by the caller
 * @param cutoffMs - `Date.now()` epoch millis; a file `mtime` at or before this is deleted
 * @param label - names the store in the log line (e.g. "Quarantine", "Mail spool")
 * @returns how many entries were checked and how many were deleted
 */
export const reapDirectory = (root: string, cutoffMs: number, label: string): Promise<ReapResult> =>
    readdir(root)
        .catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // Stryker disable all
                logger.info({
                    message: `${label} directory does not exist; nothing to reap.`,
                    root
                });
                // Stryker restore all
                return [];
            }
            throw error;
        })
        .then((entries) =>
            Promise.all(
                entries.map((name) => {
                    const filePath = path.join(root, name);
                    return stat(filePath).then((info) =>
                        info.isFile() && info.mtimeMs <= cutoffMs
                            ? unlink(filePath).then(() => true)
                            : false
                    );
                })
            ).then((results) => ({
                checked: entries.length,
                reaped: results.filter(Boolean).length
            }))
        );
