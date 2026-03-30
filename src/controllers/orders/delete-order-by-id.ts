import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * DELETE /orders/:id
 * Delete an order by path id (admin).
 */
const deleteOrderById = async (request: Request, response: Response): Promise<void> => {
    const result = await OrderService.remove(String(request.params.id));
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, undefined, 200, result.message);
};

export default deleteOrderById;
