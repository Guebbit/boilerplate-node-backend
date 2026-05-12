/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
import type { Page } from './Page';
import type { PageSize } from './PageSize';
import type { Text } from './Text';
export type SearchUsersRequest = {
    page?: Page;
    pageSize?: PageSize;
    text?: Text;
    id?: Id;
    email?: Email;
    username?: string;
    active?: boolean;
};

