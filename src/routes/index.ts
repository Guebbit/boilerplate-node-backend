import express from 'express';
import { successResponse } from '@utils/response';

const router = express.Router();

// GET / — health check / API welcome
router.get('/', (request, response) => {
    successResponse(response, { message: 'Ecommerce API is running' });
});

export default router;

