import type {
    SignupRequest,
    CreateUserRequest,
    UpdateUserRequest,
    UpdateUserByIdRequest,
    CreateProductRequest,
    UpdateProductRequest,
    UpdateProductByIdRequest,
} from '@api/api';
export * from '@api/api';

// Generic helper
export type WithFileUpload<T, K extends string = "imageUpload"> = T & {
    [P in K]?: File | Buffer;
};

// openapi doesn't generate multipart/form-data types
export type SignupRequestMultipart = WithFileUpload<SignupRequest>;
export type CreateUserRequestMultipart = WithFileUpload<CreateUserRequest>;
export type UpdateUserRequestMultipart = WithFileUpload<UpdateUserRequest>;
export type UpdateUserByIdRequestMultipart = WithFileUpload<UpdateUserByIdRequest>;
export type CreateProductRequestMultipart = WithFileUpload<CreateProductRequest>;
export type UpdateProductRequestMultipart = WithFileUpload<UpdateProductRequest>;
export type UpdateProductByIdRequestMultipart = WithFileUpload<UpdateProductByIdRequest>;