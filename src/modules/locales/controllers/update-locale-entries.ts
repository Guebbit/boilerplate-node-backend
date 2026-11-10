/**
 * @module
 * The two bulk imports on an app's entries. They are two methods rather than one route with a
 * flag — PUT replaces (what isn't sent is deleted), PATCH merges (what isn't sent is left alone,
 * `null` deletes) — so a mis-set boolean can't silently empty a dictionary.
 */

import type { Request, Response } from 'express';
import type { ZodType } from 'zod';
import { UpdateLocaleEntriesBody, ReplaceLocaleEntriesBody } from '@api/schemas.zod';
import type {
    LocaleImportResult,
    UpdateLocaleEntriesRequest,
    ReplaceLocaleEntriesRequest
} from '@types';
import { successResponse } from '@infrastructure/http/response';
import { setEtag, withIfMatch } from '@infrastructure/http/preconditions';
import { EDIT_REVISION } from '@infrastructure/persistence/revision-plugin';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';

/**
 * The two bulk routes differ by their schema and one word, so one builder makes both.
 *
 * @param mode - `replace` deletes what is not sent, `merge` leaves it alone
 * @param schema - the operation's generated body schema
 * @returns the express handler
 */
const importEntries =
    (mode: 'replace' | 'merge', schema: ZodType<{ entries: Record<string, string | null> }>) =>
    (
        request: Request<
            { locale: string; app: string },
            unknown,
            ReplaceLocaleEntriesRequest | UpdateLocaleEntriesRequest
        >,
        response: Response
    ) => {
        const body = parseBody(schema, request.body, response);
        if (!body) return;

        // Keyed by the normalized tag: the repository's fence names the language the same way.
        const tag = localeService.normalizeTag(request.params.locale);

        return withIfMatch(request, tag, () =>
            localeService.importEntries(
                request.params.locale,
                request.params.app,
                body.entries,
                mode,
                callerContextOf(request)
            )
        )
            .then((result) => {
                if (refused(response, result)) return;

                // The language's new revision, so the next import needs no re-export. The tag's
                // version is the dictionary counter; a PUT answer drops it (RFC 9110 §9.3.4).
                setEtag(response, { [EDIT_REVISION]: result.data.revision });
                return successResponse<LocaleImportResult>(response, result.data);
            })
            .catch(
                catchAs(response, mode === 'merge' ? 'updateLocaleEntries' : 'replaceLocaleEntries')
            );
    };

/**
 * PUT /locales/:locale/apps/:app/entries (admin)
 * Replace the app's whole set — anything stored under it and not sent is deleted.
 */
export const replaceLocaleEntries = importEntries('replace', ReplaceLocaleEntriesBody);

/**
 * PATCH /locales/:locale/apps/:app/entries (admin)
 * JSON merge patch over the app's key-to-text map: a string upserts, `null` deletes, a key the
 * body does not name is left alone.
 */
export const updateLocaleEntries = importEntries('merge', UpdateLocaleEntriesBody);
