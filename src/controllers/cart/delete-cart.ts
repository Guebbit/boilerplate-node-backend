import type { Request, Response } from 'express';
import { cartService } from '@services/cart';
import { successResponse } from '@utils/response';
import type { RemoveCartItemRequest } from '@api/model/removeCartItemRequest';

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 * If a productId is provided in the body, only that item is removed instead.
 */
export const deleteCart = (
    request: Request<unknown, unknown, RemoveCartItemRequest>,
    response: Response
) => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const productId = String(request.body.productId);

    // Remove specific item or entire cart
    return (productId
        ? cartService.cartItemRemoveById(user, productId)
        : cartService.cartRemove(user)
    )
        .then(() => cartService.cartGetWithSummary(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};
