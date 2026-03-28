import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { t } from 'i18next';
import { Types } from 'mongoose';
import OrderService from '@services/orders';
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations-fastify';
import { successResponse, rejectResponse } from '@utils/response-fastify';
import type {
    SearchOrdersRequest,
    CreateOrderRequest,
    UpdateOrderRequest,
    UpdateOrderByIdRequest,
    DeleteOrderRequest,
} from '@api/api';
import type { FastifyRequest } from 'fastify';

/**
 * Helper: build a $match scope that restricts non-admin users to their own orders.
 */
const userScope = (request: FastifyRequest): Record<string, unknown> | undefined =>
    request.user?.admin
        ? undefined
        : { userId: new Types.ObjectId((request.user?._id as Types.ObjectId).toString()) };

/**
 * Orders routes mounted at /orders (all require authentication).
 */
const orderRoutes: FastifyPluginAsync = async (fastify) => {

    // All order routes require authentication
    fastify.addHook('preHandler', getAuth);
    fastify.addHook('preHandler', isAuth);

    /**
     * POST /orders/search
     * Search orders via JSON body.
     * Non-admin users see only their own orders.
     * Declared before /:id to avoid matching "search" as an id.
     */
    fastify.post('/search', async (request, reply) => {
        const body = (request.body ?? {}) as SearchOrdersRequest;
        const result = await OrderService.search(body, userScope(request));
        successResponse(reply, result);
    });

    /**
     * GET /orders
     * List/search orders via query parameters.
     * Non-admin users see only their own orders.
     */
    fastify.get('/', async (request, reply) => {
        const { id, page, pageSize, userId, productId, email } = request.query as Record<string, string | undefined>;
        const filters: SearchOrdersRequest = {
            id,
            page: page ? Number(page) : undefined,
            pageSize: pageSize ? Number(pageSize) : undefined,
            userId,
            productId,
            email,
        };
        const result = await OrderService.search(filters, userScope(request));
        successResponse(reply, result);
    });

    /**
     * POST /orders
     * Create a new order from a payload (admin only).
     */
    fastify.post('/', { preHandler: [isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as CreateOrderRequest;
        if (!body.userId || !body.email || !body.items?.length) {
            rejectResponse(reply, 422, 'createOrder - invalid data', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.create(body.userId, body.email, body.items);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, result.data, 201);
    });

    /**
     * PUT /orders
     * Update an order by id in the request body (admin only).
     */
    fastify.put('/', { preHandler: [isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as UpdateOrderRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'updateOrder - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.update(body.id, { ...body, status: body.status as string | undefined });
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, result.data);
    });

    /**
     * DELETE /orders
     * Delete an order by id in the request body (admin only).
     */
    fastify.delete('/', { preHandler: [isAdmin] }, async (request, reply) => {
        const body = (request.body ?? {}) as DeleteOrderRequest;
        if (!body.id) {
            rejectResponse(reply, 422, 'deleteOrder - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.remove(body.id);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });

    /**
     * GET /orders/:id/invoice
     * Generate and return a PDF invoice for the order.
     * Must be declared before /:id.
     */
    fastify.get('/:id/invoice', async (request, reply) => {
        const { id } = request.params as { id: string };
        const order = await OrderService.getById(id, userScope(request));
        if (!order) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.order-not-found')]);
            return;
        }

        try {
            const ejs = await import('ejs');
            const puppeteer = await import('puppeteer-core');

            const templatePath = path.resolve('views', 'templates-files', 'invoice-order-file.ejs');
            const html = await ejs.renderFile(templatePath, {
                order,
                pageMetaTitle: `Invoice - Order ${String(order._id)}`,
            });

            const browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
            const page = await browser.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });
            const pdf = await page.pdf({ format: 'A4' });
            await browser.close();

            reply
                .status(200)
                .header('Content-Type', 'application/pdf')
                .header('Content-Disposition', `attachment; filename="invoice-${String(order._id)}.pdf"`)
                .send(pdf);
        } catch (error) {
            rejectResponse(reply, 500, 'Invoice generation failed', [(error as Error).message]);
        }
    });

    /**
     * GET /orders/:id
     * Get a single order by path id.
     * Non-admin users can only access their own orders.
     */
    fastify.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string };
        const order = await OrderService.getById(id, userScope(request));
        if (!order) {
            rejectResponse(reply, 404, 'Not Found', [t('ecommerce.order-not-found')]);
            return;
        }
        successResponse(reply, order);
    });

    /**
     * PUT /orders/:id
     * Update an order by path id (admin only).
     */
    fastify.put('/:id', { preHandler: [isAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = (request.body ?? {}) as UpdateOrderByIdRequest;
        const result = await OrderService.update(id, { ...body, status: body.status as string | undefined });
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, result.data);
    });

    /**
     * DELETE /orders/:id
     * Delete an order by path id (admin only).
     */
    fastify.delete('/:id', { preHandler: [isAdmin] }, async (request, reply) => {
        const { id } = request.params as { id: string };
        const result = await OrderService.remove(id);
        if (!result.success) {
            rejectResponse(reply, result.status, result.message, result.errors);
            return;
        }
        successResponse(reply, undefined, 200, result.message);
    });
};

export default orderRoutes;
