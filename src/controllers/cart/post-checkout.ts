import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import { rejectResponse, successResponse } from '@utils/response';

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
const checkout = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const result = await UserService.orderConfirm(user);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, { order: result.data, message: t('ecommerce.order-creation-success') }, 201);
};

export default checkout;
