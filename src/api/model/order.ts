/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { CartItem } from './cartItem';

export interface Order {
    /**
    * Resource identifier
    */
    id: string;
    /**
    * Resource identifier
    */
    userId: string;
    email: string;
    items: Array<CartItem>;
    total: number;
    /**
    * Optional order notes
    */
    notes?: string;
    status: Order.StatusEnum;
    createdAt?: Date;
    updatedAt?: Date;
}

export namespace Order {
    export enum StatusEnum {
        Pending = 'pending',
        Paid = 'paid',
        Processing = 'processing',
        Shipped = 'shipped',
        Delivered = 'delivered',
        Cancelled = 'cancelled'
    }
}
