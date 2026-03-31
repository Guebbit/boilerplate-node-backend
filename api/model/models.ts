import localVarRequest from 'request';

export * from './authTokens';
export * from './cartItem';
export * from './cartResponse';
export * from './cartSummaryResponse';
export * from './checkoutRequest';
export * from './checkoutResponse';
export * from './createOrderRequest';
export * from './createProductRequest';
export * from './createUserRequest';
export * from './deleteOrderRequest';
export * from './deleteProductRequest';
export * from './deleteUserRequest';
export * from './errorDetail';
export * from './errorResponse';
export * from './loginRequest';
export * from './messageResponse';
export * from './order';
export * from './ordersResponse';
export * from './paginationMeta';
export * from './passwordResetConfirmRequest';
export * from './passwordResetRequest';
export * from './product';
export * from './productsResponse';
export * from './refreshTokenResponse';
export * from './removeCartItemRequest';
export * from './searchOrdersRequest';
export * from './searchProductsRequest';
export * from './searchUsersRequest';
export * from './signupRequest';
export * from './updateCartItemByIdRequest';
export * from './updateOrderByIdRequest';
export * from './updateOrderRequest';
export * from './updateProductByIdRequest';
export * from './updateProductRequest';
export * from './updateProductRequestBody';
export * from './updateUserByIdRequest';
export * from './updateUserRequest';
export * from './upsertCartItemRequest';
export * from './user';
export * from './usersResponse';
export * from './validationErrorResponse';
export * from './validationErrorResponseAllOfErrors';

import * as fs from 'node:fs';

export interface RequestDetailedFile {
    value: Buffer;
    options?: {
        filename?: string;
        contentType?: string;
    };
}

export type RequestFile = string | Buffer | fs.ReadStream | RequestDetailedFile;

import { AuthTokens } from './authTokens';
import { CartItem } from './cartItem';
import { CartResponse } from './cartResponse';
import { CartSummaryResponse } from './cartSummaryResponse';
import { CheckoutRequest } from './checkoutRequest';
import { CheckoutResponse } from './checkoutResponse';
import { CreateOrderRequest } from './createOrderRequest';
import { CreateProductRequest } from './createProductRequest';
import { CreateUserRequest } from './createUserRequest';
import { DeleteOrderRequest } from './deleteOrderRequest';
import { DeleteProductRequest } from './deleteProductRequest';
import { DeleteUserRequest } from './deleteUserRequest';
import { ErrorDetail } from './errorDetail';
import { ErrorResponse } from './errorResponse';
import { LoginRequest } from './loginRequest';
import { MessageResponse } from './messageResponse';
import { Order } from './order';
import { OrdersResponse } from './ordersResponse';
import { PaginationMeta } from './paginationMeta';
import { PasswordResetConfirmRequest } from './passwordResetConfirmRequest';
import { PasswordResetRequest } from './passwordResetRequest';
import { Product } from './product';
import { ProductsResponse } from './productsResponse';
import { RefreshTokenResponse } from './refreshTokenResponse';
import { RemoveCartItemRequest } from './removeCartItemRequest';
import { SearchOrdersRequest } from './searchOrdersRequest';
import { SearchProductsRequest } from './searchProductsRequest';
import { SearchUsersRequest } from './searchUsersRequest';
import { SignupRequest } from './signupRequest';
import { UpdateCartItemByIdRequest } from './updateCartItemByIdRequest';
import { UpdateOrderByIdRequest } from './updateOrderByIdRequest';
import { UpdateOrderRequest } from './updateOrderRequest';
import { UpdateProductByIdRequest } from './updateProductByIdRequest';
import { UpdateProductRequest } from './updateProductRequest';
import { UpdateProductRequestBody } from './updateProductRequestBody';
import { UpdateUserByIdRequest } from './updateUserByIdRequest';
import { UpdateUserRequest } from './updateUserRequest';
import { UpsertCartItemRequest } from './upsertCartItemRequest';
import { User } from './user';
import { UsersResponse } from './usersResponse';
import { ValidationErrorResponse } from './validationErrorResponse';
import { ValidationErrorResponseAllOfErrors } from './validationErrorResponseAllOfErrors';

/* tslint:disable:no-unused-variable */
const primitives = new Set([
    'string',
    'boolean',
    'double',
    'integer',
    'long',
    'float',
    'number',
    'any'
]);

const enumsMap: { [index: string]: any } = {
    'Order.StatusEnum': Order.StatusEnum,
    'UpdateOrderByIdRequest.StatusEnum': UpdateOrderByIdRequest.StatusEnum,
    'UpdateOrderRequest.StatusEnum': UpdateOrderRequest.StatusEnum
};

