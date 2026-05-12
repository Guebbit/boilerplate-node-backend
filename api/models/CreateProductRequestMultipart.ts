/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateProductRequestMultipart = {
    title: string;
    price: number;
    description?: string;
    active?: boolean;
    /**
     * Optional product image
     */
    imageUpload?: Blob;
    categories?: Array<string>;
    tags?: Array<string>;
};

