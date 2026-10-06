/**
 * @module
 * `GET /account/oauth/links` controller — thin HTTP adapter over `accountService.listOAuthLinks`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import type { OAuthLinks } from '@types';
import { catchAs } from '@infrastructure/http/controller';
import { accountService } from '../services';

/**
 * GET /account/oauth/links
 * The caller's connected sign-in providers, with when each was connected.
 */
export const getOAuthLinks = (request: Request, response: Response) =>
    accountService
        .listOAuthLinks(request.authContext!.id)
        .then((links) =>
            successResponse<OAuthLinks>(response, {
                links: links.map(({ provider, connectedAt }) => ({
                    provider,
                    connectedAt: connectedAt.toISOString()
                }))
            })
        )
        .catch(catchAs(response, 'getOAuthLinks'));
