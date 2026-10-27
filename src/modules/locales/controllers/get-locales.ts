/**
 * @module
 * `GET /locales`, `GET /locales/:locale` and `GET /locales/:locale/dictionary` controllers — the
 * manifest and one of its rows, over `localeService`, and the API's own filesystem dictionary.
 */

import type { Request, Response } from 'express';
import type { Language, LocaleCapabilities, LocaleDictionary } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { hasServedDictionary, readLocaleDictionary, t } from '@infrastructure/i18n';
import { localeService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * GET /locales
 * Every language this deployment offers, from both tiers, each stating what it can do.
 * `scopes` distinguishes them: `api` means usable as `Accept-Language`, `app` means a
 * dictionary is downloadable. The dynamic half is best-effort — a database outage only
 * costs the downloadable languages, never the ones the API can still answer in.
 */
export const getLocales = (request: Request, response: Response) =>
    localeService
        // Role-based row filtering — `getAuth` on the route is what makes it readable here.
        .listCapabilities(
            localeService.callerScope(request.caller),
            localeService.readStanding(request.caller)
        )
        .then((capabilities) => successResponse<LocaleCapabilities>(response, capabilities))
        .catch(catchAs(response, 'getLocales'));

/**
 * GET /locales/:locale
 * One language, as the list shows it, under the same caller scoping and standing.
 */
export const getLocale = (request: Request<{ locale: string }>, response: Response) =>
    localeService
        .readLanguage(
            request.params.locale,
            localeService.callerScope(request.caller),
            localeService.readStanding(request.caller)
        )
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse<Language>(response, result.data);
        })
        .catch(catchAs(response, 'getLocale'));

/**
 * GET /locales/:locale/dictionary
 * This API's own dictionary for one language — its ~60 message keys, nothing else.
 * Separate keyspace from client UI copy (`GET /locales/:locale/messages`, database-backed);
 * this one reads the filesystem, since it exists for the outage where that route is not.
 */
export const getLocaleDictionary = (request: Request<{ locale?: string }>, response: Response) => {
    const { locale } = request.params;

    // The supported list is derived from the directory itself, so this doubles as the 404 check and
    // the path-traversal guard. A language switched off answers 404 like an unknown one.
    if (!locale || !hasServedDictionary(locale))
        return rejectResponse(response, 404, [t('generic.error-invalid-data')]);

    return successResponse<LocaleDictionary>(response, {
        locale,
        messages: readLocaleDictionary(locale)
    });
};
