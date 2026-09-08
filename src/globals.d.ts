/**
 * @module
 * Ambient augmentations to Express's `Request`/`Response` types, so every handler in the app sees
 * the fields middleware actually attaches (auth context, request id, locale, uploaded urls)
 * without an explicit import at each call site.
 */

import type { TFunction } from 'i18next';
import type { AuthContext, Caller } from './types/auth-context';

declare module 'express-serve-static-core' {
    interface Request {
        /** Transport-safe auth context DTO (available after auth middleware). */
        authContext?: AuthContext;
        /**
         * The same caller as an authorization decision sees them, in TENANT scope — resolved once
         * by the auth guard so nothing below has to turn two role names into keys again.
         *
         * Set together with {@link authContext} and absent for the same requests. Platform-scope
         * questions are resolved per key inside the guard and never travel on the request: a
         * request acts in one scope, and which one is settled by what is being asked.
         */
        caller?: Caller;
        requestId?: string;
        /**
         * URLs of the images this request uploaded, set only when there was no broker to hand the
         * digest job to (`quarantineUploadedImages` ran the pipeline inline). Read through
         * `readUploadedImage`, never directly: the point of the value is that a controller cannot
         * tell a local path from a CDN url.
         */
        storedImageUrls?: string[];
        /** Thumbnail urls produced alongside {@link storedImageUrls} in the same inline run. */
        storedThumbnailUrls?: string[];
        /**
         * Quarantine keys of the images this request uploaded, set only when a broker is
         * configured — the digest happens later, in the worker, keyed by these
         * (`imageStore.quarantine()`'s return value). Read through `readUploadedImage`.
         */
        quarantinedImageKeys?: string[];
        /**
         * The body exactly as it arrived, kept for the routes whose callers SIGN it — a signature
         * covers bytes, and `JSON.stringify(request.body)` is not those bytes. Set by the JSON
         * parser's `verify` hook in `app/security.ts`, and only for the paths listed there.
         */
        rawBody?: Buffer;
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
