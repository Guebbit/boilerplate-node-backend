import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { t } from 'i18next';
import { userService } from '@services/users';
import { productService } from '@services/products';
import { AuthGuard } from '@nest/guards/auth.guard';
import { invalidateCache } from '@nest/decorators/invalidate-cache.decorator';
import { InvalidateCacheInterceptor } from '@nest/interceptors/invalidate-cache.interceptor';
import { ok, fail } from '@nest/utils/http';
import type { IRequestContext } from '@nest/types/request-context';

/**
 * Cart endpoints.
 */
@Controller('cart')
@UseGuards(AuthGuard)
export class CartController {
    /**
     * GET /cart
     */
    @Get('/')
    async getCart(@Req() request: IRequestContext) {
        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart);
    }

    /**
     * GET /cart/summary
     */
    @Get('/summary')
    async getCartSummary(@Req() request: IRequestContext) {
        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart.summary);
    }

    /**
     * POST /cart
     */
    @Post('/')
    async addCartItem(@Req() request: IRequestContext, @Body() body: Record<string, unknown>) {
        const productId = String(body.productId ?? '');
        const quantity = Number(body.quantity ?? 0);

        if (!productId || quantity < 1)
            fail(422, 'upsertCartItem - invalid data', [t('generic.error-invalid-data')]);

        const product = await productService.getById(productId);
        if (!product) fail(404, 'Not Found', [t('ecommerce.product-not-found')]);

        await userService.cartItemSetById(request.user!, productId, quantity);
        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart, 200, t('ecommerce.product-added-to-cart'));
    }

    /**
     * PUT /cart/:productId
     */
    @Put('/:productId')
    async updateCartItem(
        @Req() request: IRequestContext,
        @Param('productId') productId: string,
        @Body() body: Record<string, unknown>
    ) {
        const quantity = Number(body.quantity ?? 0);
        if (quantity < 1)
            fail(422, 'updateCartItemById - invalid quantity', [t('generic.error-invalid-data')]);

        await userService.cartItemSetById(request.user!, productId, quantity);
        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart);
    }

    /**
     * DELETE /cart/:productId
     */
    @Delete('/:productId')
    async removeCartItem(@Req() request: IRequestContext, @Param('productId') productId: string) {
        const existing = request.user!.cart.items.find((item) => item.product.equals(productId));
        if (!existing) fail(404, 'Not Found', [t('ecommerce.product-not-found')]);

        await userService.cartItemRemoveById(request.user!, productId);
        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart);
    }

    /**
     * DELETE /cart
     */
    @Delete('/')
    async clearCart(@Req() request: IRequestContext, @Body() body: Record<string, unknown>) {
        const productId = String(body.productId ?? '');
        await (
            productId
                ? userService.cartItemRemoveById(request.user!, productId)
                : userService.cartRemove(request.user!)
        );

        const cart = await userService.cartGetWithSummary(request.user!);
        return ok(cart);
    }

    /**
     * POST /cart/checkout
     */
    @Post('/checkout')
    @invalidateCache(['orders'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async checkout(@Req() request: IRequestContext) {
        const result = await userService.orderConfirm(request.user!);
        if (!result.success) fail(result.status, result.message, result.errors);

        return ok({ order: result.data, message: t('ecommerce.order-creation-success') }, 201);
    }
}
