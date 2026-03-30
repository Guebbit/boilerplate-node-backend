/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { CartItem } from './cartItem';

/**
* Create a new order.
*/
export interface CreateOrderRequest {
    /**
    * Resource identifier
    */
    userId: string;
    email: string;
    items: Array<CartItem>;
}

