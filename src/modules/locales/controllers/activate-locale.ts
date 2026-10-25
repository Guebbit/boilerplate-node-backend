/**
 * @module
 * Controllers for `POST /locales/:locale/activate` and `/deactivate` — the two action endpoints
 * that switch a language on and off. The refusals, the cache clear, the overlay refresh and the
 * audit row live in the service; these only run it and map the language.
 */

import type { Request, Response } from 'express';
import type { Language } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { localeService } from '../services';
import { presentLocale } from '../presenters';
import { catchAs, refused } from '@infrastructure/http/controller';

/**
 * The two handlers differ by one service call and the operation name their failures are logged
 * under, so one builder makes both.
 *
 * @param operation - the contract's operationId
 * @param run - the service call that moves the language
 * @returns the express handler
 */
const switchLanguage =
    (operation: string, run: typeof localeService.activateLanguage) =>
    (request: Request<{ locale: string }>, response: Response) =>
        run(request.params.locale, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;

                return successResponse<Language>(
                    response,
                    presentLocale(
                        result.data,
                        localeService.languageActions(
                            result.data,
                            localeService.standingOn(request.caller)
                        )
                    )
                );
            })
            .catch(catchAs(response, operation));

/**
 * POST /locales/:locale/activate (admin)
 * Switch a registered language on.
 */
export const activateLocale = switchLanguage('activateLocale', localeService.activateLanguage);

/**
 * POST /locales/:locale/deactivate (admin)
 * Switch a registered language off; the fallback language refuses.
 */
export const deactivateLocale = switchLanguage(
    'deactivateLocale',
    localeService.deactivateLanguage
);
