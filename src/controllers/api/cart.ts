import type { Request, Response, NextFunction } from 'express';
import type { UpsertCartItemRequest } from '@api/api';
import ProductRepository from '@repositories/products';
import UserService from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';

/**
 * GET /cart
 * Get the current user's cart with populated product details.
 */
export const getCart = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const items = await UserService.cartGet(request.user!);
        successResponse(response, { items });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /cart
 * Set the quantity of a product in the cart.
 * If the product is not in the cart, it is added.
 */
export const setCartItem = async (
    request: Request<unknown, unknown, UpsertCartItemRequest>,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { productId, quantity } = request.body;

        const product = await ProductRepository.findOne({
            _id: productId,
            active: true,
            deletedAt: undefined,
        });

        if (!product) {
            rejectResponse(response, 404, 'Product not found');
            return;
        }

        const result = await UserService.cartItemSet(request.user!, product, quantity);

        successResponse(response, result.data);
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /cart/:productId
 * Remove a specific product from the cart.
 */
export const removeCartItem = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const productId = request.params.productId as string;

        const result = await UserService.cartItemRemoveById(request.user!, productId);

        successResponse(response, result.data);
    } catch (error) {
        next(error);
    }
};

/**
 * DELETE /cart
 * Clear all items from the cart.
 */
export const clearCart = async (
    request: Request,
    response: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const result = await UserService.cartRemove(request.user!);

        successResponse(response, result.data);
    } catch (error) {
        next(error);
    }
};
