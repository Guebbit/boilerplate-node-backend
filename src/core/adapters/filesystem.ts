/**
 * Filesystem helpers.
 */

// Shared toolkit helper: unlinks a file and routes any error to the callback instead of
// throwing, so callers do not need their own try/catch.
import { deleteFile as toolkitDeleteFile } from '@guebbit/js-toolkit';
import { logger } from '@core/adapters/logger';

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
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name
        })
    );
