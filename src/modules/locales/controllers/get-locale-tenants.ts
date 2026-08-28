import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { localeService } from '../services';

/**
 * GET /locales/tenants
 * Every tenant this deployment holds words for — the keyspaces an entry can belong to.
 *
 * Configuration read back, not a query: the list comes from the environment (see `../tenants`), so
 * an admin screen can offer exactly the tenants this API will accept without hardcoding them, and
 * a client can find which id is the backend's own.
 *
 * Reached through `localeService` like every other locale read, even though the answer needs no
 * database. That the source happens to be `process.env` today is precisely what this controller
 * must not know: the service is where "where does this list live" is allowed to change.
 *
 * Public and cacheable, like every other locale read: no user data, identical for every caller.
 */
export const getLocaleTenants = (_request: Request, response: Response) =>
    successResponse(response, { tenants: localeService.listTenants() });
