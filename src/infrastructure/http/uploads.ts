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
 * `path.posix.normalize()` won't do this — it leaves existing backslashes alone, since on POSIX
 * one is a legal filename character. The literal replacement is safe here because upload
 * filenames are random hex and can never contain a backslash of their own.
 *
 * @param value - a path in whatever separator style the platform produced
 */
export const toPosixPath = (value: string): string => value.replaceAll('\\', '/');

/**
 * Extract uploaded file paths from a multer-processed request, from whichever of the three shapes
 * multer populates (`.single()` → `request.file`; `.array()`/`.fields()` → `request.files`), so
 * controllers don't have to care which middleware variant a route used.
 *
 * @param request - Express request already processed by a multer middleware
 */
export function getFormFiles(request: Request): string[] | undefined {
    // Single file upload (multer.single()). Wrapped in an array so the return type is uniform.
    if (request.file) return [request.file.path];

    // Multiple file upload (multer.array() or multer.fields())
    if (request.files) {
        // `.array()` is already a flat list; `.fields()` is an object keyed by field name, each
        // value an array — flattened across fields, since callers want paths, not structure.
        // Collected rather than returned per-branch so the empty-array normalization below
        // applies uniformly to both shapes.
        const paths: string[] = Array.isArray(request.files)
            ? request.files.map((file) => file.path)
            : Object.values(request.files).flatMap((files) => files.map((file) => file.path));

        // Normalize "present but empty" to undefined so callers have one falsy case to check.
        return paths.length > 0 ? paths : undefined;
    }

    return undefined;
}
