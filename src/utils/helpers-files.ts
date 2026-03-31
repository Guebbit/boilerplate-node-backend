import type { Request } from 'express';

/**
 * Extract uploaded file paths from a multer-processed request.
 * Handles both single-file (req.file) and multi-file (req.files) uploads.
 * Returns an array of file paths, or undefined if no files were uploaded.
 *
 * @param request
 */
export function getFormFiles(request: Request): string[] | undefined {
    // Single file upload (multer.single())
    if (request.file)
        return [request.file.path];

    // Multiple file upload (multer.array() or multer.fields())
    if (request.files) {
        if (Array.isArray(request.files))
            return request.files.map(file => file.path);

        // multer.fields() returns an object keyed by field name
        const paths: string[] = [];
        for (const files of Object.values(request.files))
            paths.push(...files.map(file => file.path));
        return paths.length > 0 ? paths : undefined;
    }

    return undefined;
}

/**
 * Resolve the effective image URL for a request.
 * An uploaded file (via multer) takes priority over a string imageUrl in the body.
 * Returns the raw full path (for file deletion on error) and the relative URL (for storage).
 *
 * @param request - Express request with optional multer file
 * @param bodyImageUrl - Optional image URL string from the request body
 */
export function resolveImageUrl(request: Request, bodyImageUrl?: string): {
    imageUrlRaw: string | undefined,
    imageUrl: string | undefined,
} {
    const imageUrlRaw = getFormFiles(request)?.[0];
    const imageUrl = imageUrlRaw
        ? imageUrlRaw.replace((process.env.NODE_PUBLIC_PATH ?? 'public'), '')
        : bodyImageUrl;
    return { imageUrlRaw, imageUrl };
}
