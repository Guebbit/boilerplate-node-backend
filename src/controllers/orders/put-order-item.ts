import type { Request, Response } from 'express';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateOrderByIdRequest } from '@types';

/**
 * PUT /orders/:id
 * Update an order by path id (admin).
 */
const putOrderItem = (request: Request, response: Response) =>
    OrderService.update(String(request.params.id), {
        ...request.body,
        status: request.body.status as string | undefined
    }).then((result) => {
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, result.data);
    });

export default putOrderItem;
