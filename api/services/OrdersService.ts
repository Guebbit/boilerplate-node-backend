/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CheckoutRequest } from '../models/CheckoutRequest';
import type { CheckoutResponseEnvelope } from '../models/CheckoutResponseEnvelope';
import type { CreateOrderRequest } from '../models/CreateOrderRequest';
import type { DeleteOrderRequest } from '../models/DeleteOrderRequest';
import type { Email } from '../models/Email';
import type { Id } from '../models/Id';
import type { MessageResponse } from '../models/MessageResponse';
import type { OrderEnvelope } from '../models/OrderEnvelope';
import type { OrdersResponseEnvelope } from '../models/OrdersResponseEnvelope';
import type { Page } from '../models/Page';
import type { PageSize } from '../models/PageSize';
import type { SearchOrdersRequest } from '../models/SearchOrdersRequest';
import type { UpdateOrderByIdRequest } from '../models/UpdateOrderByIdRequest';
import type { UpdateOrderRequest } from '../models/UpdateOrderRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class OrdersService {
    /**
     * Checkout (place order from cart)
     * Converts the authenticated user's current cart into a new order. The cart is cleared upon success. An optional email address and order notes can be supplied in the request body. Returns the created order.
     * @param requestBody
     * @returns CheckoutResponseEnvelope Order created
     * @throws ApiError
     */
    public static checkout(
        requestBody?: CheckoutRequest,
    ): CancelablePromise<CheckoutResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/cart/checkout',
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
     * List orders (paginated)
     * Returns a paginated list of orders.
     * Non-admin users are automatically scoped to their own orders; the `userId` filter is ignored for non-admin callers.
     *
     * @param page 1-based page index
     * @param pageSize
     * @param id
     * @param userId
     * @param productId
     * @param email
     * @returns OrdersResponseEnvelope Orders page
     * @throws ApiError
     */
    public static listOrders(
        page?: Page,
        pageSize?: PageSize,
        id?: Id,
        userId?: Id,
        productId?: Id,
        email?: Email,
    ): CancelablePromise<OrdersResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/orders',
            query: {
                'page': page,
                'pageSize': pageSize,
                'id': id,
                'userId': userId,
                'productId': productId,
                'email': email,
            },
            errors: {
                401: `Unauthorized`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Create order
     * Creates a new order directly from the supplied payload.
     * @param requestBody
     * @returns OrderEnvelope Created order
     * @throws ApiError
     */
    public static createOrder(
        requestBody: CreateOrderRequest,
    ): CancelablePromise<OrderEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/orders',
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
     * Update order
     * Updates an existing order identified by id in the request body.
     * @param requestBody
     * @returns OrderEnvelope Updated order
     * @throws ApiError
     */
    public static updateOrder(
        requestBody: UpdateOrderRequest,
    ): CancelablePromise<OrderEnvelope> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/orders',
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
     * Delete order
     * Permanently removes the order identified by id.
     * @param requestBody
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteOrder(
        requestBody: DeleteOrderRequest,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/orders',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Search orders (DTO-friendly)
     * Searches and filters orders via a JSON request body. Functionally equivalent to `GET /orders`.
     * Non-admin users are automatically scoped to their own orders; the `userId` filter is ignored for non-admin callers.
     *
     * @param requestBody
     * @returns OrdersResponseEnvelope Orders search results
     * @throws ApiError
     */
    public static searchOrders(
        requestBody: SearchOrdersRequest,
    ): CancelablePromise<OrdersResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/orders/search',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Order details
     * Returns the full details of the order identified by `{id}`. Functionally equivalent to `GET /orders?id={id}`.
     * @param id Resource identifier
     * @returns OrderEnvelope Order
     * @throws ApiError
     */
    public static getOrderById(
        id: Id,
    ): CancelablePromise<OrderEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Edit order
     * Updates the order identified by `{id}` in the path.
     * @param id Resource identifier
     * @param requestBody
     * @returns OrderEnvelope Updated order
     * @throws ApiError
     */
    public static updateOrderById(
        id: Id,
        requestBody: UpdateOrderByIdRequest,
    ): CancelablePromise<OrderEnvelope> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
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
     * Delete order
     * Permanently removes the order identified by `id`.
     * @param id Resource identifier
     * @returns MessageResponse Success
     * @throws ApiError
     */
    public static deleteOrderById(
        id: Id,
    ): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/orders/{id}',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Download order invoice (PDF)
     * Generates and returns the invoice for the order identified by `{id}` as a binary PDF file. The client should save or stream the response with an appropriate `Content-Disposition` header.
     * @param id Resource identifier
     * @returns binary Invoice PDF
     * @throws ApiError
     */
    public static getOrderInvoice(
        id: Id,
    ): CancelablePromise<Blob> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/orders/{id}/invoice',
            path: {
                'id': id,
            },
            errors: {
                401: `Unauthorized`,
                404: `Resource not found`,
                500: `Internal server error`,
            },
        });
    }
}
