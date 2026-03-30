import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderByIdRequest } from '../../../api/api';

/**
 * PUT /orders/:id
 * Update an order by path id (admin).
 */
const putOrderById = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as UpdateOrderByIdRequest;
    const result = await OrderService.update(String(request.params.id), { ...body, status: body.status as string | undefined });
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, result.data);
};

export default putOrderById;
