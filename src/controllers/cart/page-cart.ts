import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { ICartItem } from "@models/users";
import UserService from "@services/users";

/**
 * Compute cart summary from populated cart items
 */
const buildSummary = (items: ICartItem[], currency = 'USD') => {
    // After populate(), item.product is the full product document
    const total = items.reduce((sum, item) => {
        const price = (item.product as unknown as { price?: number }).price ?? 0;
        return sum + (price * item.quantity);
    }, 0);
    return {
        itemsCount: items.length,
        totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
        total,
        currency,
    };
};

/**
 * Get cart of current user with summary
 * GET /cart
 *
 * @param request
 * @param response
 * @param next
 */
export const pageCart = (request: Request, response: Response, next: NextFunction) =>
    // isAuth ensures request.user is set
    UserService.cartGet(request.user!)
        .then((items) =>
            successResponse(response, {
                items: items.map((item) => ({
                    productId: (item.product as unknown as { _id: { toString(): string } })._id?.toString() ?? item.product.toString(),
                    quantity: item.quantity,
                })),
                summary: buildSummary(items),
            })
        )
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));