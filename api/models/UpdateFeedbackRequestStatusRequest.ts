/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type UpdateFeedbackRequestStatusRequest = {
    status?: UpdateFeedbackRequestStatusRequest.status;
    adminNotes?: string;
};
export namespace UpdateFeedbackRequestStatusRequest {
    export enum status {
        NEW = 'new',
        IN_PROGRESS = 'in_progress',
        RESOLVED = 'resolved',
        SPAM = 'spam',
    }
}

