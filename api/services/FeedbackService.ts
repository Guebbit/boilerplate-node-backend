/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateFeedbackRequest } from '../models/CreateFeedbackRequest';
import type { FeedbackRequestEnvelope } from '../models/FeedbackRequestEnvelope';
import type { FeedbackRequestsResponseEnvelope } from '../models/FeedbackRequestsResponseEnvelope';
import type { Id } from '../models/Id';
import type { SearchFeedbackRequestsRequest } from '../models/SearchFeedbackRequestsRequest';
import type { UpdateFeedbackRequestStatusRequest } from '../models/UpdateFeedbackRequestStatusRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class FeedbackService {
    /**
     * Submit contact request
     * Creates a user feedback/contact request and notifies admins via email.
     * @param requestBody
     * @returns FeedbackRequestEnvelope Created feedback request
     * @throws ApiError
     */
    public static createFeedbackRequest(
        requestBody: CreateFeedbackRequest,
    ): CancelablePromise<FeedbackRequestEnvelope> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/feedback/contact',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * List feedback requests
     * Returns feedback/contact requests for admin review.
     * @param requestBody
     * @returns FeedbackRequestsResponseEnvelope Feedback request list
     * @throws ApiError
     */
    public static listFeedbackRequests(
        requestBody?: SearchFeedbackRequestsRequest,
    ): CancelablePromise<FeedbackRequestsResponseEnvelope> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/feedback',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                500: `Internal server error`,
            },
        });
    }
    /**
     * Update feedback request status
     * Updates status/notes of a feedback request.
     * @param id Resource identifier
     * @param requestBody
     * @returns FeedbackRequestEnvelope Updated feedback request
     * @throws ApiError
     */
    public static updateFeedbackRequestStatus(
        id: Id,
        requestBody: UpdateFeedbackRequestStatusRequest,
    ): CancelablePromise<FeedbackRequestEnvelope> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/feedback/{id}',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Resource not found`,
                422: `Validation failed`,
                500: `Internal server error`,
            },
        });
    }
}
