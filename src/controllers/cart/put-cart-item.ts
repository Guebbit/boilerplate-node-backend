import type { Request, Response } from 'express';
import { t } from 'i18next';
import { userService } from '@services/users';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpdateCartItemByIdRequest } from '@types';

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const putCartItem = (
    request: Request<{ productId?: string }, unknown, UpdateCartItemByIdRequest>,
    response: Response
) => {
    const user = request.user!;
    const productId = String(request.params.productId ?? request.body.productId);

    if (!request.body.quantity || request.body.quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [
            t('generic.error-invalid-data')
        ]);
        return Promise.resolve();
    }

    return userService
        .cartItemSetById(user, productId, request.body.quantity)
        .then(() => userService.cartGetWithSummary(user))
        .then((cart) => {
            successResponse(response, cart);
        });
};
