/**
 * Filesystem helpers.
 *
 * Mostly an ESM compatibility shim: ES modules have no `__filename`/`__dirname` globals
 * (they are CommonJS-only), so path resolution relative to the current file has to be
 * derived from `import.meta.url` instead.
 */

// `fileURLToPath` converts a `file:///abs/path/mod.ts` URL — the format `import.meta.url`
// uses — into a plain OS path. Needed because `path.*` cannot operate on URLs, and naive
// string slicing breaks on Windows drive letters and percent-encoded characters.
import { fileURLToPath } from 'node:url';
// Shared toolkit helper: unlinks a file and routes any error to the callback instead of
// throwing, so callers do not need their own try/catch.
import { deleteFile as toolkitDeleteFile } from '@guebbit/js-toolkit';
import path from 'node:path';
import { logger } from '@core/adapters/logger';

/**
 * Resolve the CommonJS-style `__filename` / `__dirname` pair for an ES module.
 *
 * @param metaUrl - always pass `import.meta.url` from the *calling* module; passing anything
 *                  else defeats the purpose, since the point is to anchor paths to the caller.
 *
 * CAVEAT: `dirname` is currently derived from `__filename` (this module) rather than from the
 * `filename` computed just above, so it always reports *this* file's directory regardless of
 * `metaUrl`. It happens to be correct for the only caller (`adapters/mailer.ts`, same
 * directory) — but a caller elsewhere in the tree would silently get the wrong directory.
 */
export const getFileUrl = (metaUrl: string) => {
    const filename = fileURLToPath(metaUrl); // __filename
    const dirname = path.dirname(__filename); // __dirname
    return { filename, dirname };
};

/**
 * Convenience wrapper returning only the directory — the common case, since it is what
 * `path.resolve()` needs as a base for locating templates, views and static assets.
 *
 * @param metaUrl - `import.meta.url` of the calling module
 */
export const getDirname = (metaUrl: string) => getFileUrl(metaUrl).dirname;

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
