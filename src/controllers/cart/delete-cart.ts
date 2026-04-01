import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import type { RemoveCartItemRequest } from "@api/model/removeCartItemRequest";

/**
 * DELETE /cart
 * Remove ALL items in the user cart.
 * If a productId is provided in the body, only that item is removed instead.
 */
const deleteCart = (request: Request<unknown, unknown, RemoveCartItemRequest>, response: Response): Promise<void> => {
    // Authentication check is done before entering the route
    const user = request.user!;
    const productId = String(request.body.productId);

    // Remove specific item or entire cart
    return (
        productId ? UserService.cartItemRemoveById(user, productId) : UserService.cartRemove(user)
    )
        .then(() => UserService.cartGetWithSummary(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};

export default deleteCart;
