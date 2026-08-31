/**
 * @module
 * Ambient augmentations to Express's `Request`/`Response` types, so every handler in the app sees
 * the fields middleware actually attaches (auth context, request id, locale, uploaded urls)
 * without an explicit import at each call site.
 */

import type { TFunction } from 'i18next';
import type { AuthContext } from './types/auth-context';

declare module 'express-serve-static-core' {
    interface Request {
        /** Transport-safe auth context DTO (available after auth middleware). */
        authContext?: AuthContext;
        requestId?: string;
        /**
         * URLs of the images this request uploaded, set only when there was no broker to hand the
         * digest job to (`quarantineUploadedImages` ran the pipeline inline). Read through
         * `resolveImageUrl`, never directly: the point of the value is that a controller cannot
         * tell a local path from a CDN url.
         */
        storedImageUrls?: string[];
        /** Thumbnail urls produced alongside {@link storedImageUrls} in the same inline run. */
        storedThumbnailUrls?: string[];
        /**
         * Quarantine keys of the images this request uploaded, set only when a broker is
         * configured — the digest happens later, in the worker, keyed by these
         * (`imageStore.quarantine()`'s return value). Read through `resolvePendingImageKey`.
         */
        quarantinedImageKeys?: string[];
        /** Locale negotiated from `Accept-Language` (set by the locale middleware). */
        locale?: string;
        /**
         * `t` bound to `request.locale`. The explicit form of the ambient `t` exported by
         * `@infrastructure/i18n`, which resolves to this same binding for anything on the request's
         * async chain.
         */
        t?: TFunction;
    }
}
