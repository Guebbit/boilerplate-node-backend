/**
 * @module
 * Refusals more than one cart service answers with, kept in one leaf so the code and the message
 * cannot drift between the doors that raise them.
 */

import { t } from '@infrastructure/i18n';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { ERROR_CODES } from '@api/error-codes';

/**
 * The shipping method the caller named is not one this deployment offers. Raised when it is
 * chosen on the basket and again at checkout, with the same code and message.
 */
export const shippingMethodNotFound = (): ResponseReject =>
    generateReject(404, [
        {
            code: ERROR_CODES.CART_SHIPPING_METHOD_NOT_FOUND,
            message: t('cart.shipping-method-not-found')
        }
    ]);
