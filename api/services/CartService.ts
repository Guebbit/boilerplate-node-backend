/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CartResponse } from '../models/CartResponse';
import type { CartSummaryResponse } from '../models/CartSummaryResponse';
import type { Id } from '../models/Id';
import type { RemoveCartItemRequest } from '../models/RemoveCartItemRequest';
import type { UpdateCartItemByIdRequest } from '../models/UpdateCartItemByIdRequest';
import type { UpsertCartItemRequest } from '../models/UpsertCartItemRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class CartService {
    /**
     * Get cart
     * Returns all items currently in the authenticated user's cart along with a computed summary
     * @returns CartResponse Cart items
     * @throws ApiError
     */
    public static getCart(): CancelablePromise<CartResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/cart',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Add/Edit cart item
     * Adds or edit a product to the authenticated user's cart. Returns the updated cart.
     * @param requestBody
     * @returns CartResponse Add/Edit to cart
     * @throws ApiError
     */
    public static upsertCartItem(
        requestBody: UpsertCartItemRequest,
    ): CancelablePromise<CartResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/cart',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Empty cart or, if productId is set, remove target cart item
     * Clear cart or, ir productId is set, removes a specific product from the authenticated user's cart. Returns the updated cart (can be empty)
     * @param requestBody
     * @returns CartResponse Cart cleared
     * @throws ApiError
     */
    public static clearCart(
        requestBody?: RemoveCartItemRequest,
    ): CancelablePromise<CartResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/cart',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Set cart item quantity
     * Sets the quantity of the cart line for the product identified by `{productId}` in the path. Functionally equivalent to `POST /cart`. Returns the updated cart.
     * @param productId Product identifier
     * @param requestBody
     * @returns CartResponse Updated cart
     * @throws ApiError
     */
    public static updateCartItemById(
        productId: Id,
        requestBody: UpdateCartItemByIdRequest,
    ): CancelablePromise<CartResponse> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/cart/{productId}',
            path: {
                'productId': productId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Remove item from cart
     * Removes the cart line for the product identified by `{productId}` in the path from the authenticated user's cart. Returns the updated cart.
     * @param productId Product identifier
     * @returns CartResponse Updated cart
     * @throws ApiError
     */
    public static removeCartItem(
        productId: Id,
    ): CancelablePromise<CartResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/cart/{productId}',
            path: {
                'productId': productId,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Get cart summary
     * Returns a lightweight summary of the authenticated user's cart.
     * @returns CartSummaryResponse Cart summary
     * @throws ApiError
     */
    public static getCartSummary(): CancelablePromise<CartSummaryResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/cart/summary',
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
}
