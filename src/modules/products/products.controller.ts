import { Controller, Get, Post, Put, Delete, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { t } from 'i18next';
import ProductService from '@services/products';
import { successResponse, rejectResponse } from '@utils/response';
import { JwtAuthGuard } from '@guards/jwt-auth.guard';
import { AdminGuard } from '@guards/admin.guard';
import type {
    SearchProductsRequest,
    CreateProductRequest,
    UpdateProductRequest,
    UpdateProductByIdRequest,
    DeleteProductRequest,
} from '@api/api';

/**
 * Products controller – public reads, admin writes.
 * Replaces src/controllers/products.ts + src/routes/products.ts.
 */
@Controller('products')
export class ProductsController {
    /**
     * POST /products/search
     * Search products via JSON body (public; admin sees all).
     * Declared before /:id to prevent "search" from being captured as an id param.
     */
    @Post('search')
    async searchProducts(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as SearchProductsRequest;
        const admin = request.user?.admin === true;
        const result = await ProductService.search(body, admin);
        successResponse(response, result);
    }

    /**
     * GET /products
     * List/search products via query parameters (public; admin sees all).
     */
    @Get()
    async listProducts(@Req() request: Request, @Res() response: Response): Promise<void> {
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
        successResponse(response, result);
    }

    /**
     * POST /products
     * Create a new product (admin).
     */
    @Post()
    @UseGuards(JwtAuthGuard, AdminGuard)
    async createProduct(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as CreateProductRequest;
        const errors = ProductService.validateData(body as never);
        if (errors.length > 0) {
            rejectResponse(response, 422, 'createProduct - validation failed', errors);
            return;
        }
        try {
            const product = await ProductService.create(body as never);
            successResponse(response, product.toObject(), 201);
        } catch (error) {
            rejectResponse(response, 500, 'Internal Server Error', [(error as Error).message]);
        }
    }

    /**
     * PUT /products
     * Update a product by id in the request body (admin).
     */
    @Put()
    @UseGuards(JwtAuthGuard, AdminGuard)
    async updateProduct(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateProductRequest;
        if (!body.id) {
            rejectResponse(response, 422, 'updateProduct - missing id', [t('generic.error-missing-data')]);
            return;
        }
        try {
            const product = await ProductService.update(body.id, body as never);
            successResponse(response, product.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            else
                rejectResponse(response, 500, 'Internal Server Error', [message]);
        }
    }

    /**
     * DELETE /products
     * Delete a product by id in the request body (admin).
     */
    @Delete()
    @UseGuards(JwtAuthGuard, AdminGuard)
    async deleteProduct(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as DeleteProductRequest;
        if (!body.id) {
            rejectResponse(response, 422, 'deleteProduct - missing id', [t('generic.error-missing-data')]);
            return;
        }
        const result = await ProductService.remove(body.id, body.hardDelete ?? false);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    }

    /**
     * GET /products/:id
     * Get a single product by path id (public; admin sees inactive/deleted).
     */
    @Get(':id')
    async getProductById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const admin = request.user?.admin === true;
        const product = await ProductService.getById(String(request.params.id), admin);
        if (!product) {
            rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            return;
        }
        successResponse(response, product);
    }

    /**
     * PUT /products/:id
     * Update a product by path id (admin).
     */
    @Put(':id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async updateProductById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const body = request.body as UpdateProductByIdRequest;
        try {
            const product = await ProductService.update(String(request.params.id), body as never);
            successResponse(response, product.toObject());
        } catch (error) {
            const message = (error as Error).message;
            if (message === '404')
                rejectResponse(response, 404, 'Not Found', [t('ecommerce.product-not-found')]);
            else
                rejectResponse(response, 500, 'Internal Server Error', [message]);
        }
    }

    /**
     * DELETE /products/:id
     * Delete a product by path id (admin).
     */
    @Delete(':id')
    @UseGuards(JwtAuthGuard, AdminGuard)
    async deleteProductById(@Req() request: Request, @Res() response: Response): Promise<void> {
        const hardDelete = request.query.hardDelete === 'true';
        const result = await ProductService.remove(String(request.params.id), hardDelete);
        if (!result.success) {
            rejectResponse(response, result.status, result.message, result.errors);
            return;
        }
        successResponse(response, undefined, 200, result.message);
    }
}
