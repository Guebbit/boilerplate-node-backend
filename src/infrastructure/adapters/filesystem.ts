/**
 * @module
 * Filesystem helpers: a move that works across mounts, and a delete that never throws.
 * Kept small and dependency-light so every other adapter that touches disk builds on these two
 * instead of re-deriving the EXDEV fallback or the log-and-swallow pattern on its own.
 */

import { copyFile, rename, unlink } from 'node:fs/promises';
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
        logger.error({ message: 'Could not delete file.', error })
    );
