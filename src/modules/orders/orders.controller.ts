import path from 'node:path';
import { Controller, Get, Post, Put, Delete, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import { Types } from 'mongoose';
import OrderService from '@services/orders';
import { successResponse, rejectResponse } from '@utils/response';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { AdminGuard } from '@guards/admin.guard';
import type {
    SearchOrdersRequest,
    CreateOrderRequest,
    UpdateOrderRequest,
    UpdateOrderByIdRequest,
    DeleteOrderRequest,
} from '@api/api';
import type { IUserDocument } from '@models/users';

/**
 * Helper: build a $match scope that restricts non-admin users to their own orders.
 */
const userScope = (request: Request): Record<string, unknown> | undefined =>
    request.user?.admin
        ? undefined
        : { userId: new Types.ObjectId((request.user?._id as Types.ObjectId).toString()) };

/**
 * Orders controller – all routes require authentication; writes are admin-only.
 * Replaces src/controllers/orders.ts + src/routes/orders.ts.
 */
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    /**
     * POST /orders/search
     * Search orders via JSON body.
     * Non-admin users see only their own orders.
     * Declared before /:id to prevent "search" from being captured as an id param.
     */
    @Post('search')
    async searchOrders(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as SearchOrdersRequest;
        const result = await OrderService.search(body, userScope(request));
        successResponse(response, result);
    }

    /**
     * GET /orders
     * List/search orders via query parameters.
     * Non-admin users see only their own orders.
     */
    @Get()
    async listOrders(@Req() request: Request, @Res() response: Response): Promise<void> {
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
        successResponse(response, result);
    }

    /**
     * POST /orders
     * Create a new order from a payload (admin).
     */
    @Post()
    @UseGuards(AdminGuard)
    async createOrder(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as CreateOrderRequest;
        if (!body.userId || !body.email || !body.items?.length) {
            rejectResponse(response, 422, 'createOrder - invalid data', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.create(body.userId, body.email, body.items);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, result.data, 201);
    }

    /**
     * PUT /orders
     * Update an order by id in the request body (admin).
     */
    @Put()
    @UseGuards(AdminGuard)
    async updateOrder(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateOrderRequest;
        if (!body.id) {
            rejectResponse(response, 422, 'updateOrder - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.update(body.id, { ...body, status: body.status as string | undefined });
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, result.data);
    }

    /**
     * DELETE /orders
     * Delete an order by id in the request body (admin).
     */
    @Delete()
    @UseGuards(AdminGuard)
    async deleteOrder(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as DeleteOrderRequest;
        if (!body.id) {
            rejectResponse(response, 422, 'deleteOrder - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await OrderService.remove(body.id);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    }

    /**
     * GET /orders/:id/invoice
     * Generate and return a PDF invoice for the order.
     * Declared before /:id so the more specific path is matched first.
     */
    @Get(':id/invoice')
    async getOrderInvoice(@Req() request: Request, @Res() response: Response): Promise<void> {
        const order = await OrderService.getById(String(request.params.id), userScope(request));
        if (!order) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
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

            response
                .status(200)
                .setHeader('Content-Type', 'application/pdf')
                .setHeader('Content-Disposition', `attachment; filename="invoice-${String(order._id)}.pdf"`)
                .send(pdf);
        } catch (error) {
            rejectResponse(response, 500, 'Invoice generation failed', [(error as Error).message]);
        }
    }

    /**
     * GET /orders/:id
     * Get a single order by path id.
     * Non-admin users can only access their own orders.
     */
    @Get(':id')
    async getOrderById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const order = await OrderService.getById(String(request.params.id), userScope(request));
        if (!order) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.order-not-found')]);
            return;
        }
        successResponse(response, order);
    }

    /**
     * PUT /orders/:id
     * Update an order by path id (admin).
     */
    @Put(':id')
    @UseGuards(AdminGuard)
    async updateOrderById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateOrderByIdRequest;
        const result = await OrderService.update(String(request.params.id), { ...body, status: body.status as string | undefined });
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, result.data);
    }

    /**
     * DELETE /orders/:id
     * Delete an order by path id (admin).
     */
    @Delete(':id')
    @UseGuards(AdminGuard)
    async deleteOrderById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const result = await OrderService.remove(String(request.params.id));
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    }
}
