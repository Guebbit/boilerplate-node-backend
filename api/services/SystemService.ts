/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MessageResponse } from '../models/MessageResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class SystemService {
    /**
     * API health check
     * Public ping endpoint. Returns a simple liveness indicator confirming the API process is running.
     * @returns MessageResponse API is running
     * @throws ApiError
     */
    public static getHealth(): CancelablePromise<MessageResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/',
        });
    }
}
