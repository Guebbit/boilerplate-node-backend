/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Id } from './Id';
export type UpdateProductRequestMultipart = {
    id: Id;
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

