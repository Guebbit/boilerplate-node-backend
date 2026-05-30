import { Router } from 'express';
import { successResponse } from '@utils/response';
import { getHeavyLoad } from '@controllers/_development/get-heavy-load';

export const router = Router();

if (process.env.NODE_ENV !== 'production') router.get('/heavy', getHeavyLoad);

/** Welcome / public ping — returns 200 if the process is running. */
router.get('/', (_request, response) => {
    successResponse(response, { status: 'ok' }, 200, 'API is running');
});
