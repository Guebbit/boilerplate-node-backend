import type { FastifyPluginAsync } from 'fastify';
import { t } from 'i18next';
import ProductService from '@services/products';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations-fastify';
import { successResponse, rejectResponse } from '@utils/response-fastify';
import type {
    SearchProductsRequest,
    CreateProductRequest,
    UpdateProductRequest,
    UpdateProductByIdRequest,
    DeleteProductRequest,
} from '@api/api';

/**
 * Products routes mounted at /products
 */
const productRoutes: FastifyPluginAsync = async (fastify) => {

    // Apply getAuth to all routes so admins get extra visibility
    fastify.addHook('preHandler', getAuth);

    /**
     * POST /products/search
     * Search products via JSON body (public; admin sees all).
     * Declared before /:id to avoid matching "search" as an id.
     */
    fastify.post('/search', async (request, reply) => {
        const body = (request.body ?? {}) as SearchProductsRequest;
        const admin = request.user?.admin === true;
        const result = await ProductService.search(body, admin);
        successResponse(reply, result);
    });

    /**
     * GET /products
     * List/search products via query parameters (public; admin sees all).
     */
    fastify.get('/', async (request, reply) => {
        const { id, page, pageSize, text, minPrice, maxPrice } = request.query as Record<string, string | undefined>;
        const admin = request.user?.admin === true;
        const filters: SearchProductsRequest = {
            id,
            text,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            minPrice: minPrice ? Number(minPrice) : undefined,
            maxPrice: maxPrice ? Number(maxPrice) : undefined,
        };
        const result = await ProductService.search(filters, admin);
        successResponse(reply, result);
    });

    /**
     * POST /products
     * Create a new product (admin only).
     */
    fastify.post('/', { preHandler: [isAuth, isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as CreateProductRequest;
        const errors = ProductService.validateData(body as never);
        if (errors.length > 0) {
            rejectResponse(reply, 422, 'createProduct - validation failed', errors);
            return;
        }
        try {
            const product = await ProductService.create(body as never);
            successResponse(reply, product.toObject(), 201);
        } catch (error) {
            rejectResponse(reply, 500, 'Internal Server Error', [(error as Error).message]);
        }
    });

    /**
     * PUT /products
     * Update a product by id in the request body (admin only).
     */
    fastify.put('/', { preHandler: [isAuth, isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as UpdateProductRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'updateProduct - missing id', [t('generic.error-missing-data')]);
            return;
        }
        try {
            const product = await ProductService.update(body.id, body as never);
            successResponse(reply, product.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            else
                rejectResponse(reply, 500, 'Internal Server Error', [message]);
        }
    });

    /**
     * DELETE /products
     * Delete a product by id in the request body (admin only).
     */
    fastify.delete('/', { preHandler: [isAuth, isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as DeleteProductRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'deleteProduct - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await ProductService.remove(body.id, body.hardDelete ?? false);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });

    /**
     * GET /products/:id
     * Get a single product by path id (public; admin sees inactive/deleted).
     */
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const admin = request.user?.admin === true;
        const product = await ProductService.getById(id, admin);
        if (!product) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }
        successResponse(reply, product);
    });

    /**
     * PUT /products/:id
     * Update a product by path id (admin only).
     */
    fastify.put('/:id', { preHandler: [isAuth, isAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as UpdateProductByIdRequest;
        try {
            const product = await ProductService.update(id, body as never);
            successResponse(reply, product.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(reply, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            else
                rejectResponse(reply, 500, 'Internal Server Error', [message]);
        }
    });

    /**
     * DELETE /products/:id
     * Delete a product by path id (admin only).
     */
    fastify.delete('/:id', { preHandler: [isAuth, isAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const hardDelete = (request.query as Record<string, string>).hardDelete === 'true';
        const result = await ProductService.remove(id, hardDelete);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });
};

export default productRoutes;
