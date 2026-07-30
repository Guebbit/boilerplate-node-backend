/**
 * Upload helpers — read side.
 *
 * The write side (where files land, how they are named) lives in `@core/adapters/storage`.
 * This module only normalizes what multer left on the request.
 */

import type { Request } from 'express';

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
        // `.array()` case — already a flat list.
        if (Array.isArray(request.files)) return request.files.map((file) => file.path);

        // multer.fields() returns an object keyed by field name, each value being an array —
        // flatten across fields, since callers want paths, not the field structure.
        const paths: string[] = [];
        for (const files of Object.values(request.files))
            paths.push(...files.map((file) => file.path));
        // Normalize "present but empty" to undefined so callers have one falsy case to check.
        return paths.length > 0 ? paths : undefined;
    }

    return undefined;
}

/**
 * Resolve the effective image URL for a request.
 * An uploaded file (via multer) takes priority over a string imageUrl in the body.
 * Returns the raw full path (for file deletion on error) and the relative URL (for storage).
 *
 * Both values are returned because they serve different purposes: the absolute path is needed
 * to `deleteFile()` the upload if the surrounding operation later fails, while only the
 * public-relative URL should be persisted — baking the container's filesystem layout into
 * database rows would break the moment the mount path changes.
 *
 * @param request - Express request with optional multer file
 */
export function resolveImageUrl(request: Request): {
    imageUrlRaw: string | undefined;
    imageUrl: string | undefined;
} {
    // `[0]`: these endpoints accept a single image, so ignore any extras.
    const imageUrlRaw = getFormFiles(request)?.[0];
    // Strip the public-directory prefix ('public/images/x.png' → '/images/x.png') to get the
    // path as a browser will request it. Note `String.replace` with a string pattern replaces
    // only the first occurrence — which is what we want, and also why the prefix must not
    // appear again inside the filename (it cannot: names are random hex).
    const imageUrl = imageUrlRaw?.replace(process.env.NODE_PUBLIC_PATH ?? 'public', '');
    return { imageUrlRaw, imageUrl };
}
