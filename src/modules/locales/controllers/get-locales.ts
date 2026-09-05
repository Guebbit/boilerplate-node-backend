/**
 * @module
 * `GET /locales` and `GET /locales/:locale` controllers — the manifest, over
 * `localeService.listCapabilities`, and the API's own filesystem dictionary.
 */

import type { Request, Response } from 'express';
import type { LocaleCapabilities, LocaleDictionary } from '@types';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { listSupportedLocales, readLocaleDictionary, t } from '@infrastructure/i18n';
import { localeService } from '../services';
import { catchAs } from '@infrastructure/http/controller';

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
        .listCapabilities(localeService.callerScope(request.authContext))
        .then((capabilities) => successResponse<LocaleCapabilities>(response, capabilities))
        .catch(catchAs(response, 'getLocales'));

/**
 * GET /locales/:locale
 * This API's own dictionary for one language — its ~60 message keys, nothing else.
 * Separate keyspace from client UI copy (`GET /locales/:locale/messages`, database-backed);
 * this one reads the filesystem, since it exists for the outage where that route is not.
 */
export const getLocaleDictionary = (request: Request<{ locale?: string }>, response: Response) => {
    const { locale } = request.params;

    // `listSupportedLocales` is derived from the directory itself, so this doubles as the 404
    // check and the path-traversal guard.
    if (!locale || !listSupportedLocales().includes(locale))
        return rejectResponse(response, 404, [t('generic.error-invalid-data')]);

    return successResponse<LocaleDictionary>(response, {
        locale,
        messages: readLocaleDictionary(locale)
    });
};
