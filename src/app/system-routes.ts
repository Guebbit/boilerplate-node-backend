/**
 * @module
 * System-level routes that serve the process itself rather than a domain: the root ping, and
 * (mounted alongside it by `app/routes.ts`) the contract/docs endpoints. Kept out of
 * `src/modules` because it belongs to nobody's business logic.
 */

import { Router } from 'express';
import { successResponse } from '@infrastructure/http/response';

/** This file's router, mounted at `/` by `app/routes.ts`. */
export const router = Router();

/** Welcome / public ping — returns 200 if the process is running. */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});
