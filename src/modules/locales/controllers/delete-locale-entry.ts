/**
 * @module
 * `DELETE /locales/:locale/entries/:entryId` controller — thin HTTP adapter over
 * `localeService.deleteEntry`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * DELETE /locales/:locale/entries/:entryId (admin)
 * Remove one key from one language — other languages keep their own row for that key.
 * No response body; the removed key is recorded in the audit trail instead. The service
 * itself refreshes the overlay on success — see `services/overlay.ts`.
 */
export const deleteLocaleEntry = (
    request: Request<{ locale: string; entryId: string }>,
    response: Response
) =>
    localeService
        .deleteEntry(request.params.locale, request.params.entryId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;

            return successResponse(response, undefined);
        })
        .catch(catchAs(response, 'deleteLocaleEntry'));
