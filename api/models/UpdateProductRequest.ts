/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Id } from './Id';
export type UpdateProductRequest = {
    id: Id;
    title: string;
    description?: string;
    price: number;
    active?: boolean;
    imageUrl?: string;
    categories?: Array<string>;
    tags?: Array<string>;
};

