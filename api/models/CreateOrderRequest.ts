/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CartItem } from './CartItem';
import type { Email } from './Email';
import type { Id } from './Id';
/**
 * Create a new order.
 */
export type CreateOrderRequest = {
    userId: Id;
    email: Email;
    items: Array<CartItem>;
};

