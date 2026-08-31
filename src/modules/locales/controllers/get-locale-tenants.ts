/**
 * @module
 * `GET /locales/tenants` controller — thin HTTP adapter over `localeService.listTenants`.
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';

/**
 * GET /locales/tenants
 * Every tenant this deployment holds words for, read from the environment (see `../tenants`)
 * via `localeService` so the source can change without this controller knowing.
 * Public and cacheable: no user data, identical for every caller.
 */
export const getLocaleTenants = (_request: Request, response: Response) =>
    successResponse(response, { tenants: localeService.listTenants() });
