/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
import type { OrderItem } from './OrderItem';
export type Order = {
    id: Id;
    userId: Id;
    email: Email;
    items: Array<OrderItem>;
    total: number;
    /**
     * Optional order notes
     */
    notes?: string;
    status: Order.status;
    createdAt?: string;
    updatedAt?: string;
};
export namespace Order {
    export enum status {
        PENDING = 'pending',
        PAID = 'paid',
        PROCESSING = 'processing',
        SHIPPED = 'shipped',
        DELIVERED = 'delivered',
        CANCELLED = 'cancelled',
    }
}

