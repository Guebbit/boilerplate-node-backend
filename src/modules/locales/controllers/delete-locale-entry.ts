import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /locales/:locale/entries/:entryId (admin)
 * Remove one key from one language.
 *
 * One language only, deliberately. A key is stored once per language, so deleting the Spanish row
 * leaves the Italian one standing — which is what a translator working through a list expects, and
 * the reason the collection is one row per (language, key) rather than one row per key holding
 * every language.
 *
 * The key goes into the audit metadata rather than into the response: a delete answers with no
 * body here as it does everywhere else, and "which string disappeared" is a question asked
 * afterwards, of the trail.
 */
export const deleteLocaleEntry = (
    request: Request<{ locale: string; entryId: string }>,
    response: Response
) =>
    localeService
        .deleteEntry(request.params.locale, request.params.entryId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // A deleted override must stop answering on this worker at once; the others
            // pick it up on their next scheduled refresh. Not awaited — see
            // `refreshOverrides` in ./write-locale-entries.ts.
            void refreshLocaleOverrides();

            return successResponse(response, undefined);
        })
        .catch(catchAs(response, 'deleteLocaleEntry'));
