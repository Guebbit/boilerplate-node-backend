import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /orders/:id
 * Delete an order by path id (admin).
 */
const deleteOrderItem = (request: Request, response: Response) => {
    return OrderService.remove(String(request.params.id)).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    });
};

export default deleteOrderItem;
