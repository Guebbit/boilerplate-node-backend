import { Router } from 'express';
import { successResponse } from '@utils/response';

const router = Router();

/**
 * GET /
 * Health-check / welcome endpoint.
 */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});

export default router;
