import { Router } from 'express';
import { successResponse } from '@utils/response';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';

export const router = Router();

/**
 * Only in development
 */
if (process.env.NODE_ENV !== 'production')
    router.get('/heavy', getHeavyLoad);

/**
 * GET /
 * Health-check / welcome endpoint.
 */
router.get('/', (request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});
