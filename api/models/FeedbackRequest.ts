/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { Email } from './Email';
import type { Id } from './Id';
export type FeedbackRequest = {
    id: Id;
    name?: string;
    email: Email;
    subject: string;
    message: string;
    status: FeedbackRequest.status;
    adminNotes?: string;
    respondedAt?: string;
    createdAt: string;
    updatedAt?: string;
};
export namespace FeedbackRequest {
    export enum status {
        NEW = 'new',
        IN_PROGRESS = 'in_progress',
        RESOLVED = 'resolved',
        SPAM = 'spam',
    }
}

