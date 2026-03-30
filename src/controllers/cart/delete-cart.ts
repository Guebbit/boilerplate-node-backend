import type { Request, Response } from 'express';
import UserService from '@services/users';
import { successResponse } from '@utils/response';
import { buildCartResponse } from './helpers';

/**
 * DELETE /cart
 * Clears the entire cart, or removes a specific product if productId is in the body.
 */
const deleteCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = (request.body ?? {}) as { productId?: string };

    await (productId ? UserService.cartItemRemoveById(user, productId) : UserService.cartRemove(user));

    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

export default deleteCart;
