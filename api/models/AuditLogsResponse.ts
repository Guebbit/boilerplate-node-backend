/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuditEventItem } from './AuditEventItem';
export type AuditLogsResponse = {
    success: true;
    data: {
        items: Array<AuditEventItem>;
        total: number;
    };
};

