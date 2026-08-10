import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@core/http/response';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    readLocaleDictionary,
    t
} from '@core/i18n';

/**
 * GET /locales
 * The languages this deployment can answer in.
 *
 * Which locales exist is a RUNTIME fact — it depends on which dictionary files are deployed —
 * so it cannot live in `openapi.yaml` as an enum. A client that wants to offer a language
 * picker matching what the API actually supports has to ask.
 */
export const getLocales = (_request: Request, response: Response) =>
    successResponse(response, {
        locales: listSupportedLocales(),
        default: getDefaultLocale(),
        fallback: getFallbackLocale()
    });

/**
 * GET /locales/:locale
 * This API's OWN dictionary for one language — its ~60 message keys, nothing else.
 *
 * Deliberately not "the translations a client needs": the two repositories are independent, and
 * serving a client's UI copy from the API repository would put view text in the API's keyspace.
 * What this serves is the API's own strings, which the API already owns and already ships. A
 * client merges them under a namespace it reserves for exactly that (`api.*` in the Vue
 * boilerplate) and never at the root, where two independently-authored keyspaces would collide.
 *
 * In normal operation a client needs none of this: the API resolves its own keys and puts
 * finished text on the wire. It earns its place when no response arrives at all — a network
 * failure, a bare 502 — and the client has to produce the copy itself.
 *
 * Public and cacheable: static copy, identical for every caller, no user data.
 */
export const getLocaleDictionary = (request: Request<{ locale?: string }>, response: Response) => {
    const { locale } = request.params;

    // Checked against the supported list rather than trusted, because the value goes into a
    // filename. `listSupportedLocales` is derived from the directory itself, so anything not on
    // it cannot correspond to a file — which makes this both the 404 check and the traversal
    // guard (`../../etc/passwd` is not a supported locale).
    if (!locale || !listSupportedLocales().includes(locale))
        return rejectResponse(response, 404, [t('generic.error-invalid-data')]);

    return successResponse(response, {
        locale,
        messages: readLocaleDictionary(locale)
    });
};
