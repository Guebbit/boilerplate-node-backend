import type { NextFunction, Request, Response } from "express";
import type { CastError } from "mongoose";
import { Types } from "mongoose";
import { databaseErrorConverter, ExtendedError } from "@utils/error-helpers";
import { rejectResponse, successResponse } from "@utils/response";
import type { CreateOrderRequest, UpdateOrderRequest, UpdateOrderByIdRequest, DeleteOrderRequest } from "@api/api";
import type { IOrderDocument } from "@models/orders";
import OrderRepository from "@repositories/orders";
import OrderService from "@services/orders";

/**
 * Path parameters for order-by-id endpoints
 */
export interface IOrderIdParams {
    id: string;
}

/**
 * Create a new order (admin only).
 * POST /orders
 *
 * @param request
 * @param response
 * @param next
 */
export const postCreateOrder = async (request: Request<unknown, unknown, CreateOrderRequest>, response: Response, next: NextFunction) => {
    const { userId, email, items } = request.body;

    if (!items || items.length === 0)
        return rejectResponse(response, 422, 'order - validation error', ['At least one item is required']);

    return OrderRepository.create({
        userId: new Types.ObjectId(userId),
        email,
        // Map API CartItems to the DB products array format
        products: items.map((item) => ({
            product: { _id: new Types.ObjectId(item.productId) } as IOrderDocument['products'][0]['product'],
            quantity: item.quantity,
        })),
    } as Partial<IOrderDocument>)
        .then((order) => successResponse(response, order.toObject(), 201))
        .catch((error: CastError) => next(new ExtendedError(error.kind, 500, false, [ error.message ])));
};

/**
 * Update an order (admin only) — ID provided in request body.
 * PUT /orders
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditOrder = async (request: Request<unknown, unknown, UpdateOrderRequest>, response: Response, next: NextFunction) => {
    const { id } = request.body;

    if (!id || id === '')
        return rejectResponse(response, 422, 'order - missing id', ['Order id is required']);

    return _updateOrder(id, request.body, response, next);
};

/**
 * Update an order (admin only) — ID provided as path parameter.
 * PUT /orders/:id
 *
 * @param request
 * @param response
 * @param next
 */
export const putEditOrderById = async (request: Request<IOrderIdParams, unknown, UpdateOrderByIdRequest>, response: Response, next: NextFunction) =>
    _updateOrder(request.params.id, request.body, response, next);

/**
 * Shared order update logic
 */
const _updateOrder = async (
    id: string,
    data: Partial<UpdateOrderRequest>,
    response: Response,
    next: NextFunction,
) => {
    const updates: Partial<Pick<IOrderDocument, 'status' | 'email' | 'userId'>> = {};
    if (data.status !== undefined) updates.status = data.status;
    if (data.email !== undefined) updates.email = data.email;
    if (data.userId !== undefined) updates.userId = new Types.ObjectId(data.userId);

    return OrderService.update(id, updates)
        .then((updatedOrder) => successResponse(response, updatedOrder.toObject()))
        .catch((error: CastError) => {
            if (error.message === '404')
                return rejectResponse(response, 404, 'order - not found', ['Order not found']);
            return next(new ExtendedError(error.kind, 500, false, [ error.message ]));
        });
};

/**
 * Delete an order (admin only) — ID provided in request body.
 * DELETE /orders
 *
 * @param request
 * @param response
 * @param next
 */
export const deleteOrder = (request: Request<unknown, unknown, DeleteOrderRequest>, response: Response, next: NextFunction) =>
    OrderService.remove(request.body.id)
        .then(({ success, message, errors = [] }) => {
            if (!success)
                return response.status(404).json({ success: false, error: errors[0] ?? 'not found', errors });
            return successResponse(response, undefined, 200, message);
        })
        .catch((error: CastError) => next(databaseErrorConverter(error)));

/**
 * Delete an order (admin only) — ID provided as path parameter.
 * DELETE /orders/:id
 *
 * @param request
 * @param response
 * @param next
 */
export const deleteOrderById = (request: Request<IOrderIdParams>, response: Response, next: NextFunction) =>
    deleteOrder(
        {
            ...request,
            body: { id: request.params.id },
        } as Request<unknown, unknown, DeleteOrderRequest>,
        response,
        next,
    );
