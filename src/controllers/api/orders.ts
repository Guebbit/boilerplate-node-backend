import type { Request, Response, NextFunction } from 'express';
import type { SearchOrdersRequest } from '@api/api';
import { Types } from 'mongoose';
import OrderService from '@services/orders';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /orders
 * List orders.
 * - Admin: can see all orders (with optional filters)
 * - Regular user: sees only their own orders
 */
export const listOrders = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { page, pageSize, id, email, productId } = request.query;
        const isAdmin = request.user?.admin ?? false;

        const filters: SearchOrdersRequest = {
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            id: id as string | undefined,
            email: email as string | undefined,
            productId: productId as string | undefined,
        };

        // Non-admin users can only see their own orders
        const scope = isAdmin
            ? undefined
            : { userId: request.user!._id as Types.ObjectId };

        const result = await OrderService.search(filters, scope);

        successResponse(response, result);
    } catch (error) {
        next(error);
    }
};

/**
 * GET /orders/:id
 * Get a single order by ID.
 * Admin can see any order; regular users can only see their own.
 */
export const getOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { id } = request.params;
        const isAdmin = request.user?.admin ?? false;

        const scope = isAdmin
            ? undefined
            : { userId: request.user!._id as Types.ObjectId };

        const result = await OrderService.search({ id: id as string | undefined }, scope);

        if (!result.items || result.items.length === 0) {
            rejectResponse(response, 404, 'Order not found');
            return;
        }

        successResponse(response, result.items[0]);
    } catch (error) {
        next(error);
    }
};

/**
 * POST /orders
 * Create a new order from the current user's cart, then empty the cart.
 */
export const createOrder = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const result = await UserService.orderConfirm(request.user!);

        if (!result.success) {
            rejectResponse(response, 409, result.message ?? 'Failed to create order', result.errors);
            return;
        }

        successResponse(response, result.data, 201);
    } catch (error) {
        next(error);
    }
};
