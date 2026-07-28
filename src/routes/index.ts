import { Router } from 'express';
import { successResponse } from '@utils/response';

export const router = Router();

/** Welcome / public ping — returns 200 if the process is running. */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});
