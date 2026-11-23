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
    listServedLocales,
    runWithLocaleContext
} from '@infrastructure/i18n';

/**
 * Picks the best served locale for the request's `Accept-Language` header.
 *
 * One pick decides everything: the API's own wording (a message with no wording in the picked
 * language falls back to the fallback language key by key), the product text, and the
 * `Content-Language` label, which names the audience the answer is written for (RFC 9110 §8.5).
 * What can be picked is every language switched on — deployed or registered — and the fallback;
 * a switched-off or unknown tag falls back like no header at all.
 *
 * `request.acceptsLanguages` (Express, via `accepts`/`negotiator`) handles q-weights, `*` and
 * `en-GB` → `en` region-prefix matching — the same ground `CLAUDE.md` says not to reimplement by
 * hand. `false` (nothing offered matches, or the header explicitly refuses everything) falls back,
 * same as no header at all.
 *
 * The fallback locale goes FIRST in the offered list ({@link listServedLocales} puts it there):
 * `negotiator` answers a bare `*` — or no header — with the first candidate offered, so that is
 * what makes both cases resolve to the fallback rather than an arbitrary served locale.
 *
 * @param request - only `acceptsLanguages` is read off it, so a stub needs no more than that
 */
const negotiateLocale = (request: Pick<Request, 'acceptsLanguages'>): string => {
    const negotiated = request.acceptsLanguages(...listServedLocales());
    return typeof negotiated === 'string' ? negotiated : getFallbackLocale();
};

/**
 * `GET /config` answers from the process, not from a module, so it is the one language-neutral
 * read no module declares.
 */
const CONFIG_READ = '/config';

/**
 * Matchers for the reads whose SUCCESS body does not depend on the visitor's language, as OpenAPI
 * path templates (`{name}` is one path segment): {@link CONFIG_READ} plus each module's
 * `languageNeutralReads`. Each is a `languageNeutral` `setCache` route (`GET /config` is not
 * cached in Redis); `tests/integration/language-neutral-routes.test.ts` keeps each module's list
 * and its routes equal.
 *
 * A list here, not a flag on the route, because `attachLocale` runs before routing (so a refusal
 * from the limiter or a parser already speaks the caller's language) and cannot yet know which
 * route will match. A header it set then could only be stripped later, and a global header is
 * never patched after the fact.
 */
let languageNeutralPatterns: readonly RegExp[] = [];

/**
 * Install the language-neutral reads the enabled modules declare, replacing any earlier list.
 * Called once from `locales`' `onRegistered`; a test calls it to install a fixture.
 *
 * @param declared - the modules' `languageNeutralReads` (`resolveLanguageNeutralReads`)
 */
export const setLanguageNeutralReads = (declared: readonly string[]): void => {
    languageNeutralPatterns = [CONFIG_READ, ...declared].map(
        (template) => new RegExp(`^${template.replaceAll(/\{\w+\}/g, '[^/]+')}$`)
    );
};

// So `/config` alone is recognised before any module has declared.
setLanguageNeutralReads([]);

/**
 * Whether the request is a read of a language-neutral route.
 *
 * @param request - only `method` and `path` are read
 * @returns true for a GET or HEAD (Express serves a HEAD through the GET route) on a listed path
 */
export const isLanguageNeutral = (request: Pick<Request, 'method' | 'path'>): boolean => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    const path = request.path.length > 1 ? request.path.replace(/\/$/, '') : request.path;
    return languageNeutralPatterns.some((pattern) => pattern.test(path));
};

/**
 * The language negotiated for each response whose success is left unlabelled (a language-neutral
 * read), kept so a refusal can still be labelled — see {@link labelNeutralRefusal}.
 *
 * A WeakMap, not `response.locals`, like `doNotRetryResponses` in `response.ts`: `rejectResponse`
 * is called with hand-built response stubs that have no `locals`.
 */
const unlabelledLocales = new WeakMap<Response, string>();

/**
 * Labels a response with the language the API answered in, and says that header selected the body.
 *
 * @param response - the response to label
 * @param locale - the negotiated language
 */
const labelWithLocale = (response: Response, locale: string): void => {
    response.set('Content-Language', locale);
    response.vary('Accept-Language');
};

/**
 * Gives a refusal on a language-neutral read the labels its success does not carry: the refusal
 * is translated into the visitor's language, so `Content-Language` and `Vary` are true of it.
 * Called by `rejectResponse`; a no-op on every other response, which `attachLocale` already labelled.
 *
 * @param response - the response being refused
 */
export const labelNeutralRefusal = (response: Response): void => {
    const locale = unlabelledLocales.get(response);
    if (locale !== undefined) labelWithLocale(response, locale);
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
 * A language-neutral read gets neither header here: its success has no words in it, so there is
 * nothing to vary on; `rejectResponse` adds both to a refusal, which IS translated.
 */
export const attachLocale = (request: Request, response: Response, next: NextFunction): void => {
    const context = createLocaleContext(negotiateLocale(request));

    // On the request for code that has one to hand...
    request.locale = context.locale;
    request.t = context.t;

    if (isLanguageNeutral(request)) unlabelledLocales.set(response, context.locale);
    else labelWithLocale(response, context.locale);

    // ...and in async-local storage for code that does not — workers, services, deep helpers.
    runWithLocaleContext(context, next);
};
