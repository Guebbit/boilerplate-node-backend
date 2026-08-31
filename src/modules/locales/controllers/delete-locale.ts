/**
 * @module
 * `DELETE /locales/:locale` controller — thin HTTP adapter over `localeService.deleteLanguage`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { refreshLocaleOverrides } from '@infrastructure/i18n';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /locales/:locale (admin)
 * Remove a language and every string translated into it. Refuses with 409 while the
 * language is still active — the guard lives in the service, next to the cascade it
 * protects. No response body; the number of entries removed goes into the audit trail.
 */
export const deleteLocale = (request: Request<{ locale: string }>, response: Response) =>
    localeService
        .deleteLanguage(request.params.locale, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            // Not awaited: makes the override stop answering on this worker now, others
            // catch up on their next scheduled refresh. See ./write-locale-entries.ts.
            void refreshLocaleOverrides();

            return successResponse(response, undefined);
        })
        .catch(catchAs(response, 'deleteLocale'));
