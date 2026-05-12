/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CartItem } from './CartItem';
import type { Email } from './Email';
import type { Id } from './Id';
export type UpdateOrderRequest = {
    id: Id;
    /**
     * Updated order status
     */
    status?: UpdateOrderRequest.status;
    userId?: Id;
    email?: Email;
    items?: Array<CartItem>;
};
export namespace UpdateOrderRequest {
    /**
     * Updated order status
     */
    export enum status {
        PENDING = 'pending',
        PAID = 'paid',
        PROCESSING = 'processing',
        SHIPPED = 'shipped',
        DELIVERED = 'delivered',
        CANCELLED = 'cancelled',
    }
}

