/**
 * @module
 * `POST /account/export` controller — thin HTTP adapter over `requestExport`. Imported straight
 * from `../services/export` rather than off `accountService`: see that barrel's own docblock for
 * why the data-export service stays out of it. `requireFreshAuth` (mounted on the route) is the
 * identity proof; there is nothing else for this controller to check.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { requestExport } from '../services/export';
import { catchAs, refused } from '@infrastructure/http/controller';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * POST /account/export — ask for the caller's own data. Answers `202` with the export's `id` and
 * `status`; the file is built in the background and a link to it is mailed when it is ready.
 */
export const postAccountExport = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id, email } = request.authContext!;

    return requestExport(id, email, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data, result.status, result.message);
        })
        .catch(catchAs(response, 'postAccountExport'));
};
