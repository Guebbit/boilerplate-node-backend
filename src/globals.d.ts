import type { TFunction } from 'i18next';
import type { IAuthContext } from './types/auth-context';
import type { IObservabilityContext } from '@core/observability/context';

declare module 'express-serve-static-core' {
    interface Request {
        /** Transport-safe auth context DTO (available after auth middleware). */
        authContext?: IAuthContext;
        /** Observability helpers attached by the observability middleware. */
        obs?: IObservabilityContext;
        requestId?: string;
        /**
         * URLs of the images this request uploaded, once the image store has committed them
         * (`storeUploadedImages`). Read through `resolveImageUrl`, never directly: the point of
         * the value is that a controller cannot tell a local path from a CDN url.
         */
        storedImageUrls?: string[];
        /** Locale negotiated from `Accept-Language` (set by the locale middleware). */
        locale?: string;
        /**
         * `t` bound to `request.locale`. The explicit form of the ambient `t` exported by
         * `@core/i18n`, which resolves to this same binding for anything on the request's
         * async chain.
         */
        t?: TFunction;
    }
}
