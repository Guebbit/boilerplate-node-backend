/**
 * @module
 * Locale negotiation middleware — resolves the request's language once, up front, and makes it
 * available two ways: explicitly on `request.locale` / `request.t` for code that already holds the
 * request, and ambiently through AsyncLocalStorage for code that does not (services, repositories,
 * Zod thunks that import `t` directly from `@infrastructure/i18n`).
 */

import type { NextFunction, Request, Response } from 'express';
import { createLocaleContext, negotiateLocale, runWithLocaleContext } from '@infrastructure/i18n';

/**
 * Negotiates the request's language and runs the rest of the chain inside it.
 *
 * `request.locale` / `request.t` are the explicit form; everything else imports `t` from
 * `@infrastructure/i18n` and gets the same binding ambiently. Mounted before the routes, so every
 * handler producing user-facing copy runs after it.
 *
 * `Vary: Accept-Language` tells any cache in front of the API that this header selects the body —
 * the same fault the `Vary: Authorization` note in `cache.ts` describes, different header.
 */
export const attachLocale = (request: Request, response: Response, next: NextFunction): void => {
    const context = createLocaleContext(negotiateLocale(request.get('accept-language')));

    // On the request for code that has one to hand...
    request.locale = context.locale;
    request.t = context.t;

    response.set('Content-Language', context.locale);
    response.vary('Accept-Language');

    // ...and in async-local storage for code that does not — workers, services, deep helpers.
    runWithLocaleContext(context, next);
};
