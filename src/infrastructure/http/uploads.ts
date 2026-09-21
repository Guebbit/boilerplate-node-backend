/**
 * @module
 * Upload helpers — read side.
 *
 * The write side (where files land, how they are named) lives in `@infrastructure/http/middlewares/upload`.
 * This module only normalizes what multer left on the request.
 */

import type { Request } from 'express';
import { imageStore } from '@infrastructure/adapters/image-store';

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

/** What a write controller needs from the image half of its request. */
export interface RequestImage {
    /**
     * The url to persist: this request's upload if it carried one and it was digested inline
     * (no broker configured), the pending-image placeholder if a broker will digest it later, or
     * the body's own `imageUrl` otherwise.
     */
    imageUrl: string | undefined;
    /**
     * The thumbnail url to persist alongside {@link imageUrl} — set together with it in the
     * inline case, the pending-thumbnail placeholder together with the placeholder `imageUrl`, and
     * `undefined` when nothing was uploaded (a body-supplied `imageUrl` has no thumbnail: there is
     * nothing here to derive one from).
     */
    thumbnailUrl: string | undefined;
    /**
     * The quarantine key to persist as `pendingImageKey`, so the eventual digest job's conditional
     * writeback can find this record — `undefined` whenever {@link imageUrl} is already final
     * (inline digest, or no upload at all).
     */
    pendingImageKey: string | undefined;
    /**
     * Remove whatever THIS request's upload left behind — quarantine file if still pending, or
     * the promoted image and thumbnail if digested inline — on a path about to answer an error.
     * Never keyed on a body-supplied {@link imageUrl}: deleting that would destroy a file this
     * request didn't create. No-op when nothing was uploaded.
     */
    deleteUpload: () => Promise<boolean>;
}

/**
 * Read the image a write request carries, and the undo for it.
 *
 * An uploaded file outranks a body `imageUrl` — a caller that sent bytes meant those bytes.
 * Destructure with a default (`const { imageUrl = '' } = readUploadedImage(request)`) where the
 * endpoint's schema wants a string rather than an absent field.
 *
 * @param request - an Express request already through the upload middleware
 */
export const readUploadedImage = (
    request: Pick<
        Request,
        'storedImageUrls' | 'storedThumbnailUrls' | 'quarantinedImageKeys' | 'body'
    >
): RequestImage => {
    /*
     * Read back what the upload middleware recorded, never derived from multer's path: the store
     * CONSTRUCTS these urls, which is what keeps a filesystem separator out of a persisted value
     * and lets the same controller work whether the store answered a local path or a CDN url.
     * `[0]` throughout — these endpoints accept a single image, so extras are ignored.
     */
    const promotedUrl = request.storedImageUrls?.[0];
    const pendingKey = request.quarantinedImageKeys?.[0];

    if (promotedUrl)
        return {
            imageUrl: promotedUrl,
            thumbnailUrl: request.storedThumbnailUrls?.[0],
            pendingImageKey: undefined,
            deleteUpload: () => imageStore.remove(promotedUrl)
        };

    if (pendingKey)
        return {
            imageUrl: process.env.NODE_PENDING_IMAGE_URL ?? '/images/system/pending.png',
            thumbnailUrl:
                process.env.NODE_PENDING_THUMBNAIL_URL ?? '/images/system/pending-thumb.webp',
            pendingImageKey: pendingKey,
            deleteUpload: () => imageStore.removeQuarantined(pendingKey)
        };

    return {
        // `?? {}` before the read: express 5 leaves `request.body` unset when no parser matched
        // the content-type. This helper is shared by every image-accepting controller, so the
        // guard covers all of them at once.
        imageUrl: ((request.body ?? {}) as { imageUrl?: string }).imageUrl,
        thumbnailUrl: undefined,
        pendingImageKey: undefined,
        deleteUpload: () => Promise.resolve(false)
    };
};
