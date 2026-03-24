import type { Request, Response, NextFunction } from "express";
import type { CastError } from "mongoose";
import { databaseErrorConverter } from "@utils/error-helpers";
import { successResponse } from "@utils/response";
import type { ICartItem } from "@models/users";
import UserService from "@services/users";

/**
 * Get cart summary (item count, totals) without full product details
 * GET /cart/summary
 *
 * @param request
 * @param response
 * @param next
 */
export const getCartSummary = (request: Request, response: Response, next: NextFunction) =>
    // isAuth ensures request.user is set
    UserService.cartGet(request.user!)
        .then((items: ICartItem[]) => {
            const total = items.reduce((sum, item) => {
                const price = (item.product as unknown as { price?: number }).price ?? 0;
                return sum + (price * item.quantity);
            }, 0);
            return successResponse(response, {
                itemsCount: items.length,
                totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
                total,
                currency: 'USD',
            });
        })
        .catch((error: Error | CastError) => next(databaseErrorConverter(error)));
