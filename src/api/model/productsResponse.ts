/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { PaginationMeta } from './paginationMeta';
import { Product } from './product';

export interface ProductsResponse {
    items: Array<Product>;
    meta: PaginationMeta;
}

