import type { Request, Response } from 'express';
import { t } from 'i18next';
import UserService from '@services/users';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import type { UpsertCartItemRequest, UpdateCartItemByIdRequest } from '@api/api';

/**
 * Helper: build a cart response payload from a user document.
 * Populates cart and computes the summary.
 */
const buildCartResponse = async (user: import('@models/users').IUserDocument) => {
    const items = await UserService.cartGet(user);
    let totalQuantity = 0;
    let total = 0;
    for (const item of items) {
        totalQuantity += item.quantity;
        const product = item.product as unknown as { price?: number };
        total += (product?.price ?? 0) * item.quantity;
    }
    const summary = {
        itemsCount: items.length,
        totalQuantity,
        total,
    };
    return { items, summary };
};

/**
 * GET /cart
 * Returns all items in the authenticated user's cart along with a summary.
 */
export const getCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

/**
 * GET /cart/summary
 * Returns a lightweight summary of the authenticated user's cart.
 */
export const getCartSummary = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const cart = await buildCartResponse(user);
    successResponse(response, cart.summary);
};

/**
 * POST /cart
 * Add or set a product in the cart. Sets the quantity (replaces existing).
 */
export const upsertCartItem = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId, quantity } = request.body as UpsertCartItemRequest;

    if (!productId || !quantity || quantity < 1) {
        rejectResponse(response, 422, 'upsertCartItem - invalid data', [t('generic.error-invalid-data')]);
        return;
    }

    const product = await ProductService.getById(productId);
    if (!product) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemSetById(user, productId, quantity);
    // Reload fresh user data after mutation
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

/**
 * PUT /cart/:productId
 * Set the quantity of a specific cart item. Returns the updated cart.
 */
export const updateCartItemById = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = request.params;
    const productIdString = String(productId);
    const { quantity } = request.body as UpdateCartItemByIdRequest;

    if (!quantity || quantity < 1) {
        rejectResponse(response, 422, 'updateCartItemById - invalid quantity', [t('generic.error-invalid-data')]);
        return;
    }

    const existing = user.cart.items.find(i => i.product.equals(productIdString));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemSetById(user, productIdString, quantity);
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

/**
 * DELETE /cart
 * Clears the entire cart, or removes a specific product if productId is in the body.
 */
export const clearCart = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = (request.body ?? {}) as { productId?: string };

    await (productId ? UserService.cartItemRemoveById(user, productId) : UserService.cartRemove(user));

    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

/**
 * DELETE /cart/:productId
 * Removes a specific product from the cart. Returns the updated cart.
 */
export const removeCartItem = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const { productId } = request.params;
    const productIdString = String(productId);

    const existing = user.cart.items.find(i => i.product.equals(productIdString));
    if (!existing) {
        rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
        return;
    }

    await UserService.cartItemRemoveById(user, productIdString);
    await user.populate('cart.items.product');
    const cart = await buildCartResponse(user);
    successResponse(response, cart);
};

/**
 * POST /cart/checkout
 * Converts the cart into an order and clears the cart.
 */
export const checkout = async (request: Request, response: Response): Promise<void> => {
    const user = request.user!;
    const result = await UserService.orderConfirm(user);
    if (!result.success) {
        rejectResponse(response, result.status, result.message, result.errors);
        return;
    }
    successResponse(response, { order: result.data, message: t('ecommerce.order-creation-success') }, 201);
};
