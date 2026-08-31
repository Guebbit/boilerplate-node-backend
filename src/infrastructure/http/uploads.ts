/**
 * @module
 * Upload helpers — read side.
 *
 * The write side (where files land, how they are named) lives in `@infrastructure/adapters/storage`.
 * This module only normalizes what multer left on the request.
 */

import type { Request } from 'express';

/**
 * Rewrite a filesystem path as a URL path: every backslash becomes a forward slash.
 *
 * `path.posix.normalize()` is deliberately NOT used — it leaves existing backslashes alone,
 * because on POSIX a backslash is a legal character in a filename rather than a separator. The
 * problem here is the opposite one: a path produced by `path.join()` on Windows, being read as a
 * URL. A literal replacement is the only thing that fixes that, and it is safe precisely because
 * upload filenames are random hex and can never contain a backslash of their own.
 *
 * @param value - a path in whatever separator style the platform produced
 */
export const toPosixPath = (value: string): string => value.replaceAll('\\', '/');

/**
 * Extract uploaded file paths from a multer-processed request.
 * Handles both single-file (req.file) and multi-file (req.files) uploads.
 * Returns an array of file paths, or undefined if no files were uploaded.
 *
 * Exists because multer populates *three* different shapes depending on which middleware
 * variant a route used, and controllers should not have to care which:
 *   `.single()` → `request.file`               (one object)
 *   `.array()`  → `request.files`              (an array)
 *   `.fields()` → `request.files`              (an object keyed by field name)
 *
 * @param request - Express request already processed by a multer middleware
 */
export function getFormFiles(request: Request): string[] | undefined {
    // Single file upload (multer.single()). Wrapped in an array so the return type is uniform.
    if (request.file) return [request.file.path];

    // Multiple file upload (multer.array() or multer.fields())
    if (request.files) {
        // `.array()` is already a flat list. `.fields()` is an object keyed by field name, each
        // value an array — flattened across fields, since callers want paths, not the field
        // structure. Collected rather than returned per-branch so the normalization below
        // applies to both: returning `[]` from one branch and `undefined` from the other is the
        // exact difference this function exists to hide, and it is truthy on one side only.
        const paths: string[] = Array.isArray(request.files)
            ? request.files.map((file) => file.path)
            : Object.values(request.files).flatMap((files) => files.map((file) => file.path));

        // Normalize "present but empty" to undefined so callers have one falsy case to check.
        return paths.length > 0 ? paths : undefined;
    }

    return undefined;
}

/**
 * The URL of the image this request uploaded, or `undefined` if it uploaded none — or if a
 * broker took the job, in which case there is no real url yet (see {@link resolvePendingImageKey}).
 *
 * The value is produced when `quarantineUploadedImages` (`@infrastructure/adapters/storage`) runs
 * the digest pipeline inline — the no-broker path — and simply read back here — a controller never
 * learns where the bytes went. That is the boundary the whole storage seam rests on: it is what
 * allows the same controller to work whether the store answered `/images/x.png` or
 * `https://cdn.example.com/images/x.png`.
 *
 * Constructing the url in the store, rather than deriving it by stripping `NODE_PUBLIC_PATH` off
 * multer's path, keeps a filesystem separator away from the value that gets persisted — see
 * {@link toPosixPath} for what that costs when it does not.
 *
 * @param request - Express request that has been through the upload middleware
 */
export function resolveImageUrl(request: Pick<Request, 'storedImageUrls'>): string | undefined {
    // `[0]`: these endpoints accept a single image, so ignore any extras.
    return request.storedImageUrls?.[0];
}

/**
 * The thumbnail URL produced alongside {@link resolveImageUrl}'s result, in the same inline run.
 *
 * @param request - Express request that has been through the upload middleware
 */
export function resolveThumbnailUrl(
    request: Pick<Request, 'storedThumbnailUrls'>
): string | undefined {
    return request.storedThumbnailUrls?.[0];
}

/**
 * The quarantine key of the image this request uploaded, when a broker is configured to digest it
 * later — `undefined` when nothing was uploaded, or when it was processed inline instead (see
 * {@link resolveImageUrl}).
 *
 * @param request - Express request that has been through the upload middleware
 */
export function resolvePendingImageKey(
    request: Pick<Request, 'quarantinedImageKeys'>
): string | undefined {
    return request.quarantinedImageKeys?.[0];
}
