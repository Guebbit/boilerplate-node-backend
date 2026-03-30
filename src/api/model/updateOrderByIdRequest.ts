/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { CartItem } from './cartItem';

export interface UpdateOrderByIdRequest {
    /**
    * Updated order status
    */
    status?: UpdateOrderByIdRequest.StatusEnum;
    /**
    * Resource identifier
    */
    userId?: string;
    email?: string;
    items?: Array<CartItem>;
}

export namespace UpdateOrderByIdRequest {
    export enum StatusEnum {
        Pending = 'pending',
        Paid = 'paid',
        Processing = 'processing',
        Shipped = 'shipped',
        Delivered = 'delivered',
        Cancelled = 'cancelled'
    }
}
