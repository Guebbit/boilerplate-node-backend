/**
 * @module
 * Controller for `GET /shop-tasks/summary` — the counts behind the staff navigation badges.
 *
 * @see docs/modules/shop-tasks.md#the-nav-badge-summary
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import { workSummary } from '../services/work-summary';

/** GET /shop-tasks/summary (staff) */
export const getShopWorkSummary = (request: Request, response: Response) =>
    // `isAuth` runs first, so the session is there.
    workSummary(request.authContext!)
        .then((counts) => successResponse(response, counts, 200))
        .catch(catchAs(response, 'getShopWorkSummary'));
