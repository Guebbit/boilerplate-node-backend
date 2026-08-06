/**
 * Upload helpers — read side.
 *
 * The write side (where files land, how they are named) lives in `@core/adapters/storage`.
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
 * Which is also why only ONE of them is separator-normalised. `imageUrlRaw` comes from multer,
 * which builds it with `path.join()`, so on Windows it arrives as `public\images\x.png`. That
 * form is correct for `deleteFile()` and wrong for everything else: a URL path has no
 * backslashes, so persisting it produced rows that `express.static` answers with a 404 —
 * silently, and only on developer machines that happen to run Windows.
 *
 * @param request - Express request with optional multer file
 */
export function resolveImageUrl(request: Request): {
    imageUrlRaw: string | undefined;
    imageUrl: string | undefined;
} {
    // `[0]`: these endpoints accept a single image, so ignore any extras.
    const imageUrlRaw = getFormFiles(request)?.[0];
    // Normalise BEFORE stripping, and normalise the prefix too, so the two agree on separators
    // whatever mix the platform and `NODE_PUBLIC_PATH` arrive in. Stripping first would leave a
    // Windows-shaped prefix unmatched against a posix-shaped configured path.
    const publicPath = toPosixPath(process.env.NODE_PUBLIC_PATH ?? 'public');
    // Strip the public-directory prefix ('public/images/x.png' → '/images/x.png') to get the
    // path as a browser will request it. Note `String.replace` with a string pattern replaces
    // only the first occurrence — which is what we want, and also why the prefix must not
    // appear again inside the filename (it cannot: names are random hex).
    const imageUrl = imageUrlRaw && toPosixPath(imageUrlRaw).replace(publicPath, '');
    return { imageUrlRaw, imageUrl };
}
