/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Page } from './Page';
import type { PageSize } from './PageSize';
import type { Text } from './Text';
export type SearchFeedbackRequestsRequest = {
    page?: Page;
    pageSize?: PageSize;
    text?: Text;
    status?: SearchFeedbackRequestsRequest.status;
    email?: Email;
};
export namespace SearchFeedbackRequestsRequest {
    export enum status {
        NEW = 'new',
        IN_PROGRESS = 'in_progress',
        RESOLVED = 'resolved',
        SPAM = 'spam',
    }
}

