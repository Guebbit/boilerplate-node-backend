export * from './accountApi';
import { AccountApi } from './accountApi';
export * from './authApi';
import { AuthApi } from './authApi';
export * from './cartApi';
import { CartApi } from './cartApi';
export * from './ordersApi';
import { OrdersApi } from './ordersApi';
export * from './productsApi';
import { ProductsApi } from './productsApi';
export * from './usersApi';
import { UsersApi } from './usersApi';
import * as http from 'node:http';

export class HttpError extends Error {
    constructor(
        public response: http.IncomingMessage,
        public body: any,
        public statusCode?: number
    ) {
        super('HTTP request failed');
        this.name = 'HttpError';
    }
}

export { RequestFile } from '../model/models';

export const APIS = [AccountApi, AuthApi, CartApi, OrdersApi, ProductsApi, UsersApi];
