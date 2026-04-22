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
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import { t } from 'i18next';
import { Types } from 'mongoose';
import { productService } from '@services/products';
import { extractId, extractPagination } from '@utils/helpers-request';
import { deleteFile } from '@utils/helpers-filesystem';
import { AuthGuard } from '@nest/guards/auth.guard';
import { AdminGuard } from '@nest/guards/admin.guard';
import { cacheable } from '@nest/decorators/cacheable.decorator';
import { invalidateCache } from '@nest/decorators/invalidate-cache.decorator';
import { CacheResponseInterceptor } from '@nest/interceptors/cache-response.interceptor';
import { InvalidateCacheInterceptor } from '@nest/interceptors/invalidate-cache.interceptor';
import { ok, fail } from '@nest/utils/http';
import type { IRequestContext } from '@nest/types/request-context';
import { parseMultipartImageRequest } from '@nest/utils/multipart';
import { toBooleanFlag, toNumberOrUndefined } from '@nest/utils/parsing';

/**
 * Product endpoints.
 */
@Controller('products')
export class ProductsController {
    /**
     * GET /products
     */
    @Get('/')
    @cacheable(3600, ['products'])
    @UseInterceptors(CacheResponseInterceptor)
    async getProducts(@Req() request: IRequestContext, @Query() query: Record<string, string>) {
        return this.searchProducts(request, query);
    }

    /**
     * POST /products/search
     */
    @Post('/search')
    async searchProductsPost(
        @Req() request: IRequestContext,
        @Body() body: Record<string, unknown>,
        @Query() query: Record<string, string>
    ) {
        return this.searchProducts(request, query, body);
    }

    private async searchProducts(
        request: IRequestContext,
        query: Record<string, string>,
        body: Record<string, unknown> = {}
    ) {
        const { page, pageSize } = extractPagination({
            page: body.page as string | number | undefined,
            pageSize: body.pageSize as string | number | undefined
        });

        try {
            const result = await productService.search(
                {
                    id: extractId(
                        undefined,
                        body.id as string | undefined,
                        query.id as string | undefined
                    ),
                    page,
                    pageSize,
                    text: (body.text as string | undefined) ?? query.text,
                    minPrice: toNumberOrUndefined(body.minPrice ?? query.minPrice),
                    maxPrice: toNumberOrUndefined(body.maxPrice ?? query.maxPrice)
                },
                request.user?.admin === true
            );

            return ok(result);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            fail(500, 'Unknown Error', [String((error as Error).message)]);
        }
    }

    /**
     * GET /products/:id
     */
    @Get('/:id')
    @cacheable(3600, ['products'])
    @UseInterceptors(CacheResponseInterceptor)
    async getProductItem(@Req() request: IRequestContext, @Param('id') id: string) {
        try {
            const product = await productService.getById(id, request.user?.admin === true);
            if (!product) fail(404, 'Not Found', [t('ecommerce.product-not-found')]);
            return ok(product);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'getProduct - not found', [t('ecommerce.product-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }

    /**
     * POST /products
     */
    @Post('/')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['products'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async createProduct(@Req() request: IRequestContext) {
        return this.writeProduct(request, false);
    }

    /**
     * PUT /products
     */
    @Put('/')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['products'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateProductNoId(@Req() request: IRequestContext) {
        return this.writeProduct(request, true);
    }

    /**
     * PUT /products/:id
     */
    @Put('/:id')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['products'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async updateProduct(@Req() request: IRequestContext, @Param('id') id: string) {
        return this.writeProduct(request, true, id);
    }

    private async writeProduct(request: IRequestContext, isUpdate: boolean, pathId?: string) {
        const { body, imageUrlRaw, imageUrl } = await parseMultipartImageRequest(request);
        const deleteUpload = () => (imageUrlRaw ? deleteFile(imageUrlRaw) : Promise.resolve(true));
        const id = pathId ?? (body.id as string | undefined);

        const payload = {
            ...body,
            imageUrl,
            active: toBooleanFlag(body.active)
        };

        const errors = productService.validateData(payload as never);
        if (errors.length > 0) {
            await deleteUpload();
            fail(422, 'writeProduct - validation failed', errors);
        }

        try {
            if (!id) {
                if (isUpdate) {
                    await deleteUpload();
                    fail(422, 'updateProduct - missing id', [t('generic.error-missing-data')]);
                }

                const product = await productService.create(payload as never);
                return ok(product.toObject(), 201);
            }

            const product = await productService.update(id, payload as never);
            return ok(product.toObject());
        } catch (error) {
            if (error instanceof HttpException) throw error;
            await deleteUpload();
            if ((error as Error).message === '404')
                fail(404, 'Not Found', [t('ecommerce.product-not-found')]);
            fail(500, 'Internal Server Error', [String((error as Error).message)]);
        }
    }

    /**
     * DELETE /products
     */
    @Delete('/')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['products'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteProductNoId(
        @Body() body: Record<string, unknown>,
        @Query() query: Record<string, unknown>
    ) {
        return this.deleteProduct(body.id as string | undefined, body, query);
    }

    /**
     * DELETE /products/:id
     */
    @Delete('/:id')
    @UseGuards(AuthGuard, AdminGuard)
    @invalidateCache(['products'])
    @UseInterceptors(InvalidateCacheInterceptor)
    async deleteProductById(
        @Param('id') id: string,
        @Body() body: Record<string, unknown>,
        @Query() query: Record<string, unknown>
    ) {
        return this.deleteProduct(id, body, query);
    }

    private async deleteProduct(
        id: string | undefined,
        body: Record<string, unknown>,
        query: Record<string, unknown>
    ) {
        const effectiveId = id ?? (body.id as string | undefined);

        if (!effectiveId || !Types.ObjectId.isValid(effectiveId))
            fail(422, 'deleteProduct - missing id', [t('generic.error-missing-data')]);
        const targetId = effectiveId as string;

        try {
            const result = await productService.remove(
                targetId,
                toBooleanFlag(query.hardDelete ?? body.hardDelete)
            );

            if (!result.success) fail(result.status, result.message, result.errors);
            return ok(undefined, 200, result.message);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            const castError = error as { kind?: string; message?: string };
            if (castError.message === '404' || castError.kind === 'ObjectId')
                fail(404, 'deleteProduct - not found', [t('ecommerce.product-not-found')]);
            fail(500, 'Unknown Error', [String(castError.message)]);
        }
    }
}
