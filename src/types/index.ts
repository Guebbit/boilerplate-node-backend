export * from '@api/index';

// Re-export generated AsyncAPI types so consumers use a single import path.
export * from './asyncapi';

// Auth context DTO (DIP: transport-safe user representation)
export type { IAuthContext } from './auth-context';

/*
 * DO NOT REMOVE — source of truth and common contract between FE and BE.
 * These types are generated from openapi.yaml via `npm run genapi` and re-exported above.
 * DeleteOrderRequest, DeleteProductRequest, DeleteUserRequest,
 * TokenPathParam,
 * UpdateOrderRequest, UpdateProductRequest, UpdateProductRequestMultipart,
 * UpdateUserRequest, UpdateUserRequestMultipart
 */
