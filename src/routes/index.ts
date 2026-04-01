import { Router } from 'express';
import { successResponse } from '@utils/response';

export const router = Router();

/**
 * GET /
 * Health-check / welcome endpoint.
 */
router.get('/', (request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});
