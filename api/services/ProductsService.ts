/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateProductRequestMultipart } from '../models/CreateProductRequestMultipart';
import type { DeleteProductRequest } from '../models/DeleteProductRequest';
import type { Id } from '../models/Id';
import type { MessageResponse } from '../models/MessageResponse';
import type { Page } from '../models/Page';
import type { PageSize } from '../models/PageSize';
import type { Product } from '../models/Product';
import type { ProductsResponse } from '../models/ProductsResponse';
import type { SearchProductsRequest } from '../models/SearchProductsRequest';
import type { Text } from '../models/Text';
import type { UpdateProductByIdRequestMultipart } from '../models/UpdateProductByIdRequestMultipart';
import type { UpdateProductRequestMultipart } from '../models/UpdateProductRequestMultipart';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProductsService {
    /**
     * List products (paginated)
     * Returns a paginated list of products.
     * @param page 1-based page index
     * @param pageSize
     * @param text
     * @param productId
     * @param minPrice
     * @param maxPrice
     * @returns ProductsResponse Products page
     * @throws ApiError
     */
    public static listProducts(
        page?: Page,
        pageSize?: PageSize,
        text?: Text,
        productId?: Id,
        minPrice?: number,
        maxPrice?: number,
    ): CancelablePromise<ProductsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/products',
            query: {
                'page': page,
                'pageSize': pageSize,
                'text': text,
                'productId': productId,
                'minPrice': minPrice,
                'maxPrice': maxPrice,
            },
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * Create product
     * Creates a new product with optional image upload
     * @param formData
     * @returns Product Created product
     * @throws ApiError
     */
    public static createProduct(
        formData: CreateProductRequestMultipart,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/products',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Edit product
     * Updates an existing product with optional image upload
     * @param formData
     * @returns Product Updated product
     * @throws ApiError
     */
    public static updateProduct(
        formData: UpdateProductRequestMultipart,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/products',
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Delete product
     * Deletes the product identified by the `id` field in the request body. Set `hardDelete` to `true` to permanently remove the record
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteProduct(
        requestBody: DeleteProductRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/products',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Product details
     * Returns the full details of the product identified by `{id}`. Functionally equivalent to `GET /products?id={id}`.
     * @param id Resource identifier
     * @returns Product Product
     * @throws ApiError
     */
    public static getProductById(
        id: Id,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/products/{id}',
            path: {
                'id': id,
            },
            errors: {
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Edit product
     * Updates the product identified by `{id}` in the path with optional image upload. Functionally equivalent to `PUT /products` with the id in the body.
     * @param id Resource identifier
     * @param formData
     * @returns Product Updated product
     * @throws ApiError
     */
    public static updateProductById(
        id: Id,
        formData: UpdateProductByIdRequestMultipart,
    ): CancelablePromise<Product> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/products/{id}',
            path: {
                'id': id,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                401: `Unauthorized`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Delete product
     * Deletes the product identified by `{id}` in the path. Pass the `hardDelete` query parameter as `true` to permanently remove the record. Functionally equivalent to `DELETE /products`.
     * @param id Resource identifier
     * @param hardDelete
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteProductById(
        id: Id,
        hardDelete?: boolean,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/products/{id}',
            path: {
                'id': id,
            },
            query: {
                'hardDelete': hardDelete,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Search products (DTO-friendly)
     * Searches and filters products via a JSON request body. Functionally equivalent to `GET /products` with query parameters.
     * @param requestBody
     * @returns ProductsResponse Products search results
     * @throws ApiError
     */
    public static searchProducts(
        requestBody: SearchProductsRequest,
    ): CancelablePromise<ProductsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/products/search',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
}
