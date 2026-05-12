/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateProductByIdRequestMultipart = {
    title: string;
    description?: string;
    price: number;
    active?: boolean;
    /**
     * Optional product image
     */
    imageUpload?: Blob;
    categories?: Array<string>;
    tags?: Array<string>;
};