const typeMap: { [index: string]: any } = {
    AuthTokens: AuthTokens,
    CartItem: CartItem,
    CartResponse: CartResponse,
    CartSummaryResponse: CartSummaryResponse,
    CheckoutRequest: CheckoutRequest,
    CheckoutResponse: CheckoutResponse,
    CreateOrderRequest: CreateOrderRequest,
    CreateProductRequest: CreateProductRequest,
    CreateUserRequest: CreateUserRequest,
    DeleteOrderRequest: DeleteOrderRequest,
    DeleteProductRequest: DeleteProductRequest,
    DeleteUserRequest: DeleteUserRequest,
    ErrorDetail: ErrorDetail,
    ErrorResponse: ErrorResponse,
    LoginRequest: LoginRequest,
    MessageResponse: MessageResponse,
    Order: Order,
    OrdersResponse: OrdersResponse,
    PaginationMeta: PaginationMeta,
    PasswordResetConfirmRequest: PasswordResetConfirmRequest,
    PasswordResetRequest: PasswordResetRequest,
    Product: Product,
    ProductsResponse: ProductsResponse,
    RefreshTokenResponse: RefreshTokenResponse,
    RemoveCartItemRequest: RemoveCartItemRequest,
    SearchOrdersRequest: SearchOrdersRequest,
    SearchProductsRequest: SearchProductsRequest,
    SearchUsersRequest: SearchUsersRequest,
    SignupRequest: SignupRequest,
    UpdateCartItemByIdRequest: UpdateCartItemByIdRequest,
    UpdateOrderByIdRequest: UpdateOrderByIdRequest,
    UpdateOrderRequest: UpdateOrderRequest,
    UpdateProductByIdRequest: UpdateProductByIdRequest,
    UpdateProductRequest: UpdateProductRequest,
    UpdateProductRequestBody: UpdateProductRequestBody,
    UpdateUserByIdRequest: UpdateUserByIdRequest,
    UpdateUserRequest: UpdateUserRequest,
    UpsertCartItemRequest: UpsertCartItemRequest,
    User: User,
    UsersResponse: UsersResponse,
    ValidationErrorResponse: ValidationErrorResponse,
    ValidationErrorResponseAllOfErrors: ValidationErrorResponseAllOfErrors
};

// Check if a string starts with another string without using es6 features
function startsWith(string_: string, match: string): boolean {
    return string_.slice(0, Math.max(0, match.length)) === match;
}

// Check if a string ends with another string without using es6 features
function endsWith(string_: string, match: string): boolean {
    return (
        string_.length >= match.length &&
        string_.slice(Math.max(0, string_.length - match.length)) === match
    );
}

const nullableSuffix = ' | null';
const optionalSuffix = ' | undefined';
const arrayPrefix = 'Array<';
const arraySuffix = '>';
const mapPrefix = '{ [key: string]: ';
const mapSuffix = '; }';

export class ObjectSerializer {
    public static findCorrectType(data: any, expectedType: string) {
        if (data == undefined) {
            return expectedType;
        } else if (primitives.has(expectedType.toLowerCase())) {
            return expectedType;
        } else if (expectedType === 'Date') {
            return expectedType;
        } else {
            if (enumsMap[expectedType]) {
                return expectedType;
            }

            if (!typeMap[expectedType]) {
                return expectedType; // w/e we don't know the type
            }

            // Check the discriminator
            const discriminatorProperty = typeMap[expectedType].discriminator;
            if (discriminatorProperty == undefined) {
                return expectedType; // the type does not have a discriminator. use it.
            } else {
                if (data[discriminatorProperty]) {
                    const discriminatorType = data[discriminatorProperty];
                    if (typeMap[discriminatorType]) {
                        return discriminatorType; // use the type given in the discriminator
                    } else {
                        return expectedType; // discriminator did not map to a type
                    }
                } else {
                    return expectedType; // discriminator was not present (or an empty string)
                }
            }
        }
    }

    public static serialize(data: any, type: string): any {
        if (data == undefined) {
            return data;
        } else if (primitives.has(type.toLowerCase())) {
            return data;
        } else if (endsWith(type, nullableSuffix)) {
            const subType: string = type.slice(0, -nullableSuffix.length); // Type | null => Type
            return ObjectSerializer.serialize(data, subType);
        } else if (endsWith(type, optionalSuffix)) {
            const subType: string = type.slice(0, -optionalSuffix.length); // Type | undefined => Type
            return ObjectSerializer.serialize(data, subType);
        } else if (startsWith(type, arrayPrefix)) {
            const subType: string = type.slice(arrayPrefix.length, -arraySuffix.length); // Array<Type> => Type
            const transformedData: any[] = [];
            for (const datum of data) {
                transformedData.push(ObjectSerializer.serialize(datum, subType));
            }
            return transformedData;
        } else if (startsWith(type, mapPrefix)) {
            const subType: string = type.slice(mapPrefix.length, -mapSuffix.length); // { [key: string]: Type; } => Type
            const transformedData: { [key: string]: any } = {};
            for (const key in data) {
                transformedData[key] = ObjectSerializer.serialize(data[key], subType);
            }
            return transformedData;
        } else if (type === 'Date') {
            return data.toISOString();
        } else {
            if (enumsMap[type]) {
                return data;
            }
            if (!typeMap[type]) {
                // in case we dont know the type
                return data;
            }

            // Get the actual type of this object
            type = this.findCorrectType(data, type);

            // get the map for the correct type.
            const attributeTypes = typeMap[type].getAttributeTypeMap();
            const instance: { [index: string]: any } = {};
            for (const attributeType of attributeTypes) {
                instance[attributeType.baseName] = ObjectSerializer.serialize(
                    data[attributeType.name],
                    attributeType.type
                );
            }
            return instance;
        }
    }

