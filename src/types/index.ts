import type {
    SignupRequest,
    CreateUserRequest,
    UpdateUserByIdRequest,
    CreateProductRequest,
    UpdateProductByIdRequest
} from '@api/index';
export * from '@api/index';

// Re-export generated AsyncAPI types so consumers use a single import path.
export * from './asyncapi';

// Auth context DTO (DIP: transport-safe user representation)
export type { IAuthContext } from './auth-context';

// Generic helper
export type WithFileUpload<T, K extends string = 'imageUpload'> = T & {
    [P in K]?: File | Buffer;
};

// openapi doesn't generate multipart/form-data types
export type SignupRequestMultipart = WithFileUpload<SignupRequest>;
export type CreateUserRequestMultipart = WithFileUpload<CreateUserRequest>;
export type UpdateUserByIdRequestMultipart = WithFileUpload<UpdateUserByIdRequest>;
export type CreateProductRequestMultipart = WithFileUpload<CreateProductRequest>;
export type UpdateProductByIdRequestMultipart = WithFileUpload<UpdateProductByIdRequest>;
