/**
 * @module
 * `GET /locales/apps` controller — thin HTTP adapter over `localeService.listApps`.
 */

import type { Request, Response } from 'express';
import type { LocaleApps } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';

/**
 * GET /locales/apps
 * Every app this deployment holds words for, read from the environment (see `../apps`)
 * via `localeService` so the source can change without this controller knowing.
 * Public and cacheable: no user data, identical for every caller.
 */
export const getLocaleApps = (_request: Request, response: Response) =>
    successResponse<LocaleApps>(response, { apps: localeService.listApps() });
