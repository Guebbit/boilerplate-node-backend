import type { FastifyPluginAsync } from 'fastify';
import { t } from 'i18next';
import UserService from '@services/users';
import ProductService from '@services/products';
import { getAuth, isAuth } from '@middlewares/authorizations-fastify';
import { successResponse, rejectResponse } from '@utils/response-fastify';
import type { UpsertCartItemRequest, UpdateCartItemByIdRequest } from '@api/api';
import type { IUserDocument } from '@models/users';

/**
 * Helper: build a cart response payload from a user document.
 * Populates cart and computes the summary.
 */
const buildCartResponse = async (user: IUserDocument) => {
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
 * Cart routes mounted at /cart (all require authentication).
 */
const cartRoutes: FastifyPluginAsync = async (fastify) => {

    // All cart routes require authentication
    fastify.addHook('preHandler', getAuth);
    fastify.addHook('preHandler', isAuth);

    /**
     * GET /cart/summary
     * Returns a lightweight summary of the authenticated user's cart.
     * Declared before /:productId.
     */
    fastify.get('/summary', async (request, reply) => {
        const cart = await buildCartResponse(request.user!);
        successResponse(reply, cart.summary);
    });

    /**
     * POST /cart/checkout
     * Converts the cart into an order and clears the cart.
     * Declared before /:productId.
     */
    fastify.post('/checkout', async (request, reply) => {
        const result = await UserService.orderConfirm(request.user!);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, { order: result.data, message: t('ecommerce.order-creation-success') }, 201);
    });

    /**
     * GET /cart
     * Returns all items in the authenticated user's cart along with a summary.
     */
    fastify.get('/', async (request, reply) => {
        const cart = await buildCartResponse(request.user!);
        successResponse(reply, cart);
    });

    /**
     * POST /cart
     * Add or set a product in the cart. Sets the quantity (replaces existing).
     */
    fastify.post('/', async (request, reply) => {
        const user = request.user!;
        const { productId, quantity } = (request.body ?? {}) as UpsertCartItemRequest;

        if (!productId || !quantity || quantity < 1) {
            rejectResponse(reply, 422, 'upsertCartItem - invalid data', [t('generic.error-invalid-data')]);
            return;
        }

        const product = await ProductService.getById(productId);
        if (!product) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }

        await UserService.cartItemSetById(user, productId, quantity);
        await user.populate('cart.items.product');
        const cart = await buildCartResponse(user);
        successResponse(reply, cart);
    });

    /**
     * DELETE /cart
     * Clears the entire cart, or removes a specific product if productId is in the body.
     */
    fastify.delete('/', async (request, reply) => {
        const user = request.user!;
        const { productId } = ((request.body ?? {}) as { productId?: string });
        await (productId ? UserService.cartItemRemoveById(user, productId) : UserService.cartRemove(user));
        await user.populate('cart.items.product');
        const cart = await buildCartResponse(user);
        successResponse(reply, cart);
    });

    /**
     * PUT /cart/:productId
     * Set the quantity of a specific cart item. Returns the updated cart.
     */
    fastify.put('/:productId', async (request, reply) => {
        const user = request.user!;
        const { productId } = request.params as { productId: string };
        const { quantity } = (request.body ?? {}) as UpdateCartItemByIdRequest;

        if (!quantity || quantity < 1) {
            rejectResponse(reply, 422, 'updateCartItemById - invalid quantity', [t('generic.error-invalid-data')]);
            return;
        }

        const existing = user.cart.items.find(i => i.product.equals(productId));
        if (!existing) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }

        await UserService.cartItemSetById(user, productId, quantity);
        await user.populate('cart.items.product');
        const cart = await buildCartResponse(user);
        successResponse(reply, cart);
    });

    /**
     * DELETE /cart/:productId
     * Removes a specific product from the cart. Returns the updated cart.
     */
    fastify.delete('/:productId', async (request, reply) => {
        const user = request.user!;
        const { productId } = request.params as { productId: string };

        const existing = user.cart.items.find(i => i.product.equals(productId));
        if (!existing) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }

        await UserService.cartItemRemoveById(user, productId);
        await user.populate('cart.items.product');
        const cart = await buildCartResponse(user);
        successResponse(reply, cart);
    });
};

export default cartRoutes;
