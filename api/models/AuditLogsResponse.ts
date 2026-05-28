/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuditEventItem } from './AuditEventItem';
export type AuditLogsResponse = {
    success: boolean;
    data: {
        items: Array<AuditEventItem>;
        total: number;
    };
};