    public static deserialize(data: any, type: string): any {
        // polymorphism may change the actual type.
        type = ObjectSerializer.findCorrectType(data, type);
        if (data == undefined) {
            return data;
        } else if (primitives.has(type.toLowerCase())) {
            return data;
        } else if (endsWith(type, nullableSuffix)) {
            const subType: string = type.slice(0, -nullableSuffix.length); // Type | null => Type
            return ObjectSerializer.deserialize(data, subType);
        } else if (endsWith(type, optionalSuffix)) {
            const subType: string = type.slice(0, -optionalSuffix.length); // Type | undefined => Type
            return ObjectSerializer.deserialize(data, subType);
        } else if (startsWith(type, arrayPrefix)) {
            const subType: string = type.slice(arrayPrefix.length, -arraySuffix.length); // Array<Type> => Type
            const transformedData: any[] = [];
            for (const datum of data) {
                transformedData.push(ObjectSerializer.deserialize(datum, subType));
            }
            return transformedData;
        } else if (startsWith(type, mapPrefix)) {
            const subType: string = type.slice(mapPrefix.length, -mapSuffix.length); // { [key: string]: Type; } => Type
            const transformedData: { [key: string]: any } = {};
            for (const key in data) {
                transformedData[key] = ObjectSerializer.deserialize(data[key], subType);
            }
            return transformedData;
        } else if (type === 'Date') {
            return new Date(data);
        } else {
            if (enumsMap[type]) {
                // is Enum
                return data;
            }

            if (!typeMap[type]) {
                // dont know the type
                return data;
            }
            const instance = new typeMap[type]();
            const attributeTypes = typeMap[type].getAttributeTypeMap();
            for (const attributeType of attributeTypes) {
                instance[attributeType.name] = ObjectSerializer.deserialize(
                    data[attributeType.baseName],
                    attributeType.type
                );
            }
            return instance;
        }
    }
}

export interface Authentication {
    /**
     * Apply authentication settings to header and query params.
     */
    applyToRequest(requestOptions: localVarRequest.Options): Promise<void> | void;
}

export class HttpBasicAuth implements Authentication {
    public username: string = '';
    public password: string = '';

    applyToRequest(requestOptions: localVarRequest.Options): void {
        requestOptions.auth = {
            username: this.username,
            password: this.password
        };
    }
}

export class HttpBearerAuth implements Authentication {
    public accessToken: string | (() => string) = '';

    applyToRequest(requestOptions: localVarRequest.Options): void {
        if (requestOptions && requestOptions.headers) {
            const accessToken =
                typeof this.accessToken === 'function' ? this.accessToken() : this.accessToken;
            requestOptions.headers['Authorization'] = 'Bearer ' + accessToken;
        }
    }
}

export class ApiKeyAuth implements Authentication {
    public apiKey: string = '';

    constructor(
        private location: string,
        private parameterName: string
    ) {}

    applyToRequest(requestOptions: localVarRequest.Options): void {
        if (this.location == 'query') {
            (<any>requestOptions.qs)[this.paramName] = this.apiKey;
        } else if (this.location == 'header' && requestOptions && requestOptions.headers) {
            requestOptions.headers[this.paramName] = this.apiKey;
        } else if (this.location == 'cookie' && requestOptions && requestOptions.headers) {
            if (requestOptions.headers['Cookie']) {
                requestOptions.headers['Cookie'] +=
                    '; ' + this.paramName + '=' + encodeURIComponent(this.apiKey);
            } else {
                requestOptions.headers['Cookie'] =
                    this.paramName + '=' + encodeURIComponent(this.apiKey);
            }
        }
    }
}

export class OAuth implements Authentication {
    public accessToken: string = '';

    applyToRequest(requestOptions: localVarRequest.Options): void {
        if (requestOptions && requestOptions.headers) {
            requestOptions.headers['Authorization'] = 'Bearer ' + this.accessToken;
        }
    }
}

export class VoidAuth implements Authentication {
    public username: string = '';
    public password: string = '';

    applyToRequest(_: localVarRequest.Options): void {
        // Do nothing
    }
}

export type Interceptor = (requestOptions: localVarRequest.Options) => Promise<void> | void;
