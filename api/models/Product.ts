/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Id } from './Id';
export type Product = {
    id: Id;
    title: string;
    price: number;
    description?: string;
    active?: boolean;
    imageUrl?: string;
    categories?: Array<string>;
    tags?: Array<string>;
    createdAt?: string;
    updatedAt?: string;
    deletedAt?: string;
};

