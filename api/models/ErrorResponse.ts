/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ErrorResponse = {
    success: boolean;
    status: number;
    /**
     * Technical error code or description
     */
    message: string;
    /**
     * User-friendly error messages
     */
    errors: Array<string>;
};

