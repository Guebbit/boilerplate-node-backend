/**
 * @module
 * Locale negotiation middleware — resolves the request's language once, up front, and makes it
 * available two ways: explicitly on `request.locale` / `request.t` for code that already holds the
 * request, and ambiently through AsyncLocalStorage for code that does not (services, repositories,
 * Zod thunks that import `t` directly from `@infrastructure/i18n`).
 */

import type { NextFunction, Request, Response } from 'express';
import {
    createLocaleContext,
    getFallbackLocale,
    listSupportedLocales,
    runWithLocaleContext
} from '@infrastructure/i18n';

/**
 * Picks the best supported locale for the request's `Accept-Language` header.
 *
 * `request.acceptsLanguages` (Express, via `accepts`/`negotiator`) handles q-weights, `*` and
 * `en-GB` → `en` region-prefix matching — the same ground `CLAUDE.md` says not to reimplement by
 * hand. `false` (nothing offered matches, or the header explicitly refuses everything) falls back,
 * same as no header at all.
 *
 * The fallback locale goes FIRST in the offered list: `negotiator` answers a bare `*` — or no
 * header — with the first candidate offered, so that is what makes both cases resolve to the
 * fallback rather than an arbitrary supported locale.
 *
 * @param request - only `acceptsLanguages` is read off it, so a stub needs no more than that
 */
const negotiateLocale = (request: Pick<Request, 'acceptsLanguages'>): string => {
    const supported = listSupportedLocales();
    const fallback = supported.includes(getFallbackLocale())
        ? getFallbackLocale()
        : (supported[0] ?? getFallbackLocale());
    const offered = [fallback, ...supported.filter((locale) => locale !== fallback)];

    const negotiated = request.acceptsLanguages(...offered);
    return typeof negotiated === 'string' ? negotiated : fallback;
};

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
    const context = createLocaleContext(negotiateLocale(request));

    // On the request for code that has one to hand...
    request.locale = context.locale;
    request.t = context.t;

    response.set('Content-Language', context.locale);
    response.vary('Accept-Language');

    // ...and in async-local storage for code that does not — workers, services, deep helpers.
    runWithLocaleContext(context, next);
};
