/**
 * @module
 * `POST /account/export` controller — thin HTTP adapter over `accountService.exportOwnData`.
 * `requireFreshAuth` (mounted on the route) is the identity proof; there is nothing else for
 * this controller to check.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { accountService } from '../services';
import { catchAs, refused } from '@infrastructure/http/controller';
import { authContextOf, callerContextOf } from '@infrastructure/http/request';

/** POST /account/export — the caller's own data, assembled from every collection that holds some. */
export const postAccountExport = (request: Request, response: Response) => {
    /* Auth context is guaranteed by isAuth middleware */
    const { id } = authContextOf(request);

    return accountService
        .exportOwnData(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, result.data);
        })
        .catch(catchAs(response, 'postAccountExport'));
};
