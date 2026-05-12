/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
import type { Page } from './Page';
import type { PageSize } from './PageSize';
export type SearchOrdersRequest = {
    page?: Page;
    pageSize?: PageSize;
    id?: Id;
    userId?: Id;
    productId?: Id;
    email?: Email;
};

