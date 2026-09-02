/**
 * @module
 * `GET /account/oauth/providers` controller — thin HTTP adapter over `enabledProviders()`, so the
 * frontend knows which "Continue with…" buttons to render without hardcoding a list.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { enabledProviders } from '../oauth/providers';

/**
 * GET /account/oauth/providers
 * Lists the OAuth providers this deployment has credentials for.
 */
export const getOAuthProviders = (_request: Request, response: Response) => {
    successResponse(response, { providers: enabledProviders() });
};
