/**
 * @module
 * Upload helpers — read side.
 *
 * The write side (where files land, how they are named) lives in `@infrastructure/http/middlewares/upload`.
 * This module only normalizes what multer left on the request.
 */

import type { Request } from 'express';
import { imageStore } from '@infrastructure/adapters/image-store';
import { bodyRecordOf } from '@infrastructure/http/request';

/**
 * Extract the uploaded file's path from a multer-processed request, wrapped in an array so
 * callers get a uniform shape regardless of whether anything was uploaded.
 *
 * Every route mounts `upload.image()`, which is `multer.single()` under a fixed field name — so
 * `request.file` is the only shape multer ever populates here; `request.files` (`.array()` /
 * `.fields()`) is a different multer mode this codebase never mounts.
 *
 * @param request - Express request already processed by a multer middleware
 */
export function getFormFiles(request: Request): string[] | undefined {
    return request.file ? [request.file.path] : undefined;
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

    // This helper is shared by every image-accepting controller, so the "no body at all" guard
    // (express 5 leaves `request.body` unset when no parser matched the content-type) covers all
    // of them at once.
    const bodyImageUrl = bodyRecordOf(request).imageUrl;

    return {
        // Non-string values (number, bool, …) must reach the validator untouched so zod can
        // reject them with the correct i18n message. Silently coercing to `undefined` would
        // trigger the controller's `= ''` default and mask the type error (200 instead of 422).
        imageUrl: bodyImageUrl as string | undefined,
        thumbnailUrl: undefined,
        pendingImageKey: undefined,
        deleteUpload: () => Promise.resolve(false)
    };
};
