/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

import { PaginationMeta } from './paginationMeta';
import { User } from './user';

export interface UsersResponse {
    items: Array<User>;
    meta: PaginationMeta;
}

