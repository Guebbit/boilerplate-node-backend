import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    Param,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import path from 'node:path';
import ejs from 'ejs';
import puppeteer from 'puppeteer-core';
import { t } from 'i18next';
import { Types } from 'mongoose';
import type { FastifyReply } from 'fastify';
import { orderService } from '@services/orders';
import { userService } from '@services/users';
import { extractId, extractPagination } from '@utils/helpers-request';
import { nodemailer } from '@utils/nodemailer';
import { AuthGuard } from '@nest/guards/auth.guard';
import { AdminGuard } from '@nest/guards/admin.guard';
import { cacheable } from '@nest/decorators/cacheable.decorator';
import { invalidateCache } from '@nest/decorators/invalidate-cache.decorator';
import { CacheResponseInterceptor } from '@nest/interceptors/cache-response.interceptor';
import { InvalidateCacheInterceptor } from '@nest/interceptors/invalidate-cache.interceptor';
import { ok, fail } from '@nest/utils/http';
import type { IRequestContext } from '@nest/types/request-context';

/**
 * Order endpoints.
 */
@Controller('orders')
@UseGuards(AuthGuard)
export class OrdersController {
    /**
     * Build user scope for non-admin users.
     */
    private getUserScope(request: IRequestContext): Record<string, unknown> | undefined {
        return request.user?.admin
            ? undefined
            : {
                  userId:
                      request.user?._id instanceof Types.ObjectId
                          ? request.user._id
                          : new Types.ObjectId(String(request.user?._id))
              };
    }

    /**
     * GET /orders
     */
    @Get('/')
    @cacheable(3600, ['orders'])
    @UseInterceptors(CacheResponseInterceptor)
    async getOrders(
        @Req() request: IRequestContext,
        @Query() query: Record<string, string>,
        @Body() body: Record<string, unknown>
    ) {
        const { page, pageSize } = extractPagination({
            page: body.page as string | number | undefined,
            pageSize: body.pageSize as string | number | undefined
        });

        try {
            const result = await orderService.search(
                {
                    id: extractId(
                        undefined,
                        body.id as string | undefined,
                        query.id as string | undefined
                    ),
                    page,
                    pageSize,
                    userId: (body.userId as string | undefined) ?? query.userId,
                    productId: (body.productId as string | undefined) ?? query.productId,
                    email: (body.email as string | undefined) ?? query.email
                },
                this.getUserScope(request)
            );

            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            fail(500, 'Unknown Error', [String((error as Error).message)]);
        }
    }

    /**
     * POST /orders/search
     */
    @Post('/search')
    async searchOrders(
        @Req() request: IRequestContext,
        @Body() body: Record<string, unknown>,
        @Query() query: Record<string, string>
    ) {
        return this.getOrders(request, query, body);
    }

    /**
     * GET /orders/:id
     */
    @Get('/:id')
    @cacheable(3600, ['orders'])
    @UseInterceptors(CacheResponseInterceptor)
    async getOrder(@Req() request: IRequestContext, @Param('id') id: string) {
        try {
            const order = await orderService.getById(id, this.getUserScope(request));
            if (!order) fail(404, 'Not Found', [t('ecommerce.order-not-found')]);
            return ok(order);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'getOrder - not found', [t('ecommerce.order-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }

    /**
     * GET /orders/:id/invoice
     */
    @Get('/:id/invoice')
    async invoice(
        @Req() request: IRequestContext,
        @Res({ passthrough: false }) response: FastifyReply,
        @Param('id') id: string
    ) {
        try {
            const order = await orderService.getById(id, this.getUserScope(request));
            if (!order) fail(404, 'Not Found', [t('ecommerce.order-not-found')]);
            const targetOrder = order!;

            const templatePath = path.resolve('views', 'templates-files', 'invoice-order-file.ejs');
            const html = await ejs.renderFile(templatePath, {
                order: targetOrder,
                pageMetaTitle: `Invoice - Order ${String(targetOrder._id)}`
            });

            const browser = await puppeteer.launch({
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH ?? '/usr/bin/chromium-browser',
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });

            try {
                const page = await browser.newPage();
                await page.setContent(html, { waitUntil: 'networkidle0' });
                const pdf = await page.pdf({ format: 'A4' });

                return response
                    .status(200)
                    .header('Content-Type', 'application/pdf')
                    .header(
                        'Content-Disposition',
                        `attachment; filename="invoice-${String(targetOrder._id)}.pdf"`
                    )
                    .send(pdf);
            } finally {
                await browser.close();
            }
        } catch (error) {
            if (error instanceof HttpException) throw error;
            fail(500, 'Invoice generation failed', [String((error as Error).message)]);
        }
    }

    /**
     * POST /orders
     */
    @Post('/')
    @UseGuards(AdminGuard)
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async createOrder(@Req() request: IRequestContext, @Body() body: Record<string, unknown>) {
        if (!body.userId || !body.email || !Array.isArray(body.items) || body.items.length === 0)
            fail(422, 'createOrder - invalid data', [t('generic.error-missing-data')]);

        const result = await userService.orderConfirm(request.user!);
        if (!result.success) fail(result.status, result.message, result.errors);

        void nodemailer(
            {
                to: request.user!.email,
                subject: 'Order confirmed'
            },
            'email-order-confirm.ejs',
            {
                pageMetaTitle: 'Order confirmed',
                pageMetaLinks: [],
                name: request.user!.username
            }
        );

        return ok(result.data, 201);
    }

    /**
     * PUT /orders
     */
    @Put('/')
    @UseGuards(AdminGuard)
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateOrderNoId(@Body() body: Record<string, unknown>) {
        return this.updateOrder(undefined, body);
    }

    /**
     * PUT /orders/:id
     */
    @Put('/:id')
    @UseGuards(AdminGuard)
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateOrderById(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.updateOrder(id, body);
    }

    private async updateOrder(id: string | undefined, body: Record<string, unknown>) {
        const effectiveId = id ?? (body.id as string | undefined);
        if (!effectiveId) fail(422, 'updateOrder - missing id', [t('generic.error-missing-data')]);
        const targetId = effectiveId as string;

        try {
            const result = await orderService.update(targetId, {
                ...body,
                status: body.status as string | undefined
            });

            if (!result.success) fail(result.status, result.message, result.errors);
            return ok(result.data);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            if ((error as Error).message === '404')
                fail(404, 'Not Found', [t('ecommerce.order-not-found')]);
            fail(500, 'Internal Server Error', [String((error as Error).message)]);
        }
    }

    /**
     * DELETE /orders
     */
    @Delete('/')
    @UseGuards(AdminGuard)
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteOrderNoId(@Body() body: Record<string, unknown>) {
        return this.deleteOrder(undefined, body);
    }

    /**
     * DELETE /orders/:id
     */
    @Delete('/:id')
    @UseGuards(AdminGuard)
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteOrderById(@Param('id') id: string, @Body() body: Record<string, unknown>) {
        return this.deleteOrder(id, body);
    }

    private async deleteOrder(id: string | undefined, body: Record<string, unknown>) {
        const effectiveId = id ?? (body.id as string | undefined);

        if (!effectiveId || !Types.ObjectId.isValid(effectiveId))
            fail(422, 'deleteOrder - missing id', [t('generic.error-missing-data')]);
        const targetId = effectiveId as string;

        try {
            const result = await orderService.remove(targetId);
            if (!result.success) fail(result.status, result.message, result.errors);
            return ok(undefined, 200, result.message);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'deleteOrders - not found', [t('ecommerce.order-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }
}
