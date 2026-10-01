/**
 * @module
 * `GET /account/reauth` controller — thin HTTP adapter over `accountService.reauthMethods`.
 */

import type { Request, Response } from 'express';
import type { ReauthMethods } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { refused, catchAs } from '@infrastructure/http/controller';
import { accountService } from '../services';

/**
 * GET /account/reauth — which ways the caller's account can answer a `401 REAUTH_REQUIRED`
 * challenge. Plain `isAuth`: learning your own options needs no fresh session, or a stale one
 * could never find out how to get fresh.
 */
export const getReauthMethods = (request: Request, response: Response) => {
    const { id } = request.authContext!;

    return accountService
        .reauthMethods(id)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<ReauthMethods>(response, result.data);
        })
        .catch(catchAs(response, 'getReauthMethods'));
};
