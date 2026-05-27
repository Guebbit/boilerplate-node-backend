import type { Request, Response } from 'express';
import { orderService } from '@services/orders';
import { rejectResponse, successResponse } from '@utils/response';
import type { CastError } from 'mongoose';

/**
 * GET /admin/orders
 * List all orders (admin only, no scope restriction).
 */
export const getAllOrders = (_request: Request, response: Response) => {
    return orderService
        .getAll()
        .then((orders) => {
            successResponse(response, orders);
        })
        .catch((error: CastError) => {
            rejectResponse(response, 500, 'Internal Server Error', [error.message]);
        });
};
