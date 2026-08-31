/**
 * @module
 * `GET /locales` and `GET /locales/:locale` controllers — the manifest, over
 * `localeService.listCapabilities`, and the API's own filesystem dictionary.
 */

import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { listSupportedLocales, readLocaleDictionary, t } from '@infrastructure/i18n';
import { localeService } from '../services';
import { catchAs } from '@infrastructure/http/controller';

/**
 * GET /locales
 * Every language this deployment offers, from both tiers, each stating what it can actually do.
 *
 * Which locales exist is a runtime fact — it depends on deployed dictionaries and registered
 * languages — so it can't be an `openapi.yaml` enum; a client asks instead.
 *
 * `scopes` keeps the two tiers distinct: `api` means usable as `Accept-Language`, `app` means a
 * dictionary is downloadable, a locale can have either or both.
 *
 * The dynamic half is best-effort (see `localeService.readDynamicTier`) — a database outage only
 * costs the downloadable languages, never the ones the API can still answer in.
 */
export const getLocales = (request: Request, response: Response) =>
    localeService
        // Role-based row filtering — `getAuth` on the route is what makes it readable here.
        .listCapabilities(localeService.callerScope(request.authContext))
        .then((capabilities) => successResponse(response, capabilities))
        .catch(catchAs(response, 'getLocales'));

/**
 * GET /locales/:locale
 * This API's own dictionary for one language — its ~60 message keys, nothing else.
 *
 * Not "the translations a client needs": client UI copy is a separate keyspace, served by
 * `GET /locales/:locale/messages` (database-backed). This one reads the filesystem and stays
 * doing so, since it exists precisely for the outage where that route is unreachable.
 *
 * Public and cacheable: static copy, identical for every caller, no user data.
 */
export const getLocaleDictionary = (request: Request<{ locale?: string }>, response: Response) => {
    const { locale } = request.params;

    // `listSupportedLocales` is derived from the directory itself, so this doubles as the 404
    // check and the path-traversal guard.
    if (!locale || !listSupportedLocales().includes(locale))
        return rejectResponse(response, 404, [t('generic.error-invalid-data')]);

    return successResponse(response, {
        locale,
        messages: readLocaleDictionary(locale)
    });
};
