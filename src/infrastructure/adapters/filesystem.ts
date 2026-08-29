/**
 * Filesystem helpers.
 */

import { copyFile, rename, unlink } from 'node:fs/promises';
// Shared toolkit helper: unlinks a file and routes any error to the callback instead of
// throwing, so callers do not need their own try/catch.
import { deleteFile as toolkitDeleteFile } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';

/**
 * Move a file, across filesystems if necessary.
 *
 * `rename` is atomic and free, and it is also the one call that CANNOT cross a device boundary —
 * it fails with `EXDEV`. That is not an edge case here: uploads are staged in the system temp
 * directory, which on Linux is routinely a tmpfs, while the public directory is on the container's
 * disk or a mounted volume. So the fallback is the normal path in production and the fast path is
 * the normal one in tests, and both have to work.
 *
 * Copy-then-unlink is deliberately in that order: a crash between the two leaves a stale staged
 * file, which the next cleanup removes, whereas unlink-then-copy would lose the upload outright.
 *
 * Unlike {@link deleteFile}, this one THROWS. A cleanup that fails can be swallowed; a move that
 * fails means the bytes the client sent are not where the database is about to say they are.
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
 * Delete target file in the filesystem, logging unexpected failures
 *
 * Used to clean up multer uploads when the request that created them later fails validation
 * or a database write — otherwise orphaned files accumulate in the public directory.
 * Deliberately non-throwing: a failed cleanup must not turn into a failed HTTP response.
 *
 * @param filePath - absolute path as produced by multer (`request.file.path`)
 */
export const deleteFile = (filePath: string) =>
    // Second argument is the error callback the toolkit invokes instead of rejecting.
    toolkitDeleteFile(filePath, (error) =>
        // `error` level rather than `warn`: an undeletable file usually points at a permissions
        // or mount misconfiguration that a human should look at.
        // The Error goes under `error`, never spread into fields of its own: `redactFormat`
        // hands anything under that key to `serializeError`, which is the single place deciding
        // that stacks stay out of production logs. A hand-spelled `stack` bypasses the rule and
        // puts absolute container paths in the aggregated store.
        logger.error({ message: 'Could not delete file.', error })
    );
